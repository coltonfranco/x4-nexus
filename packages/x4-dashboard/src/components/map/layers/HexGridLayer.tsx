// Background hex grid — faint cells tiled across the canvas behind everything.

import { hexPoints } from "../../../lib/map/geometry";

export function HexGridLayer({ cells, hexSize }: { cells: [number, number][]; hexSize: number }) {
  return (
    <>
      {cells.map(([cx, cy], i) => (
        <polygon key={`bg-${i}`}
          points={hexPoints(cx, cy, hexSize)}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={0.6}
          style={{ pointerEvents: "none" }}
        />
      ))}
    </>
  );
}
