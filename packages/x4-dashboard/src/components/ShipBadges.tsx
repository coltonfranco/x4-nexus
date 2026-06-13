import { Badge } from "./ui/badge";
import { getClassColor, classFull, getTypeColor, getMkColor } from "../lib/formatters";
import { cn } from "../lib/utils";

export function ShipClassBadge({ class_id, className = "" }: { class_id: string, className?: string }) {
  return (
    <Badge variant="outline" className={cn(getClassColor(class_id), className)}>
      {classFull(class_id)}
    </Badge>
  );
}

export function ShipTypeBadge({ role, subtype, className = "" }: { role: string | null | undefined, subtype?: string | null | undefined, className?: string }) {
  if (!role) return null;
  
  const baseColor = getTypeColor(role);
  
  if (!subtype) {
    return (
      <Badge variant="outline" className={cn(baseColor, className)}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Badge>
    );
  }

  const colorOutline = baseColor.split(' ').filter(c => !c.startsWith('bg-')).join(' ');

  // The outer div acts as the boundary of the badge
  // We use inline-flex and rounded-full (to match Badge) to shape it
  return (
    <div className={cn(`inline-flex items-center rounded-full border text-xs font-semibold overflow-hidden transition-colors`, colorOutline, className)}>
      <div className={cn(`px-2.5 py-0.5 h-full flex items-center border-r border-current/20`, baseColor)}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </div>
      <div className="px-2.5 py-0.5 bg-transparent capitalize h-full flex items-center">
        {subtype}
      </div>
    </div>
  );
}

export function ShipSubtypeBadge({ subtype, role, className = "" }: { subtype: string | null | undefined, role: string | null | undefined, className?: string }) {
  if (!subtype) return null;
  const colorClass = getTypeColor(role).split(' ').filter(c => !c.startsWith('bg-')).join(' ');
  return (
    <Badge variant="outline" className={cn(colorClass, "bg-transparent", className)}>
      {subtype.charAt(0).toUpperCase() + subtype.slice(1)}
    </Badge>
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
