import { Badge } from "./ui/badge";
import { getClassColor, classFull, getTypeColor, getMkColor } from "../lib/formatters";
import { cn } from "../lib/utils";

/** Agnostic size badge — colored accent bar + full label (Small, Medium, Large, Extra Large).
 *  Accepts any value that `classShort` can normalise: `"s"`, `"m"`, `"l"`, `"xl"`, `"ship_s"`, etc. */
export function SizeBadge({ size, className = "" }: { size: string; className?: string }) {
  const baseColor = getClassColor(size);
  const textColor = baseColor.split(" ").find((c) => c.startsWith("text-"));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("w-1 h-3.5 bg-current", textColor)} />
      <span className="text-xs font-bold text-foreground tracking-widest leading-none">
        {classFull(size)}
      </span>
    </div>
  );
}

/** Legacy alias — delegates to SizeBadge. */
export function ShipClassBadge({ class_id, className = "" }: { class_id: string; className?: string }) {
  return <SizeBadge size={class_id} className={className} />;
}

export function ShipTypeBadge({ role, subtype, className = "" }: { role: string | null | undefined, subtype?: string | null | undefined, className?: string }) {
  if (!role) return null;
  const baseColor = getTypeColor(role);
  const textColor = baseColor.split(' ').find(c => c.startsWith('text-'));
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("w-1.5 h-1.5 bg-current", textColor)} />
      <span className="text-xs font-bold text-foreground tracking-widest leading-none">
        {role.charAt(0).toUpperCase() + role.slice(1)}
        {subtype && <span className="opacity-50 ml-1.5 capitalize font-medium">{subtype}</span>}
      </span>
    </div>
  );
}

export function ShipSubtypeBadge({ subtype, role, className = "" }: { subtype: string | null | undefined, role: string | null | undefined, className?: string }) {
  if (!subtype) return null;
  const baseColor = getTypeColor(role);
  const textColor = baseColor.split(' ').find(c => c.startsWith('text-'));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("w-1.5 h-1.5 bg-current opacity-50", textColor)} />
      <span className="text-xs font-bold text-foreground tracking-widest opacity-70 leading-none capitalize">
        {subtype}
      </span>
    </div>
  );
}

export function EquipmentMkBadge({ mk, className = "" }: { mk: number | null | undefined, className?: string }) {
  if (mk == null) return null;
  return (
    <Badge variant="outline" className={cn(getMkColor(mk), className)}>
      Mk{mk}
    </Badge>
  );
}
