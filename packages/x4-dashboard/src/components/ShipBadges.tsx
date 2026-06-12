import { Badge } from "./ui/badge";
import { getClassColor, classFull, getTypeColor, getMkColor } from "../lib/formatters";

export function ShipClassBadge({ class_id, className = "" }: { class_id: string, className?: string }) {
  return (
    <Badge variant="outline" className={`${getClassColor(class_id)} ${className}`}>
      {classFull(class_id)}
    </Badge>
  );
}

export function ShipRoleBadge({ role, className = "" }: { role: string | null | undefined, className?: string }) {
  if (!role) return null;
  return (
    <Badge variant="outline" className={`${getTypeColor(role)} ${className}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </Badge>
  );
}

export function EquipmentMkBadge({ mk, className = "" }: { mk: number | null | undefined, className?: string }) {
  if (mk == null) return null;
  return (
    <Badge variant="outline" className={`${getMkColor(mk)} ${className}`}>
      Mk{mk}
    </Badge>
  );
}
