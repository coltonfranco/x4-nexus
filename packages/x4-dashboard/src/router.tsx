import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { AppLayout } from "./components/layout/AppLayout";
import DiplomacyPage from "./routes/diplomacy";
import DropsPage from "./routes/drops";
import EconomyPage from "./routes/economy";
import EmpirePage from "./routes/empire";
import EquipmentPage from "./routes/equipment";
import FactionsPage from "./routes/factions";
import IndexPage from "./routes/index";
import InventoryPage from "./routes/inventory";
import MapPage from "./routes/map";
import ShipsPage from "./routes/ships";
import TradeCatalogPage from "./routes/trade/catalog";
import { TradeLayout } from "./routes/trade/layout";
import TradeRoutesPage from "./routes/routes";

const rootRoute = createRootRoute({ component: AppLayout });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: IndexPage });
const empireRoute = createRoute({ getParentRoute: () => rootRoute, path: "/empire", component: EmpirePage });

// Trade hub — a tabbed layout over the commodity catalog, supply radar, and routes.
const tradeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/trade", component: TradeLayout });
const tradeCatalogRoute = createRoute({ getParentRoute: () => tradeRoute, path: "/", component: TradeCatalogPage });
const tradeSupplyRoute = createRoute({ getParentRoute: () => tradeRoute, path: "supply", component: EconomyPage });
const tradeRoutesRoute = createRoute({ getParentRoute: () => tradeRoute, path: "routes", component: TradeRoutesPage });

// Legacy paths kept as redirects into the trade hub.
const economyRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/economy",
  beforeLoad: () => {
    throw redirect({ to: "/trade/supply" });
  },
});
const routesRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/routes",
  beforeLoad: () => {
    throw redirect({ to: "/trade/routes" });
  },
});
const waresRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wares",
  beforeLoad: () => {
    throw redirect({ to: "/trade" });
  },
});

const equipmentRoute = createRoute({ getParentRoute: () => rootRoute, path: "/equipment", component: EquipmentPage });
const inventoryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/inventory", component: InventoryPage });
const mapRoute = createRoute({ getParentRoute: () => rootRoute, path: "/map", component: MapPage });
const shipsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/ships", component: ShipsPage });
const factionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/factions",
  component: FactionsPage,
  validateSearch: (search: Record<string, unknown>): { faction?: string } => ({
    faction: typeof search.faction === "string" ? search.faction : undefined,
  }),
});
const dropsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/drops", component: DropsPage });
const diplomacyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/diplomacy", component: DiplomacyPage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  empireRoute,
  tradeRoute.addChildren([tradeCatalogRoute, tradeSupplyRoute, tradeRoutesRoute]),
  economyRedirect,
  routesRedirect,
  waresRedirect,
  equipmentRoute,
  inventoryRoute,
  mapRoute,
  shipsRoute,
  factionsRoute,
  dropsRoute,
  diplomacyRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
