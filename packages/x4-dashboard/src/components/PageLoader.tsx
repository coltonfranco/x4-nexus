import { type LucideIcon, Activity, BookOpen, Boxes, Cpu, Crown, Loader2, Map, PackageOpen, Rocket, Shield, TrendingUp, User, Target } from "lucide-react";
import { cn } from "../lib/utils";

type PageLoaderProps = {
  /** Contextual icon in the center ring. */
  icon?: LucideIcon;
  /** Primary loading message. */
  message?: string;
  /** Secondary subtitle below the message. */
  subtitle?: string;
  /** Accent color class (Tailwind border/text/shadow). Defaults to emerald. */
  color?: string;
  className?: string;
};

const presets: Record<string, { icon: LucideIcon; message: string; subtitle: string; color: string }> = {
  routes: {
    icon: Activity,
    message: "Calculating optimal trajectories…",
    subtitle: "Cross-referencing live station offers across the gate network",
    color: "blue",
  },
  economy: {
    icon: TrendingUp,
    message: "Sweeping market databanks…",
    subtitle: "Aggregating galaxy-wide supply and demand",
    color: "blue",
  },
  ships: {
    icon: Rocket,
    message: "Loading ship catalog…",
    subtitle: "Indexing chassis specs and hardpoint configurations",
    color: "blue",
  },
  builder: {
    icon: Rocket,
    message: "Assembling ship builder…",
    subtitle: "Loading equipment database and slot configurations",
    color: "blue",
  },
  equipment: {
    icon: Cpu,
    message: "Loading equipment catalog…",
    subtitle: "Benchmarking engines, shields, and weapon systems",
    color: "blue",
  },
  map: {
    icon: Map,
    message: "Charting the universe…",
    subtitle: "Rendering sector topology and station positions",
    color: "blue",
  },
  factions: {
    icon: Shield,
    message: "Loading faction registry…",
    subtitle: "Retrieving diplomatic relations and territory data",
    color: "blue",
  },
  inventory: {
    icon: Boxes,
    message: "Loading inventory…",
    subtitle: "Scanning personal and station storage",
    color: "blue",
  },
  trade: {
    icon: TrendingUp,
    message: "Accessing trade network…",
    subtitle: "Loading commodity exchange databanks",
    color: "blue",
  },
  empire: {
    icon: Crown,
    message: "Surveying your empire…",
    subtitle: "Aggregating fleet and station assets",
    color: "blue",
  },
  drops: {
    icon: PackageOpen,
    message: "Loading drop tables…",
    subtitle: "Cataloging container contents and loot",
    color: "blue",
  },
  missions: {
    icon: Target,
    message: "Scanning mission board…",
    subtitle: "Retrieving active objectives and available offers",
    color: "blue",
  },
  logbook: {
    icon: BookOpen,
    message: "Opening logbook…",
    subtitle: "Chronicling your journey across the gate network",
    color: "blue",
  },
  player: {
    icon: User,
    message: "Loading player profile…",
    subtitle: "Retrieving personal statistics and records",
    color: "blue",
  },
  default: {
    icon: Loader2,
    message: "Loading…",
    subtitle: "",
    color: "blue",
  },
};

const COLOR_MAP: Record<string, string> = {
  emerald: "border-emerald-500/20 border-emerald-500/40 border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.25)] text-emerald-500",
  amber:   "border-amber-500/20 border-amber-500/40 border-amber-500/30 shadow-[0_0_25px_rgba(245,158,11,0.25)] text-amber-500",
  blue:    "border-blue-500/20 border-blue-500/40 border-blue-500/30 shadow-[0_0_25px_rgba(59,130,246,0.25)] text-blue-500",
  sky:     "border-sky-500/20 border-sky-500/40 border-sky-500/30 shadow-[0_0_25px_rgba(14,165,233,0.25)] text-sky-500",
  violet:  "border-violet-500/20 border-violet-500/40 border-violet-500/30 shadow-[0_0_25px_rgba(139,92,246,0.25)] text-violet-500",
  "muted-foreground": "border-muted-foreground/20 border-muted-foreground/40 border-muted-foreground/30 text-muted-foreground",
};

/**
 * A standardized full-page loading state with animated rings, a contextual
 * icon, message, and subtitle.  Accepts a preset key (e.g. "routes",
 * "ships") or individual props for one-off use.
 */
export function PageLoader({ icon, message, subtitle, color, className }: PageLoaderProps) {
  const preset = presets.default;
  const Icon = icon ?? preset.icon;
  const msg = message ?? preset.message;
  const sub = subtitle ?? preset.subtitle;
  const ringColor = COLOR_MAP[color ?? preset.color] ?? COLOR_MAP["muted-foreground"];

  // Split the color string into its parts for each ring/icon
  const [ring1, ring2, iconRing, glow, textColor] = ringColor.split(" ");

  return (
    <div className={cn("flex flex-col items-center justify-center w-full h-full min-h-[50vh] flex-1 text-center gap-6 p-4", className)}>
      {/* Animated rings */}
      <div className="relative flex items-center justify-center">
        <div
          className={cn("absolute h-32 w-32 rounded-full border-2 animate-ping", ring1)}
          style={{ animationDuration: "3s" }}
        />
        <div
          className={cn("absolute h-20 w-20 rounded-full border animate-ping", ring2)}
          style={{ animationDuration: "2s", animationDelay: "0.5s" }}
        />
        {/* Core icon */}
        <div className={cn("relative bg-background border p-5 rounded-full", iconRing, glow)}>
          <Icon className={cn("h-10 w-10 animate-pulse", textColor)} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-base font-semibold text-foreground flex items-center justify-center gap-2">
          {msg}
        </p>
        {sub && <p className="text-sm text-muted-foreground opacity-70">{sub}</p>}
      </div>
    </div>
  );
}

/** Convenience: <PageLoader preset="ships" /> */
export function PageLoaderPreset({ preset, className }: { preset: keyof typeof presets; className?: string }) {
  const p = presets[preset] ?? presets.default;
  return <PageLoader icon={p.icon} message={p.message} subtitle={p.subtitle} color={p.color} className={className} />;
}
