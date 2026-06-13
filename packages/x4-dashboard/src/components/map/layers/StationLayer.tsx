// Station markers inside their sector hexes, drawn with the in-game map-object icon for
// the station's function and tinted to the owning faction. Visibility is tiered by zoom:
// fully zoomed out shows only the player's own stations, mid zoom adds every faction's
// main facilities, and zooming into a sector (grid territory) reveals every station.
// Markers shrink as the user zooms in so they don't dominate the in-sector view.

import type { FactionSummary, MapStation, Transform } from "../../../lib/map/types";
import { stationVisibleAt, type StationTier } from "../../../lib/map/stations";
import { StationMapIcon } from "../StationMapIcon";

// Tier thresholds, in on-screen sector-hex radius (px). "all" lines up roughly with
// where the build grid appears (deep single-sector zoom).
const STATION_ALL_SCREEN_RADIUS = 520;
const STATION_MAJOR_SCREEN_RADIUS = 110;

export function StationLayer({
  stations, stationScreenPos, factionMap, hexSize, transform,
  selectedStationId, onSelect, onHover,
}: {
  stations: MapStation[];
  stationScreenPos: Map<string, [number, number]>;
  factionMap: Map<string, FactionSummary>;
  hexSize: number;
  transform: Transform;
  selectedStationId: string | null;
  onSelect: (st: MapStation) => void;
  onHover: (st: MapStation | null) => void;
}) {
  const onScreenHexR = hexSize * transform.scale;
  const tier: StationTier =
    onScreenHexR >= STATION_ALL_SCREEN_RADIUS ? "all"
    : onScreenHexR >= STATION_MAJOR_SCREEN_RADIUS ? "major"
    : "player";

  return (
    <>
      {stations.map((st) => {
        const pos = stationScreenPos.get(st.station_id);
        if (!pos) return null;
        if (!stationVisibleAt(st, tier)) return null;

        const [cx, cy] = pos;
        // Icon grows with how large the sector reads on screen (so it gets bigger as you
        // zoom in), clamped to a readable range; HQ a touch larger.
        const screenPx = Math.min(54, Math.max(16, onScreenHexR * 0.11)) * (st.is_hq ? 1.3 : 1);
        const sizeWorld = screenPx / transform.scale;

        const faction = st.owner_faction ? factionMap.get(st.owner_faction) : null;
        const color = st.is_hq ? "#fcd34d" : (faction?.color_hex ?? "#94a3b8");
        const isSelected = st.station_id === selectedStationId;

        return (
          <g key={st.station_id} transform={`translate(${cx},${cy})`} style={{ cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onSelect(st); }}
            onMouseEnter={() => onHover(st)} onMouseLeave={() => onHover(null)}>
            {/* Invisible hit target so the thin icon strokes are easy to hover/click. */}
            <circle r={sizeWorld * 0.6} fill="transparent" />
            {isSelected && (
              <circle r={sizeWorld * 0.72} fill="none" stroke="#ffffff" strokeWidth={1.5 / transform.scale} />
            )}
            {st.is_player_owned && !st.is_hq && (
              <circle r={sizeWorld * 0.6} fill="none" stroke="#ffffff" strokeWidth={0.8 / transform.scale} opacity={0.8} />
            )}
            <StationMapIcon station={st} color={color} sizeWorld={sizeWorld} />
          </g>
        );
      })}
    </>
  );
}
