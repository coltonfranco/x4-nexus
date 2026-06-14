import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Factory, Shield, Sword } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { STATUS_COLORS } from "../lib/map/constants";

type Health = {
  ok: boolean;
  api_version: string;
  save_age_sec: number | null;
  game_version: string | null;
};

const features = [
  {
    to: "/ships",
    icon: Sword,
    title: "Ships",
    description: "Browse all ships by class and faction. Compare speed, hull, cargo, and equipment slots.",
  },
  {
    to: "/trade",
    icon: Factory,
    title: "Trade & Production",
    description: "Commodity catalog with price ranges and production chains, plus the live supply radar and ranked routes.",
  },
  {
    to: "/factions",
    icon: Shield,
    title: "Faction Relations",
    description: "Visualise the diplomatic landscape — network graph and full relation matrix.",
  },
] as const;

export default function IndexPage() {
  const { data, isLoading, error } = useQuery<Health>({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await fetch("/api/v1/health");
      if (!r.ok) throw new Error(`Health check failed: ${r.status}`);
      return r.json();
    },
  });

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-baseline gap-2 mb-1">
          <h1 className="text-4xl font-bold text-foreground">X4</h1>
          <h1 className="text-3xl font-medium tracking-widest text-primary uppercase">Nexus</h1>
        </div>
        <p className="text-muted-foreground">Static catalog explorer for X4: Foundations</p>
      </div>

      {/* API status */}
      <Card className="mb-8 max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">API Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Connecting…</p>
          ) : error ? (
            <p className="text-sm text-destructive">API unreachable</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: data?.ok ? STATUS_COLORS.success : STATUS_COLORS.danger }}
                />
                <span className="text-sm font-medium">{data?.ok ? "Online" : "Degraded"}</span>
                <span className="text-xs text-muted-foreground ml-auto">v{data?.api_version}</span>
              </div>
              {data?.game_version && (
                <p className="text-xs text-muted-foreground">Game {data.game_version}</p>
              )}
              {data?.save_age_sec != null && (
                <p className="text-xs text-muted-foreground">
                  Save {Math.floor(data.save_age_sec)}s old
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feature cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {features.map(({ to, icon: Icon, title, description }) => (
          <Link key={to} to={to} style={{ textDecoration: "none" }}>
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/30 cursor-pointer">
              <CardHeader>
                <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
