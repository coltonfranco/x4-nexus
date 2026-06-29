import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderOpen, CheckCircle2, AlertCircle, Loader2, Database } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";
import {
  type PathValidation,
  type SetupStatus,
  isTauri,
  pickFolder,
  saveConfig,
  startInitialize,
  validatePath,
} from "../../lib/setup";

/**
 * First-run setup. Two phases: choose the game folders, then watch the static
 * database build. The parent gate decides when to show this (until static.db is
 * populated) and keeps `status` fresh by polling — this component is presentation
 * plus the three setup mutations.
 */
export function SetupWizard({ status }: { status: SetupStatus | undefined }) {
  const qc = useQueryClient();
  const init = status?.init;
  const inProgress = !!init && (init.running || init.stage === "error");

  if (inProgress) return <InitProgress init={init} onRetry={() => qc.invalidateQueries()} />;
  return <ConfigureStep status={status} />;
}

// ── Phase 1: choose folders ──────────────────────────────────────────────────────

function ConfigureStep({ status }: { status: SetupStatus | undefined }) {
  const qc = useQueryClient();
  const [install, setInstall] = useState(status?.install_path ?? "");
  const [save, setSave] = useState(status?.save_path ?? "");
  const [installVal, setInstallVal] = useState<PathValidation | null>(null);
  const [saveVal, setSaveVal] = useState<PathValidation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canBuild = installVal?.ok === true && !submitting;

  async function build() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await saveConfig(install, save.trim() ? save : null);
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
      subtitle="Point the app at your X4 game files to get started. Everything runs locally."
    >
      <FolderField
        label="Game install folder"
        hint="The folder containing X4.exe and the .cat archives."
        value={install}
        onChange={setInstall}
        onValidated={setInstallVal}
        kind="install"
      />
      <FolderField
        label="Save folder"
        optional
        hint="The folder with your *.xml.gz saves (…/Egosoft/X4/<id>/save). You can add this later."
        value={save}
        onChange={setSave}
        onValidated={setSaveVal}
        kind="save"
      />

      {submitError && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" /> {submitError}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-muted-foreground">
          {saveVal && !saveVal.ok && save.trim()
            ? saveVal.detail
            : "The first build extracts ~7,000 game files and takes a few minutes."}
        </p>
        <Button onClick={build} disabled={!canBuild} className="gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          Build database
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
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onValidated: (v: PathValidation | null) => void;
  kind: "install" | "save";
  optional?: boolean;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PathValidation | null>(null);

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
        <Input
          value={value}
          placeholder={kind === "install" ? "C:\\Program Files\\Steam\\...\\X4 Foundations" : ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => check(e.target.value)}
        />
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

function InitProgress({ init, onRetry }: { init: SetupStatus["init"]; onRetry: () => void }) {
  const failed = init.stage === "error";
  return (
    <Shell
      title={failed ? "Setup failed" : "Building game database"}
      subtitle={failed ? "The build didn't finish — see the error below." : "This runs once. Leave it open while it works."}
    >
      {failed ? (
        <>
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="font-mono text-xs break-all">{init.error}</span>
          </p>
          <Button variant="outline" onClick={onRetry} className="self-start">
            Back to setup
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>{init.label}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.round(init.progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </Shell>
  );
}

// ── Shared frame ─────────────────────────────────────────────────────────────────

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-lg border bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
