import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SortHeader } from "../../components/ui/sort-header";
import { useSettings } from "../../lib/settingsStore";
import { ProductionChain } from "../../components/trade/ProductionChain";
import { Input } from "../../components/ui/input";
import { FilterPill } from "../../components/ui/filter-pill";
import { fmtNum } from "../../lib/wareFormat";
import { getMkGradientClass, classFull, getClassColor } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { useSort } from "../../lib/useSort";
import { Currency } from "../../components/Currency";
import { FactionBadge } from "../../components/FactionBadge";
import { PageTabs, PageTab } from "../../components/ui/page-tabs";
import { Search } from "lucide-react";

import { ShipTypeBadge, EquipmentMkBadge, ShipClassBadge } from "../../components/ShipBadges";
import { StatBar } from "../../components/StatBar";
import { EntityIcon } from "../../components/EntityIcon";
import { PageLoaderPreset } from "../../components/PageLoader";
import { HUDCard } from "../../components/HUDCard";
import { EquipmentFilterBar } from "../../components/EquipmentFilterBar";
import { getWeaponType } from "../../lib/formatters";
import type { FactionSummary } from '../../lib/map/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

type EngineStats = {
  mk: number | null;
  thrust_forward: number | null;
  thrust_reverse: number | null;
  thrust_strafe: number | null;
  travel_thrust: number | null;
  travel_charge: number | null;
  boost_thrust: number | null;
  boost_duration: number | null;
};
type ShieldStats = {
  mk: number | null;
  capacity: number | null;
  recharge_rate: number | null;
  recharge_delay: number | null;
};
type WeaponStats = {
  class_id: string | null;
  size: string | null;
  mk: number | null;
  rotation_speed: number | null;
  damage: number | null;
  shield_damage: number | null;
  hull_damage: number | null;
  reload_rate: number | null;
  bullet_speed: number | null;
  bullet_lifetime: number | null;
  bullet_amount: number | null;
};
type Equipment = {
  ware_id: string;
  name: string;
  kind: string;
  size: string | null;
  mk: number | null;
  faction_id: string | null;
  restriction_licence: string | null;
  price_min: number | null;
  price_avg: number | null;
  price_max: number | null;
  icon_url: string | null;
  has_production: boolean;
  engine_stats: EngineStats | null;
  shield_stats: ShieldStats | null;
  weapon_stats: WeaponStats | null;
};

// ── Derived weapon metrics ──────────────────────────────────────────────────────
const dps = (w: WeaponStats | null): number | null =>
  w?.damage == null ? null : Math.round(w.damage * (w.bullet_amount ?? 1) * (w.reload_rate ?? 1));
const rangeM = (w: WeaponStats | null): number | null => {
  if (w?.bullet_speed == null || w?.bullet_lifetime == null) return null;
  const r = w.bullet_speed * w.bullet_lifetime;
  return r > 50_000 ? null : Math.round(r);
};

// ── Category definitions ────────────────────────────────────────────────────────
type MetricCol = {
  key: string;
  label: string;
  get: (e: Equipment) => number | null;
  fmt: (n: number) => string;
  primary?: boolean;
};

type Category = {
  id: string;
  label: string;
  match: (kind: string) => boolean;
  metrics: MetricCol[];
};

