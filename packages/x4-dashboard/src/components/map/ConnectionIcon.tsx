// A map-object icon (gate / accelerator / highway endpoint) rendered as a masked
// div inside an SVG foreignObject so it can be tinted to the link color.

export function ConnectionIcon({ x, y, iconPath, color, size = 24 }: {
  x: number; y: number; iconPath: string; color: string; size?: number;
}) {
  const boxSize = size * 1.2;
  return (
    <foreignObject x={x - boxSize / 2} y={y - boxSize / 2} width={boxSize} height={boxSize} style={{ pointerEvents: "none", overflow: "visible" }}>
      <div style={{
        width: "100%", height: "100%",
        backgroundColor: color,
        maskImage: `url(/static/icons/map_objects/${iconPath})`,
        WebkitMaskImage: `url(/static/icons/map_objects/${iconPath})`,
        maskMode: "luminance",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }} />
    </foreignObject>
  );
}
