import type { MapStation } from "../../lib/map/types";

export const CATEGORY_ICONS: Record<string, string> = {
  shipyard: "mapob_shipyard.png",
  wharf: "mapob_wharf.png",
  equipmentdock: "mapob_equipmentdock.png",
  tradestation: "mapob_tradestation.png",
  headquarters: "mapob_playerhq.png",
  defence: "mapob_defensestation.png",
  piratebase: "mapob_piratestation.png",
};

export function iconForStation(st: MapStation): string {
  if (st.is_hq) return "mapob_playerhq.png";
  return (st.category && CATEGORY_ICONS[st.category]) || "mapob_factory.png";
}

export function StationMapIcon({ 
  station, 
  color, 
  sizeWorld 
}: { 
  station: MapStation; 
  color: string; 
  sizeWorld: number;
}) {
  const iconPath = iconForStation(station);
  const url = `url(/static/icons/map_objects/${iconPath})`;
  
  return (
    <foreignObject 
      x={-sizeWorld / 2} 
      y={-sizeWorld / 2} 
      width={sizeWorld} 
      height={sizeWorld}
      style={{ pointerEvents: "none", overflow: "visible" }}
    >
      <div style={{
        width: "100%", height: "100%",
        backgroundColor: color,
        maskImage: url, WebkitMaskImage: url,
        maskMode: "luminance",
        maskSize: "contain", WebkitMaskSize: "contain",
        maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
        maskPosition: "center", WebkitMaskPosition: "center",
      }} />
    </foreignObject>
  );
}
