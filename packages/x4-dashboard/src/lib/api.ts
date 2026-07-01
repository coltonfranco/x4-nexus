/**
 * Thin fetch wrapper shared by every route/hook — centralizes response parsing
 * and error handling instead of each call site re-deriving
 * `fetch(url).then(r => r.json())` (previously duplicated ~150 times with
 * inconsistent error handling). Not auto-generated — unlike `apiClient.ts`.
 */

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** GET, throwing on a non-ok response. */
export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(path, init).then((r) => handle<T>(r));
}

/** GET that resolves to `null` on a non-ok response instead of throwing —
 *  for endpoints that 404 until a save is ingested (e.g. `/player`). */
export function apiGetOrNull<T>(path: string, init?: RequestInit): Promise<T | null> {
  return fetch(path, init).then((r) => (r.ok ? (r.json() as Promise<T>) : null));
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return fetch(path, jsonInit("POST", body)).then((r) => handle<T>(r));
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return fetch(path, jsonInit("PUT", body)).then((r) => handle<T>(r));
}

export async function apiDelete(path: string): Promise<void> {
  const r = await fetch(path, { method: "DELETE" });
  if (!r.ok && r.status !== 204) throw new Error(`Delete failed (${r.status})`);
}