const km = (m: number) => `${(m / 1000).toFixed(1)}km`;
const CATEGORIES: Category[] = [
  {
    id: "engine",
    label: "Engines",
    match: (k) => k === "engine",
    metrics: [
      { key: "thrust", label: "Thrust", primary: true, get: (e) => e.engine_stats?.thrust_forward ?? null, fmt: (n) => fmtNum(Math.round(n)) + " N" },
      { key: "travel", label: "Travel", get: (e) => e.engine_stats?.travel_thrust ?? null, fmt: (n) => `${n.toFixed(1)}×` },
      { key: "boost", label: "Boost", get: (e) => e.engine_stats?.boost_thrust ?? null, fmt: (n) => `${n.toFixed(1)}×` },
    ],
  },
  {
    id: "thruster",
    label: "Thrusters",
    match: (k) => k === "thruster",
    metrics: [
      { key: "strafe", label: "Strafe", primary: true, get: (e) => e.engine_stats?.thrust_strafe ?? null, fmt: (n) => fmtNum(Math.round(n)) },
      { key: "forward", label: "Forward", get: (e) => e.engine_stats?.thrust_forward ?? null, fmt: (n) => fmtNum(Math.round(n)) },
    ],
  },
  {
    id: "shield",
    label: "Shields",
    match: (k) => k === "shield",
    metrics: [
      { key: "capacity", label: "Capacity", primary: true, get: (e) => e.shield_stats?.capacity ?? null, fmt: (n) => `${fmtNum(Math.round(n))} MJ` },
      { key: "recharge", label: "Recharge", get: (e) => e.shield_stats?.recharge_rate ?? null, fmt: (n) => `${Math.round(n)}/s` },
      { key: "delay", label: "Delay", get: (e) => e.shield_stats?.recharge_delay ?? null, fmt: (n) => `${n.toFixed(1)}s` },
    ],
  },
  {
    id: "weapon",
    label: "Weapons",
    match: (k) => k === "weapon",
    metrics: [
      { key: "dps", label: "DPS", primary: true, get: (e) => dps(e.weapon_stats), fmt: (n) => fmtNum(n) },
      { key: "range", label: "Range", get: (e) => rangeM(e.weapon_stats), fmt: km },
      { key: "rotation", label: "Rotation", get: (e) => e.weapon_stats?.rotation_speed ?? null, fmt: (n) => `${Math.round(n)}°/s` },
    ],
  },
  {
    id: "turret",
    label: "Turrets",
    match: (k) => k === "turret",
    metrics: [
      { key: "dps", label: "DPS", primary: true, get: (e) => dps(e.weapon_stats), fmt: (n) => fmtNum(n) },
      { key: "range", label: "Range", get: (e) => rangeM(e.weapon_stats), fmt: km },
      { key: "rotation", label: "Rotation", get: (e) => e.weapon_stats?.rotation_speed ?? null, fmt: (n) => `${Math.round(n)}°/s` },
    ],
  },
  {
    id: "missile",
    label: "Missiles",
    match: (k) => k === "missile",
    metrics: [
      { key: "damage", label: "Damage", primary: true, get: (e) => e.weapon_stats?.damage ?? null, fmt: (n) => fmtNum(Math.round(n)) },
      { key: "speed", label: "Speed", get: (e) => e.weapon_stats?.bullet_speed ?? null, fmt: (n) => `${Math.round(n)} m/s` },
      { key: "reload", label: "Reload", get: (e) => e.weapon_stats?.reload_rate ?? null, fmt: (n) => `${n.toFixed(1)}/s` },
    ],
  },
  {
    id: "consumable",
    label: "Consumables",
    match: (k) => ["countermeasure", "deployable", "drone"].includes(k),
    metrics: [],
  },
  {
    id: "software",
    label: "Software",
    match: (k) => k === "software",
    metrics: [],
  },
  {
    id: "other",
    label: "Other",
    match: (k) => !["engine", "thruster", "shield", "weapon", "turret", "missile", "countermeasure", "deployable", "drone", "software"].includes(k),
    metrics: [],
  },
];

const SIZE_ORDER: Record<string, number> = { xs: 0, s: 1, m: 2, l: 3, xl: 4 };

// ── Detail Modal ────────────────────────────────────────────────────────────────
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function FullStats({ item }: { item: Equipment }) {
  const e = item.engine_stats;
  const s = item.shield_stats;
  const w = item.weapon_stats;
  const rows: [string, string][] = [];
  if (e)
    rows.push(
      ["Forward thrust", fmtNum(e.thrust_forward, " N")],
      ["Reverse thrust", fmtNum(e.thrust_reverse, " N")],
      ["Strafe thrust", fmtNum(e.thrust_strafe, " N")],
      ["Travel thrust", fmtNum(e.travel_thrust, "×")],
      ["Travel charge", fmtNum(e.travel_charge, " s")],
      ["Boost thrust", fmtNum(e.boost_thrust, "×")],
      ["Boost duration", fmtNum(e.boost_duration, " s")]
    );
  if (s)
    rows.push(
      ["Capacity", fmtNum(s.capacity, " MJ")],
      ["Recharge rate", fmtNum(s.recharge_rate, " MJ/s")],
      ["Recharge delay", fmtNum(s.recharge_delay, " s")]
    );
  if (w)
    rows.push(
      ["Class", w.class_id ?? "—"],
      ["DPS", fmtNum(dps(w))],
      ["Range", rangeM(w) != null ? km(rangeM(w)!) : "—"],
      ["Rotation", fmtNum(w.rotation_speed, "°/s")],
      ["Reload rate", fmtNum(w.reload_rate, "/s")],
      ["Damage", fmtNum(w.damage)],
      ["Shield damage", fmtNum(w.shield_damage)],
      ["Hull damage", fmtNum(w.hull_damage)],
      ["Projectiles", fmtNum(w.bullet_amount)]
    );
  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Metrics</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {rows.map(([label, value]) => (
              <StatRow key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      )}
      {item.has_production && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Build chain</p>
          <ProductionChain wareId={item.ware_id} />
        </div>
      )}
      {rows.length === 0 && !item.has_production && (
        <p className="text-xs italic text-muted-foreground">No detailed stats extracted for this part.</p>
      )}
    </div>
  );
}

