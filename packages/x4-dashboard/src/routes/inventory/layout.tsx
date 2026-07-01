import { Boxes, PackageOpen } from "lucide-react";

import { TabbedLayout } from "../../components/TabbedLayout";

const TABS = [
  { to: "/inventory/catalog", label: "Catalog", icon: Boxes, exact: false },
  { to: "/inventory/drops", label: "Drop Tables", icon: PackageOpen, exact: false },
] as const;

export function InventoryLayout() {
  return <TabbedLayout tabs={TABS} tabBarClassName="shrink-0" outletClassName="min-h-0 flex-1 flex flex-col" />;
}
