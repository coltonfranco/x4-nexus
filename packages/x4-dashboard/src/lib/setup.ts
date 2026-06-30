/**
 * First-run setup client.
 *
 * Plain fetch (not the generated apiClient) so the setup flow has zero coupling to the
 * static schema — it must work before any data exists. Folder pickers use the native
 * Tauri dialog when running inside the desktop shell, and fall back to a typed path
 * input in a plain browser (dev at :5173).
 */

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


export async function getSetupStatus(): Promise<SetupStatus> {
  const r = await fetch("/api/v1/setup/status");
  if (!r.ok) throw new Error(`setup status ${r.status}`);
  return r.json();
}

export async function discoverPaths(): Promise<DiscoverPathsResponse> {
  const r = await fetch("/api/v1/setup/discover");
  if (!r.ok) throw new Error(`discover paths ${r.status}`);
  return r.json();
}


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

export async function saveConfig(
  installPath: string,
  savePath: string
): Promise<SetupStatus> {
  const r = await fetch("/api/v1/setup/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ install_path: installPath, save_path: savePath }),
  });
  if (!r.ok) throw new Error(`save config ${r.status}`);
  return r.json();
}

export async function startInitialize(): Promise<SetupStatus> {
  const r = await fetch("/api/v1/setup/initialize", { method: "POST" });
  if (!r.ok) throw new Error(`initialize ${r.status}`);
  return r.json();
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
