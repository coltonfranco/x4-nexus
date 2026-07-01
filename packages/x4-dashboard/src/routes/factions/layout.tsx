import { Handshake, Shield } from "lucide-react";

import { TabbedLayout } from "../../components/TabbedLayout";

const TABS = [
  { to: "/factions/list", label: "Registry", icon: Shield, exact: false },
  { to: "/factions/diplomacy", label: "Diplomacy", icon: Handshake, exact: false },
] as const;

export function FactionsLayout() {
  return <TabbedLayout tabs={TABS} tabBarClassName="shrink-0" outletClassName="min-h-0 flex-1 flex flex-col" />;
}
