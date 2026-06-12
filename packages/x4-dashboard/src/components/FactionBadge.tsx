import { Link } from "@tanstack/react-router";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

type Props = {
  name: string;
  color_hex: string | null;
  size?: "sm" | "md";
  faction_id?: string;
  className?: string;
};

export function FactionBadge({ name, color_hex, size = "sm", faction_id, className }: Props) {
  const bgColor = color_hex ? `${color_hex}1A` : 'rgba(136, 136, 136, 0.1)';
  const borderColor = color_hex ? `${color_hex}40` : 'rgba(136, 136, 136, 0.25)';
  const textColor = color_hex ?? "#888";

  const content = (
    <Badge 
      variant="outline"
      className={cn(
        "whitespace-nowrap transition-colors", 
        size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2.5 py-0.5 text-xs",
        className
      )}
      style={{
        backgroundColor: bgColor,
        borderColor: borderColor,
        color: textColor
      }}
      title={name}
    >
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
