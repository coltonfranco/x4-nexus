import { Cpu, Palette, Rocket, Wrench, Users } from "lucide-react";

import { TabbedLayout } from "../../components/TabbedLayout";

const TABS = [
  { to: "/ships/list", label: "Ships List", icon: Rocket, exact: false },
  { to: "/ships/fleet", label: "Fleets", icon: Users, exact: false },
  { to: "/ships/equipment", label: "Equipment List", icon: Cpu, exact: false },
  { to: "/ships/paintmods", label: "Paint Mods", icon: Palette, exact: false },
  { to: "/ships/builder", label: "Ship Builder", icon: Wrench, exact: false },
] as const;

export function ShipsLayout() {
  return <TabbedLayout tabs={TABS} />;
}
