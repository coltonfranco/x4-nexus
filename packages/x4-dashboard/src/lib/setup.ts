/**
 * First-run setup client.
 *
 * Uses the shared api.ts wrapper (not the generated apiClient) so the setup flow has zero
 * coupling to the static schema — it must work before any data exists. Folder pickers use
 * the native Tauri dialog when running inside the desktop shell, and fall back to a typed
 * path input in a plain browser (dev at :5173).
 */

import { apiGet, apiPost } from "./api";

export type InitStatus = {
  stage: string;
  label: string;
  progress: number; // 0..1 within the current stage
  running: boolean;
  error: string | null;
  detail: string | null;
};

/** Ordered build stages — mirrors the backend's BUILD_STAGES list. */
export const STAGES = [
  { key: "datalake", label: "Extracting game archives" },
  { key: "static", label: "Building static database" },
  { key: "icons", label: "Generating image assets" },
  { key: "dynamic", label: "Ingesting current save" },
] as const;

/** Resolve the display label for a stage key (including idle/done/error). */
export function stageLabel(stage: string): string {
  const found = STAGES.find((s) => s.key === stage);
  return found?.label ?? stage;
}

export type SetupStatus = {
  configured: boolean;
  install_path: string | null;
  save_path: string | null;
  static_ready: boolean;
  needs_setup: boolean;
  init: InitStatus;
};

export type PathValidation = {
  ok: boolean;
  detail: string;
  found: number;
};

export type DiscoverPathsResponse = {
  install_path: string | null;
  save_path: string | null;
};


export function getSetupStatus(): Promise<SetupStatus> {
  return apiGet<SetupStatus>("/api/v1/setup/status");
}

export function discoverPaths(): Promise<DiscoverPathsResponse> {
  return apiGet<DiscoverPathsResponse>("/api/v1/setup/discover");
}


// Raw fetch: the endpoint always responds 200 with a { ok, detail } validation result — it
// never signals failure via HTTP status, so an ok-check (as apiPost does) would be wrong here.
export async function validatePath(
  kind: "install" | "save",
  path: string
): Promise<PathValidation> {
  const r = await fetch("/api/v1/setup/validate-path", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, path }),
  });
  return r.json();
}

export function saveConfig(
  installPath: string,
  savePath: string
): Promise<SetupStatus> {
  return apiPost<SetupStatus>("/api/v1/setup/config", {
    install_path: installPath,
    save_path: savePath,
  });
}

export function startInitialize(): Promise<SetupStatus> {
  return apiPost<SetupStatus>("/api/v1/setup/initialize");
}

/** Wipe game-derived data and rebuild from scratch (preserves saved station designs). */
export function resetGameData(): Promise<SetupStatus> {
  return apiPost<SetupStatus>("/api/v1/setup/reset");
}

// ── Native folder picker (Tauri) with a browser fallback ─────────────────────────

declare global {
  interface Window {
    __TAURI__?: {
      dialog?: {
        open: (opts: {
          directory?: boolean;
          title?: string;
          multiple?: boolean;
        }) => Promise<string | string[] | null>;
      };
    };
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI__?.dialog;
}

/** Open a native folder picker; returns the chosen path, or null if unavailable/cancelled. */
export async function pickFolder(title: string): Promise<string | null> {
  const dialog = window.__TAURI__?.dialog;
  if (!dialog) return null;
  const picked = await dialog.open({ directory: true, multiple: false, title });
  return typeof picked === "string" ? picked : null;
}
