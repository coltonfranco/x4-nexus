import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppLayout } from "./components/layout/AppLayout";
import DiplomacyPage from "./routes/diplomacy";
import DropsPage from "./routes/drops";
import EconomyPage from "./routes/economy";
import EmpirePage from "./routes/empire";
import FactionsPage from "./routes/factions";
import IndexPage from "./routes/index";
import MapPage from "./routes/map";
import TradeRoutesPage from "./routes/routes";
import ShipsPage from "./routes/ships";
import WaresPage from "./routes/wares";

const rootRoute = createRootRoute({ component: AppLayout });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: IndexPage });
const empireRoute = createRoute({ getParentRoute: () => rootRoute, path: "/empire", component: EmpirePage });
const routesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/routes", component: TradeRoutesPage });
const economyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/economy", component: EconomyPage });
const mapRoute = createRoute({ getParentRoute: () => rootRoute, path: "/map", component: MapPage });
const shipsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/ships", component: ShipsPage });
const waresRoute = createRoute({ getParentRoute: () => rootRoute, path: "/wares", component: WaresPage });
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

const routeTree = rootRoute.addChildren([indexRoute, empireRoute, routesRoute, economyRoute, mapRoute, shipsRoute, waresRoute, factionsRoute, dropsRoute, diplomacyRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
