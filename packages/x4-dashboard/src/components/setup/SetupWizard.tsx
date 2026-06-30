import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderOpen, CheckCircle2, AlertCircle, Loader2, Circle, Rocket } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";
import {
  type PathValidation,
  type SetupStatus,
  STAGES,
  isTauri,
  pickFolder,
  saveConfig,
  startInitialize,
  validatePath,
  discoverPaths,
} from "../../lib/setup";

/**
 * First-run setup. Two phases: choose the game folders, then watch the static
 * database build. The parent gate decides when to show this (until static.db is
 * populated) and keeps `status` fresh by polling — this component is presentation
 * plus the three setup mutations.
 */
export function SetupWizard({ status }: { status: SetupStatus | undefined }) {
  const init = status?.init;
  const inProgress = !!init && init.running;
  const initError = init?.stage === "error" ? init.error : null;

  if (inProgress) return <InitProgress init={init} />;
  return <ConfigureStep status={status} initError={initError} />;
}

// ── Phase 1: choose folders ──────────────────────────────────────────────────────

function ConfigureStep({ status, initError }: { status: SetupStatus | undefined; initError: string | null }) {
  const qc = useQueryClient();
  const [install, setInstall] = useState(status?.install_path ?? "");
  const [save, setSave] = useState(status?.save_path ?? "");
  const [installVal, setInstallVal] = useState<PathValidation | null>(null);
  const [saveVal, setSaveVal] = useState<PathValidation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [forceCheck, setForceCheck] = useState(0);

  useEffect(() => {
    if (!status?.install_path && !status?.save_path) {
      setIsScanning(true);
      discoverPaths()
        .then((res) => {
          if (res.install_path) setInstall(res.install_path);
          if (res.save_path) setSave(res.save_path);
          if (res.install_path || res.save_path) {
            setForceCheck((c) => c + 1);
          }
        })
        .finally(() => {
          setIsScanning(false);
        });
    }
  }, [status?.install_path, status?.save_path]);

  const canBuild = installVal?.ok === true && saveVal?.ok === true && !submitting;

  async function build() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await saveConfig(install, save.trim());
      await startInitialize();
      // Flip the gate into the progress phase immediately.
      await qc.invalidateQueries({ queryKey: ["setup-status"] });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Shell
      title="Welcome to X4 Companion"
      subtitle={
        isScanning ? "Scanning for game files..." : (
          <>
            Point the app at your X4 game files to get started.
            <br />
            Everything runs locally.
          </>
        )
      }
      icon={
        <div className="mb-2">
          <img src="/logo.svg" alt="X4 Companion Logo" className="w-12 h-12" />
        </div>
      }
    >
      <FolderField
        label="Game install folder"
        hint="The folder containing X4.exe and the .cat archives."
        value={install}
        onChange={setInstall}
        onValidated={setInstallVal}
        kind="install"
        forceCheck={forceCheck}
      />
      <FolderField
        label="Save folder"
        hint="The folder with your *.xml.gz saves (…/Egosoft/X4/<id>/save)."
        value={save}
        onChange={setSave}
        onValidated={setSaveVal}
        kind="save"
        forceCheck={forceCheck}
      />

      {initError && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="font-mono text-xs break-all">{initError}</span>
        </p>
      )}
      {submitError && (
        <p className="flex items-center gap-2 text-sm text-destructive justify-center">
          <AlertCircle className="w-4 h-4" /> {submitError}
        </p>
      )}

      <div className="flex justify-center pt-4 pb-2">
        <Button onClick={build} disabled={!canBuild} className="gap-2 px-8">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          Initialize
        </Button>
      </div>
    </Shell>
  );
}

function FolderField({
  label,
  hint,
  value,
  onChange,
  onValidated,
  kind,
  optional,
  forceCheck,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onValidated: (v: PathValidation | null) => void;
  kind: "install" | "save";
  optional?: boolean;
  forceCheck?: number;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PathValidation | null>(null);

  useEffect(() => {
    if (forceCheck) check(value);
  }, [forceCheck]);

  useEffect(() => {
    const t = setTimeout(() => check(value), 500);
    return () => clearTimeout(t);
  }, [value]);

  async function check(path: string) {
    if (!path.trim()) {
      setResult(null);
      onValidated(null);
      return;
    }
    setChecking(true);
    try {
      const v = await validatePath(kind, path);
      setResult(v);
      onValidated(v);
    } finally {
      setChecking(false);
    }
  }

  async function browse() {
    const picked = await pickFolder(label);
    if (picked) {
      onChange(picked);
      await check(picked);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">
        {label}
        {optional && <span className="ml-2 text-xs text-muted-foreground">(optional)</span>}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={value}
            placeholder={kind === "install" ? "C:\\Program Files\\Steam\\...\\X4 Foundations" : "C:\\Users\\...\\Documents\\Egosoft\\X4\\<id>\\save"}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => check(e.target.value)}
            className={cn("transition-colors pr-8", result?.ok && "border-emerald-500")}
          />
          {result?.ok && (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2 animate-in fade-in zoom-in duration-300" />
          )}
        </div>
        {isTauri() && (
          <Button type="button" variant="outline" onClick={browse} className="shrink-0 gap-2">
            <FolderOpen className="w-4 h-4" /> Browse
          </Button>
        )}
      </div>
      <p className="min-h-[1rem] text-xs flex items-center gap-1.5">
        {checking ? (
          <span className="text-muted-foreground">Checking…</span>
        ) : result ? (
          <span className={cn("flex items-center gap-1.5", result.ok ? "text-emerald-500" : "text-destructive")}>
            {result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {result.detail}
          </span>
        ) : (
          <span className="text-muted-foreground">{hint}</span>
        )}
      </p>
    </div>
  );
}

// ── Phase 2: building ────────────────────────────────────────────────────────────

function InitProgress({ init }: { init: SetupStatus["init"] }) {
  const currentIdx = STAGES.findIndex((s) => s.key === init.stage);
  const isError = init.stage === "error";

  return (
    <Shell
      title="Building game database"
      subtitle="This runs once. Leave it open while it works."
    >
      <div className="flex flex-col gap-4 py-2">
        {STAGES.map((stage, idx) => {
          const isActive = stage.key === init.stage;
          const isCompleted = currentIdx >= 0 && idx < currentIdx;
          const isPending = currentIdx >= 0 && idx > currentIdx;
          // When we're in "done", all stages show completed.
          const showCompleted = isCompleted || init.stage === "done";

          return (
            <div key={stage.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                {/* Status indicator */}
                {showCompleted ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                ) : isError ? (
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground/30 shrink-0" />
                )}

                {/* Stage label */}
                <span
                  className={cn(
                    "text-sm font-medium transition-colors",
                    showCompleted && "text-emerald-600",
                    isActive && "text-foreground",
                    isPending && "text-muted-foreground/40",
                    isError && "text-destructive"
                  )}
                >
                  {stage.label}
                </span>
              </div>

              {/* Within-stage progress bar (active stage only) */}
              {isActive && (
                <div className="ml-8">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${Math.max(2, Math.round(init.progress * 100))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Detail text */}
        {init.detail && (
          <p className="text-xs text-muted-foreground text-center animate-pulse mt-2 min-h-[16px]">
            {init.detail}
          </p>
        )}
      </div>
    </Shell>
  );
}

// ── Shared frame ─────────────────────────────────────────────────────────────────

function Shell({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-lg border bg-card p-8 shadow-lg animate-in fade-in zoom-in-95 duration-200">
        <div className="mb-6 flex flex-col items-center text-center gap-2">
          {icon}
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
