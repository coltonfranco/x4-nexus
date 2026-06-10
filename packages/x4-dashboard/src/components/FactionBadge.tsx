type Props = {
  name: string;
  color_hex: string | null;
  size?: "sm" | "md";
};

export function FactionBadge({ name, color_hex, size = "sm" }: Props) {
  const dotSize = size === "sm" ? 8 : 10;
  const fontSize = size === "sm" ? "0.75rem" : "0.875rem";

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize }}
      title={name}
    >
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          backgroundColor: color_hex ?? "#888",
          flexShrink: 0,
          display: "inline-block",
        }}
      />
      {name}
    </span>
  );
}
