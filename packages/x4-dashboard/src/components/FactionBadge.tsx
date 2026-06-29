import { Link } from "@tanstack/react-router";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

type Props = {
  name: string;
  color_hex: string | null;
  icon_url?: string | null;
  size?: "sm" | "md";
  faction_id?: string;
  className?: string;
};

const ICON_SZ = { sm: 12, md: 14 } as const;

export function FactionBadge({ name, color_hex, icon_url, size = "md", faction_id, className }: Props) {
  const bgColor = 'transparent';
  const borderColor = color_hex ?? 'rgba(136, 136, 136, 0.25)';
  const textColor = color_hex ?? "#888";
  const iconSz = ICON_SZ[size];

  const content = (
    <Badge 
      variant="outline"
      className={cn(
        "whitespace-nowrap transition-colors gap-1.5", 
        size === "sm" ? "px-1.5 py-0 text-xs" : "px-2.5 py-0.5 text-xs",
        className
      )}
      style={{
        backgroundColor: bgColor,
        borderColor: borderColor,
        color: textColor
      }}
      title={name}
    >
      {icon_url && (
        <span
          className="shrink-0"
          style={{
            width: iconSz,
            height: iconSz,
            backgroundColor: textColor,
            WebkitMaskImage: `url(${icon_url})`,
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskImage: `url(${icon_url})`,
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
          }}
        />
      )}
      {name}
    </Badge>
  );

  if (faction_id) {
    return (
      <Link 
        to="/factions" 
        search={{ faction: faction_id }} 
        className="hover:underline"
        style={{ textDecorationColor: color_hex ?? "#888" }}
      >
        {content}
      </Link>
    );
  }

  return content;
}
