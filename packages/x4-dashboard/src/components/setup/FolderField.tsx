import { useEffect, useState } from "react";
import { FolderOpen, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";
import { type PathValidation, isTauri, pickFolder, validatePath } from "../../lib/setup";

/**
 * A validated folder input with a native (Tauri) browse button. Validates the path
 * against the backend on a 500ms debounce, on blur, and whenever `forceCheck` bumps.
 * Shared by the first-run SetupWizard and the Advanced settings "Reload game data" flow.
 */
export function FolderField({
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
