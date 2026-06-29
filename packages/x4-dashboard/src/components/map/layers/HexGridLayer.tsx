// Background hex grid — faint cells tiled across the canvas behind everything.

import { hexPoints } from "../../../lib/map/geometry";
import { MAP_THEME } from "../../../lib/map/constants";

export function HexGridLayer({ cells, hexSize }: { cells: [number, number][]; hexSize: number }) {
  return (
    <>
      {cells.map(([cx, cy], i) => (
        <polygon key={`bg-${i}`}
          points={hexPoints(cx, cy, hexSize)}
          fill="none"
          stroke={MAP_THEME.gridLine}
          strokeWidth={0.6}
          style={{ pointerEvents: "none" }}
        />
      ))}
    </>
  );
}