function EquipmentDetailPanel({ item, factions }: { item: Equipment; factions: FactionSummary[] }) {
  const faction = item.faction_id ? factions.find((f) => f.faction_id === item.faction_id) : undefined;
  
  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="shrink-0 flex items-center justify-center w-32 h-32 bg-muted/10 rounded-xl p-2 border border-border/50 shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_70%)]" />
          <EntityIcon src={item.icon_url} alt={item.name} size={100} className="relative drop-shadow-[0_0_12px_rgba(0,0,0,0.6)]" />
        </div>
        
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <h2 className="text-2xl font-bold tracking-tight truncate" title={item.name}>
            {item.name}
          </h2>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <ShipTypeBadge role={item.kind} className="px-2.5 py-0.5 text-xs" />
            <EquipmentMkBadge mk={item.mk} className="px-2.5 py-0.5 text-xs tracking-wider" />
            {item.size && <ShipClassBadge class_id={item.size} className="px-2.5 py-0.5 text-xs tracking-wider" />}
            {faction && <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} faction_id={faction.faction_id} />}
          </div>
        </div>
      </div>
      <div className="pt-4 border-t border-border/50">
        <FullStats item={item} />
      </div>
    </div>
  );
}

// ── Comparison table ────────────────────────────────────────────────────────────


