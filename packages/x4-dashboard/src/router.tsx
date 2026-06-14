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
import BuilderPage from "./routes/ships/builder";
import { PlayerCard } from "./components/PlayerCard";
import TradeCatalogPage from "./routes/trade/catalog";
import { TradeLayout } from "./routes/trade/layout";
import TradeRoutesPage from "./routes/routes";
import SectorTestPage from "./routes/sector_test";
import StyleguidePage from "./routes/styleguide";

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
const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/map",
  component: MapPage,
  // Deep-link from the trade pages: preset the ware overlay, route arrows, and nav path.
  validateSearch: (search: Record<string, unknown>): { ware?: string; routes?: boolean; from?: string; to?: string } => ({
    ware: typeof search.ware === "string" ? search.ware : undefined,
    routes: search.routes === true || search.routes === "1" || search.routes === "true" ? true : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
  }),
});
const shipsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/ships", component: ShipsPage });
const shipsBuilderRoute = createRoute({
  getParentRoute: () => shipsRoute,
  path: "/builder",
  component: BuilderPage,
  validateSearch: (search: Record<string, unknown>): { ship_id?: string } => ({
    ship_id: typeof search.ship_id === "string" ? search.ship_id : undefined,
  }),
});
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
const playerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/player", component: () => <PlayerCard /> });
const sectorTestRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sector_test", component: SectorTestPage });
const styleguideRoute = createRoute({ getParentRoute: () => rootRoute, path: "/styleguide", component: StyleguidePage });

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
  shipsRoute.addChildren([shipsBuilderRoute]),
  factionsRoute,
  dropsRoute,
  diplomacyRoute,
  playerRoute,
  sectorTestRoute,
  styleguideRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
