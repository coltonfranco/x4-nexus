import { Download, RefreshCw, X, AlertTriangle } from "lucide-react";
import { useAppUpdate } from "../lib/updater";
import { cn } from "../lib/utils";

/**
 * Bottom-of-sidebar prompt that appears when a newer desktop release is available.
 * Renders nothing in the browser or when the app is up to date. See lib/updater.ts.
 */
export function UpdateNotifier() {
  const { status, newVersion, progress, error, install, dismiss } = useAppUpdate();

  if (status === "idle" || status === "checking") return null;

  const busy = status === "downloading" || status === "installing" || status === "ready";

  return (
    <div className="border-t border-border bg-card px-3 py-2.5 select-none">
      {status === "available" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">Update available</p>
              {newVersion && (
                <p className="truncate text-[11px] text-muted-foreground">Version {newVersion}</p>
              )}
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={install}
            className="w-full rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            Update &amp; restart
          </button>
        </div>
      )}

      {busy && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            <p className="text-xs font-medium text-foreground">
              {status === "downloading" && (progress != null ? `Downloading… ${progress}%` : "Downloading…")}
              {status === "installing" && "Installing…"}
              {status === "ready" && "Restarting…"}
            </p>
          </div>
          <div className="h-1 w-full overflow-hidden rounded bg-muted">
            <div
              className={cn(
                "h-full bg-primary transition-all duration-200",
                progress == null && "animate-pulse w-full",
              )}
              style={progress != null ? { width: `${progress}%` } : undefined}
            />
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="min-w-0 flex-1 text-xs font-medium text-foreground">Update failed</p>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {error && <p className="truncate text-[11px] text-muted-foreground" title={error}>{error}</p>}
          <button
            onClick={install}
            className="w-full rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
