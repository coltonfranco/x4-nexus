import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { AppLayout } from "./components/layout/AppLayout";
import { FactionsLayout } from "./routes/factions/layout";
import FactionsListPage from "./routes/factions/list";
import DiplomacyPage from "./routes/factions/diplomacy";
import { InventoryLayout } from "./routes/inventory/layout";
import InventoryCatalogPage from "./routes/inventory/catalog";
import DropsPage from "./routes/inventory/drops";
import EconomyPage from "./routes/economy";
import EmpirePage from "./routes/empire";
import MissionsPage from "./routes/missions";
import LogbookPage from "./routes/logbook";
import CrewPage from "./routes/crew";
import MessagesPage from "./routes/messages";
import EquipmentPage from "./routes/ships/equipment";
import IndexPage from "./routes/index";
import MapPage from "./routes/map";
import ShipsListPage from "./routes/ships/list";
import { ShipsLayout } from "./routes/ships/layout";
import BuilderPage from "./routes/ships/builder";
import PaintModsPage from "./routes/ships/paintmods";
import { PlayerCard } from "./components/PlayerCard";
import TradeCatalogPage from "./routes/trade/catalog";
import { TradeLayout } from "./routes/trade/layout";
import TradeRoutesPage from "./routes/routes";
import SectorTestPage from "./routes/sector_test";
import StyleguidePage from "./routes/styleguide";
import { StationsLayout } from "./routes/stations/layout";
import ModulesPage from "./routes/stations/modules";
import MyStationsPage from "./routes/stations/overview";
import StationBuilderPage from "./routes/stations/builder";

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

const equipmentRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/equipment",
  beforeLoad: () => {
    throw redirect({ to: "/ships/equipment" });
  },
});
const dropsRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/drops",
  beforeLoad: () => {
    throw redirect({ to: "/inventory/drops" });
  },
});
const diplomacyRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/diplomacy",
  beforeLoad: () => {
    throw redirect({ to: "/factions/diplomacy" });
  },
});

const inventoryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/inventory", component: InventoryLayout });
const inventoryCatalogRoute = createRoute({ getParentRoute: () => inventoryRoute, path: "/", component: InventoryCatalogPage });
const inventoryDropsRoute = createRoute({ getParentRoute: () => inventoryRoute, path: "drops", component: DropsPage });
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
const shipsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/ships", component: ShipsLayout });
const shipsListRoute = createRoute({ getParentRoute: () => shipsRoute, path: "/", component: ShipsListPage });
const shipsEquipmentRoute = createRoute({ getParentRoute: () => shipsRoute, path: "equipment", component: EquipmentPage });
const shipsBuilderRoute = createRoute({
  getParentRoute: () => shipsRoute,
  path: "/builder",
  component: BuilderPage,
  validateSearch: (search: Record<string, unknown>): { ship_id?: string } => ({
    ship_id: typeof search.ship_id === "string" ? search.ship_id : undefined,
  }),
});
const shipsPaintModsRoute = createRoute({ getParentRoute: () => shipsRoute, path: "paintmods", component: PaintModsPage });
const factionsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/factions", component: FactionsLayout });
const factionsListRoute = createRoute({
  getParentRoute: () => factionsRoute,
  path: "/",
  component: FactionsListPage,
  validateSearch: (search: Record<string, unknown>): { faction?: string } => ({
    faction: typeof search.faction === "string" ? search.faction : undefined,
  }),
});
const factionsDiplomacyRoute = createRoute({ getParentRoute: () => factionsRoute, path: "diplomacy", component: DiplomacyPage });

const stationsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/stations", component: StationsLayout });
const stationsModulesRoute = createRoute({ getParentRoute: () => stationsRoute, path: "/", component: ModulesPage });
const stationsOverviewRoute = createRoute({ getParentRoute: () => stationsRoute, path: "overview", component: MyStationsPage });
const stationsBuilderRoute = createRoute({ getParentRoute: () => stationsRoute, path: "builder", component: StationBuilderPage });
const missionsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/missions", component: MissionsPage });
const messagesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/messages", component: MessagesPage });
const logbookRoute = createRoute({ getParentRoute: () => rootRoute, path: "/logbook", component: LogbookPage });
const crewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/crew", component: CrewPage });
const statsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/stats", component: () => <PlayerCard /> });
const sectorTestRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sector_test", component: SectorTestPage });
const styleguideRoute = createRoute({ getParentRoute: () => rootRoute, path: "/styleguide", component: StyleguidePage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  empireRoute,
  tradeRoute.addChildren([tradeCatalogRoute, tradeSupplyRoute, tradeRoutesRoute]),
  economyRedirect,
  routesRedirect,
  waresRedirect,
  equipmentRedirect,
  inventoryRoute.addChildren([inventoryCatalogRoute, inventoryDropsRoute]),
  dropsRedirect,
  diplomacyRedirect,
  mapRoute,
  shipsRoute.addChildren([shipsListRoute, shipsEquipmentRoute, shipsBuilderRoute, shipsPaintModsRoute]),
  stationsRoute.addChildren([stationsModulesRoute, stationsOverviewRoute, stationsBuilderRoute]),
  factionsRoute.addChildren([factionsListRoute, factionsDiplomacyRoute]),
  missionsRoute,
  messagesRoute,
  logbookRoute,
  crewRoute,
  statsRoute,
  sectorTestRoute,
  styleguideRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
