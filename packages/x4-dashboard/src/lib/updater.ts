/**
 * Over-the-air update state for the desktop app.
 *
 * Wraps Tauri's updater plugin: on startup (in the desktop shell only) it asks GitHub
 * Releases whether a newer signed bundle exists, and exposes a one-click download+install
 * that relaunches the app. In a plain browser (dev server, or the SPA opened outside the
 * Tauri shell) everything no-ops, so the UI simply never shows an update prompt.
 *
 * Note: only updater-capable bundles self-update (Windows NSIS, Linux AppImage). A `.deb`
 * install can't update in place — there the prompt links out to the release instead.
 */
import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | "idle" // no update, or not running in the desktop shell
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "ready" // installed; awaiting relaunch
  | "error";

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface AppUpdateState {
  status: UpdateStatus;
  /** Version string of the available update, when known. */
  newVersion: string | null;
  /** 0–100 while downloading, else null. */
  progress: number | null;
  error: string | null;
  /** Download, install, and relaunch into the new version. */
  install: () => Promise<void>;
  /** Dismiss the prompt for this session. */
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdateState {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;

    (async () => {
      setStatus("checking");
      try {
        const found = await check();
        if (cancelled) return;
        if (found?.available) {
          setUpdate(found);
          setNewVersion(found.version);
          setStatus("available");
        } else {
          // No update, or running an unsigned build where check() no-ops.
          console.log("update check: no update available");
          setStatus("idle");
        }
      } catch (e) {
        // The updater throws when no published release exists yet — that's normal,
        // not an error.  Only surface genuine failures (network down, DNS, etc.).
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          // "could not fetch a valid release" = no published release with updater
          // metadata.  Expected on a fresh repo or when the latest release is still
          // a draft.
          const isMissingRelease =
            msg.includes("could not fetch") || msg.includes("valid release");
          if (isMissingRelease) {
            console.log("update check: no published release yet");
            setStatus("idle");
          } else {
            setError(msg);
            setStatus("error");
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setError(null);
    setStatus("downloading");

    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            setProgress(0);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setProgress(total > 0 ? Math.round((downloaded / total) * 100) : null);
            break;
          case "Finished":
            setProgress(100);
            setStatus("installing");
            break;
        }
      });
      setStatus("ready");
      // Relaunch into the freshly installed version.
      await relaunch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [update]);

  const dismiss = useCallback(() => {
    setStatus("idle");
  }, []);

  return { status, newVersion, progress, error, install, dismiss };
}
