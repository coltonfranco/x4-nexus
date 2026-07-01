import { ArrowLeftRight, BookOpen, Network, TrendingUp, LineChart } from "lucide-react";

import { TabbedLayout } from "../../components/TabbedLayout";
import { useHasSave } from "../../lib/useHasSave";

const TABS = [
  { to: "/trade/overview", label: "Overview", icon: LineChart, exact: false, requiresSave: false },
  { to: "/trade/catalog", label: "Catalog", icon: BookOpen, exact: false, requiresSave: false },
  { to: "/trade/production", label: "Production Chains", icon: Network, exact: false, requiresSave: false },
  { to: "/trade/routes", label: "Routes", icon: TrendingUp, exact: false, requiresSave: true },
  { to: "/trade/transactions", label: "Transactions", icon: ArrowLeftRight, exact: false, requiresSave: true },
] as const;

/** Trade hub: a slim tab strip over the commodity catalog, live supply radar, and
 *  ranked routes. Each tab is its own route so the URL is shareable. */
export function TradeLayout() {
  const { hasSave } = useHasSave();
  return <TabbedLayout tabs={TABS} hasSave={hasSave} />;
}
