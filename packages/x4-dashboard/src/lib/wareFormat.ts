// Shared formatting helpers for the trade / equipment / inventory pages.

export type WareCategory = "commodity" | "equipment" | "inventory" | "ship";

export function fmtCr(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toLocaleString()} Cr`;
}

export function fmtNum(n: number | null | undefined, suffix = ""): string {
  return n == null ? "—" : `${n.toLocaleString()}${suffix}`;
}

export function fmtSeconds(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// Turn an internal id ("engine_arg_m_allround_01_mk1_macro") into a readable label.
export function prettyId(s: string): string {
  return s
    .replace(/_macro$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
