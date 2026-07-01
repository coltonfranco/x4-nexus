import { Building2, Database, Factory } from "lucide-react";

import { TabbedLayout } from "../../components/TabbedLayout";

const TABS = [
  { to: "/stations/overview", label: "Owned Stations", icon: Building2, exact: false },
  { to: "/stations/modules", label: "Modules", icon: Database, exact: false },
  { to: "/stations/builder", label: "Station Builder", icon: Factory, exact: false },
] as const;

/** Station construction hub: a tabbed layout over modules, and future planner. */
export function StationsLayout() {
  return <TabbedLayout tabs={TABS} />;
}
