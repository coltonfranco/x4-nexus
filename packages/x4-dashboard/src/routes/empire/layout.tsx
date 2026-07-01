import { Activity, Crown, Users } from "lucide-react";

import { TabbedLayout } from "../../components/TabbedLayout";

const TABS = [
  { to: "/empire/overview", label: "Overview", icon: Crown, exact: false },
  { to: "/empire/crew", label: "Crew", icon: Users, exact: false },
  { to: "/empire/stats", label: "Stats", icon: Activity, exact: false },
] as const;

export function EmpireLayout() {
  return <TabbedLayout tabs={TABS} outletClassName="min-h-0 flex-1 overflow-auto" />;
}