function EquipmentTable({
  category,
  items,
  factions,
  onSelect,
}: {
  category: Category;
  items: Equipment[];
  factions: FactionSummary[];
  onSelect: (item: Equipment) => void;
}) {
  const metrics = category.metrics;

  const accessors = useMemo(() => {
    const acc: Record<string, (e: Equipment) => number | string | null> = {
      name: (e) => e.name,
      mk: (e) => e.mk,
      price: (e) => e.price_avg,
    };
    for (const m of metrics) acc[m.key] = m.get;
    return acc;
  }, [metrics]);

  const primaryKey = metrics.find((m) => m.primary)?.key ?? "name";
  const { sorted, key, dir, toggle } = useSort(items, accessors, {
    key: primaryKey,
    dir: primaryKey === "name" ? "asc" : "desc",
  });

  const maxima = useMemo(() => {
    const m: Record<string, number> = {};
    for (const col of metrics) m[col.key] = Math.max(1, ...items.map((e) => col.get(e) ?? 0));
    return m;
  }, [metrics, items]);

  // Build faction lookup: short codes ("arg") → full faction
  const factionMap = new Map(factions.map((f) => [f.faction_id, f]));
  const shortFactionMap = useMemo(() => {
    const m = new Map(factionMap);
    for (const f of factions) {
      if (f.short_name) m.set(f.short_name.toLowerCase(), f);
    }
    return m;
  }, [factions]);

  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="text-xs text-muted-foreground hover:bg-transparent">
          <TableHead className="w-10 px-3 py-2" />
          <SortHeader label="Name" active={key === "name"} dir={dir} onClick={() => toggle("name", "asc")} />
          <TableHead className="w-32 px-3 py-2 text-left font-medium text-xs text-muted-foreground">Size</TableHead>
          <TableHead className="w-12 px-3 py-2 text-left font-medium text-xs text-muted-foreground">Mk</TableHead>
          <TableHead className="w-40 px-3 py-2 text-left font-medium text-xs text-muted-foreground">Faction</TableHead>
          {metrics.map((m) => (
            <SortHeader
              key={m.key}
              label={m.label}
              active={key === m.key}
              dir={dir}
              onClick={() => toggle(m.key)}
              className="w-32"
            />
          ))}
          <SortHeader label="Price" active={key === "price"} dir={dir} onClick={() => toggle("price")} className="w-24 text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((e) => {
          const faction = e.faction_id
            ? (shortFactionMap.get(e.faction_id.toLowerCase()) ?? factionMap.get(e.faction_id))
            : undefined;
          return (
            <TableRow
              key={e.ware_id}
              className="cursor-pointer"
              onClick={() => onSelect(e)}
            >
              <TableCell className="px-3 py-1.5">
                <div className={cn("w-10 h-10 flex items-center justify-center rounded-lg border", getMkGradientClass(e.mk))}>
                  <EntityIcon src={e.icon_url} alt={e.name} size={32} />
                </div>
              </TableCell>
              <TableCell className="px-3 py-2 font-medium text-xs">{e.name}</TableCell>
              <TableCell className="px-3 py-2">
                {e.size ? (
                  <ShipClassBadge class_id={e.size} className="text-xs px-1.5 py-0" />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="px-3 py-2">
                {e.mk != null ? (
                  <EquipmentMkBadge mk={e.mk} className="text-xs px-1.5 py-0" />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="px-3 py-2">
                {faction ? (
                  <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} faction_id={faction.faction_id} />
                ) : (
                  <span className="text-xs uppercase text-muted-foreground">{e.faction_id ?? "—"}</span>
                )}
              </TableCell>
              {metrics.map((m) => (
                <TableCell key={m.key} className="px-3 py-2">
                  {m.get(e) != null ? (
                    <StatBar value={Math.log10(m.get(e)! + 1)} max={Math.log10(maxima[m.key] + 1)} label={m.fmt(m.get(e)!)} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              ))}
              <TableCell className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                {e.price_avg != null ? <Currency value={e.price_avg} /> : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────
export default function EquipmentPage() {
  const [catId, setCatId] = useState("engine");
  const [size, setSize] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [factionFilter, setFactionFilter] = useState("all");
  const [mkFilter, setMkFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [obtainableOnly, setObtainableOnly] = useState(false);
  const { settings } = useSettings();

  const { data: knownFactions = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["factions-known"],
    queryFn: () => fetch("/api/v1/factions/known").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: playerLicences = [] } = useQuery<{ faction_id: string; licence_type: string }[]>({
    queryKey: ["player-licences"],
    queryFn: () => fetch("/api/v1/player/licences").then(r => r.json()),
  });

  const playerLicenceSet = useMemo(() => {
    const set = new Set<string>();
    for (const l of playerLicences) set.add(`${l.faction_id}:${l.licence_type}`);
    return set;
  }, [playerLicences]);

  const { data: rawItems = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["equipment"],
    queryFn: () =>
      fetch("/api/v1/equipment?limit=2000")
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 5 * 60_000,
  });

  // Filter by known factions when fog of war is on
  const items = useMemo(() => {
    if (!settings.fogOfWar) return rawItems;
    return rawItems.filter(
      (e) => e.faction_id == null || knownFactions[e.faction_id] !== false
    );
  }, [rawItems, knownFactions, settings.fogOfWar]);

  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cat of CATEGORIES) c[cat.id] = items.filter((e) => cat.match(e.kind)).length;
    return c;
  }, [items]);

  const category = CATEGORIES.find((c) => c.id === catId) ?? CATEGORIES[0];

  const inCategory = useMemo(() => items.filter((e) => category.match(e.kind)), [items, category]);

  const sizes = useMemo(
    () =>
      [...new Set(inCategory.map((e) => e.size).filter((s): s is string => !!s))].sort(
        (a, b) => (SIZE_ORDER[a] ?? 9) - (SIZE_ORDER[b] ?? 9)
      ),
    [inCategory]
  );

  const shortToFullFaction = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of factions) {
      if (f.short_name) map.set(f.short_name.toLowerCase(), f.faction_id);
      map.set(f.faction_id.substring(0, 3), f.faction_id);
      map.set(f.faction_id, f.faction_id);
    }
    return map;
  }, [factions]);

  const availableFactions = useMemo(() => {
    const items = inCategory.filter(e => size ? e.size === size : true);
    const set = new Set(items.map(i => i.faction_id ? (shortToFullFaction.get(i.faction_id) ?? i.faction_id) : null).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [inCategory, size, shortToFullFaction]);

  const availableMks = useMemo(() => {
    const items = inCategory.filter(e => size ? e.size === size : true);
    const set = new Set(items.map(i => i.mk).filter(Boolean) as number[]);
    return Array.from(set).sort((a, b) => a - b);
  }, [inCategory, size]);

  const availableTypes = useMemo(() => {
    if (!["weapon", "turret"].includes(category.id)) return [];
    const items = inCategory.filter(e => size ? e.size === size : true);
    const set = new Set(items.map(i => getWeaponType(i.name)));
    return Array.from(set).sort();
  }, [inCategory, size, category.id]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return inCategory.filter((e) => {
      if (size && e.size !== size) return false;
      if (needle && !e.name.toLowerCase().includes(needle)) return false;
      
      if (factionFilter !== "all") {
        const resolvedFaction = e.faction_id ? (shortToFullFaction.get(e.faction_id) ?? e.faction_id) : null;
        if (resolvedFaction !== factionFilter) return false;
      }
      if (mkFilter !== "all" && e.mk?.toString() !== mkFilter) return false;
      if (typeFilter !== "all" && ["weapon", "turret"].includes(category.id)) {
        if (getWeaponType(e.name) !== typeFilter) return false;
      }
      
      if (obtainableOnly) {
        const resolvedFactionId = e.faction_id ? (shortToFullFaction.get(e.faction_id) ?? e.faction_id) : null;
        const isGen = e.restriction_licence === 'generaluseequipment' || e.restriction_licence === 'generaluseship';
        if (!(!e.restriction_licence || isGen || (resolvedFactionId && playerLicenceSet.has(`${resolvedFactionId}:${e.restriction_licence}`)))) {
          return false;
        }
      }

      return true;
    });
  }, [inCategory, size, search, factionFilter, mkFilter, typeFilter, category.id, shortToFullFaction, obtainableOnly, playerLicenceSet]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-5">
        <h1 className="text-2xl font-bold tracking-tight">Equipment</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          Compare ship parts — pick a category and size, ranked by the stat that matters.
        </p>
        {/* Category tabs */}
        <PageTabs>
          {CATEGORIES.filter((c) => counts[c.id] > 0).map((c) => (
            <PageTab
              key={c.id}
              active={c.id === catId}
              onClick={() => {
                setCatId(c.id);
                setSize(null);
                setFactionFilter("all");
                setMkFilter("all");
                setTypeFilter("all");
              }}
            >
              {c.label} <span className="text-xs text-muted-foreground ml-1">{counts[c.id]}</span>
            </PageTab>
          ))}
        </PageTabs>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-4 flex flex-col">
        <HUDCard className="h-full">

          {/* Toolbar: Sizes + Filters + Search */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border/50 bg-muted/5 px-6 py-3 relative z-10">
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search parts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 bg-muted/50 border-input focus-visible:ring-1 focus-visible:ring-primary/50 pl-9"
              />
            </div>
        {sizes.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <FilterPill active={size === null} onClick={() => setSize(null)}>
              All sizes
            </FilterPill>
            {sizes.map((s) => (
              <FilterPill
                key={s}
                active={false}
                onClick={() => setSize(s)}
                className={cn(
                  "border border-transparent",
                  size === s
                    ? cn(getClassColor(s), "border-current opacity-100 font-bold")
                    : size === null
                    ? "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    : "bg-muted/30 text-muted-foreground opacity-60 hover:opacity-100 hover:bg-muted"
                )}
              >
                {classFull(s)}
              </FilterPill>
            ))}
          </div>
        )}
        
        <EquipmentFilterBar
          categoryKind={category.id}
          availableFactions={availableFactions}
          factions={factions}
          factionFilter={factionFilter}
          setFactionFilter={setFactionFilter}
          availableMks={availableMks}
          mkFilter={mkFilter}
          setMkFilter={setMkFilter}
          availableTypes={availableTypes}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          showObtainableOnly={true}
          obtainableOnly={obtainableOnly}
          setObtainableOnly={setObtainableOnly}
          showSort={false} // Table has its own column headers for sorting
        />
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <PageLoaderPreset preset="equipment" />
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No parts match.</p>
        ) : (
          <EquipmentTable
            category={category}
            items={shown}
            factions={factions}
            onSelect={setSelectedEquipment}
          />
        )}
          </div>
        </HUDCard>
      </div>

      <Dialog open={selectedEquipment !== null} onOpenChange={(open) => { if (!open) setSelectedEquipment(null); }}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedEquipment?.name ?? "Equipment details"}</DialogTitle>
            <DialogDescription>Detailed stats for {selectedEquipment?.name}</DialogDescription>
          </DialogHeader>
          {selectedEquipment && <EquipmentDetailPanel item={selectedEquipment} factions={factions} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

