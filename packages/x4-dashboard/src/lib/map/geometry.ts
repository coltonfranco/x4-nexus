// Hex-grid geometry helpers (flat-top orientation).

import { SQRT3 } from "./constants";

// Flat-top hexagon points string.
export function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

// Axial → pixel (flat-top). Adjacent hexes touch edges at circumradius `size`.
export function axialToPixel(q: number, r: number, size: number): [number, number] {
  return [size * 1.5 * q, size * (SQRT3 / 2 * q + SQRT3 * r)];
}

// All axial coords in ring k around (cq, cr).
export function hexRing(cq: number, cr: number, k: number): [number, number][] {
  if (k === 0) return [[cq, cr]];
  const dirs: [number, number][] = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
  const result: [number, number][] = [];
  let q = cq + k, r = cr;
  for (const [dq, dr] of dirs) {
    for (let i = 0; i < k; i++) {
      result.push([q, r]);
      q += dq; r += dr;
    }
  }
  return result;
}
