import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, Gauge, Shield, Aperture, MoveVertical, Cpu, ShoppingCart, Trash2, X, Wrench, Search, ChevronDown, Check, Minus, Info } from "lucide-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSettings } from "../../lib/settingsStore";
import { PageLoaderPreset } from "../../components/PageLoader";
import { Currency } from "../../components/Currency";
import { EntityIcon } from "../../components/EntityIcon";
import { FactionBadge } from "../../components/FactionBadge";
import { StatBar } from "../../components/StatBar";
import { classFull, classShort, getMkGradientClass } from "../../lib/formatters";
import type { FactionSummary } from "../../lib/map/types";
import { cn } from "../../lib/utils";
import { Card, CardContent } from "../../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { ShipClassBadge, ShipTypeBadge, EquipmentMkBadge } from "../../components/ShipBadges";
import { FactionCombobox } from "../../components/FactionCombobox";
import { ShipImage } from "../../components/ShipImage";

// ── Types ──────────────────────────────────────────────────────────────────────

type EngineStats = {
  thrust_forward: number | null; travel_thrust: number | null; boost_thrust: number | null; thrust_strafe: number | null;
  thrust_reverse?: number | null; travel_charge?: number | null; boost_duration?: number | null; mk?: number | null;
};
type ShieldStats = {
  capacity: number | null; recharge_rate: number | null; recharge_delay?: number | null; mk?: number | null;
};
type WeaponStats = {
  damage: number | null; reload_rate: number | null; bullet_amount: number | null;
  rotation_speed?: number | null; shield_damage?: number | null; hull_damage?: number | null;
  bullet_speed?: number | null; bullet_lifetime?: number | null; mk?: number | null;
};

type ShipSummary = { ship_id: string; name: string; class_id: string; faction_id: string | null; role: string | null; icon_url: string | null; image_url: string | null; price_avg: number | null; };
type ShipDetail = ShipSummary & {
  ship_type: string | null;
  speed_max: number | null; travel_max: number | null; boost_max: number | null;
  pitch_max: number | null; yaw_max: number | null; roll_max: number | null;
  shield_capacity_max: number | null; shield_recharge_max: number | null; radar_range: number | null;
  hull: number | null; cargo_volume: number | null; mass: number | null; drag_forward: number | null;
  people_capacity: number | null; drone_storage: number | null; missile_storage: number | null;
  deployable_storage: number | null; countermeasure_storage: number | null;
  weapons_s: number; weapons_m: number; weapons_l: number; weapons_xl: number;
  turrets_s: number; turrets_m: number; turrets_l: number; turrets_xl: number;
  shields_s: number; shields_m: number; shields_l: number; shields_xl: number;
  engines_s: number; engines_m: number; engines_l: number; engines_xl: number;
};

type EquipmentItem = {
  ware_id: string; name: string; kind: string; size: string | null; mk: number | null;
  faction_id: string | null; price_min: number | null; price_avg: number | null; price_max: number | null;
  icon_url: string | null;
  restriction_licence: string | null;
  engine_stats: EngineStats | null; shield_stats: ShieldStats | null; weapon_stats: WeaponStats | null;
};

// ── Categories ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "engine",   label: "Engines",   kind: "engine",   slotKey: "engines", icon: Gauge },
  { id: "thruster", label: "Thrusters", kind: "thruster", slotKey: "engines", icon: MoveVertical },
  { id: "shield",   label: "Shields",   kind: "shield",   slotKey: "shields", icon: Shield },
  { id: "weapon",   label: "Weapons",   kind: "weapon",   slotKey: "weapons", icon: Crosshair },
  { id: "turret",   label: "Turrets",   kind: "turret",   slotKey: "turrets", icon: Aperture },
  { id: "software",   label: "Software",    kind: "software",       slotKey: "software",       icon: Cpu },
  { id: "consumable", label: "Consumables", kind: "consumable",    slotKey: "consumable",    icon: ShoppingCart },
] as const;

// ── Slot helpers ───────────────────────────────────────────────────────────────

type SlotDef = { key: string; kind: string; size: string; index: number };

function generateSlots(ship: ShipDetail): SlotDef[] {
  const slots: SlotDef[] = [];
  const shipSize = ship.class_id.replace("ship_", ""); // "xs", "s", "m", "l", "xl"

  for (const cat of CATEGORIES) {
    if (cat.kind === "thruster") {
      slots.push({ key: `thruster-${shipSize}-0`, kind: "thruster", size: shipSize, index: 0 });
      continue;
    }
    if (cat.kind === "software") {
      const softwareTypes = ["dock", "economy", "flightassist", "scannerlongrange", "scannermining", "scannerobject", "target", "trade"];
      for (let i = 0; i < softwareTypes.length; i++) {
        slots.push({ key: `software-${softwareTypes[i]}-0`, kind: "software", size: softwareTypes[i], index: i });
      }
      continue;
    }
    if (cat.kind === "consumable") {
      // Consumables have storage counts, not slot counts
      if ((ship.missile_storage ?? 0) > 0)
        slots.push({ key: "consumable-missile-0", kind: "missile", size: "missile", index: 0 });
      if ((ship.countermeasure_storage ?? 0) > 0)
        slots.push({ key: "consumable-countermeasure-0", kind: "countermeasure", size: "countermeasure", index: 0 });
      if ((ship.deployable_storage ?? 0) > 0)
        slots.push({ key: "consumable-deployable-0", kind: "deployable", size: "deployable", index: 0 });
      if ((ship.drone_storage ?? 0) > 0)
        slots.push({ key: "consumable-drone-0", kind: "drone", size: "drone", index: 0 });
      continue;
    }

    for (const size of ["s", "m", "l", "xl"] as const) {
      const key = `${cat.slotKey}_${size}` as keyof ShipDetail;
      const count = ship[key] as number ?? 0;
      for (let i = 0; i < count; i++)
        slots.push({ key: `${cat.kind}-${size}-${i}`, kind: cat.kind, size, index: i });
    }
  }
  return slots;
}


// ── Derived stats ──────────────────────────────────────────────────────────────

const dps = (w: WeaponStats | null): number | null =>
  w?.damage == null ? null : Math.round(w.damage * (w.bullet_amount ?? 1) * (w.reload_rate ?? 1));

function fmtStat(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

const THRUST_MAX: Record<string, number> = { xs: 500, s: 1000, m: 2500, l: 6000, xl: 15000 };
const TRAVEL_MAX: Record<string, number> = { xs: 25, s: 25, m: 20, l: 50, xl: 50 };
const BOOST_MAX: Record<string, number> = { xs: 10, s: 10, m: 10, l: 10, xl: 10 };
const STRAFE_MAX: Record<string, number> = { xs: 200, s: 600, m: 1500, l: 2000, xl: 3500 };

const SHIELD_MAX: Record<string, number> = { xs: 500, s: 1600, m: 10000, l: 70000, xl: 170000 };
const RECHARGE_MAX: Record<string, number> = { xs: 100, s: 250, m: 100, l: 450, xl: 900 };

const DPS_MAX: Record<string, number> = { xs: 200, s: 400, m: 1200, l: 3000, xl: 3000 };
const RANGE_MAX: Record<string, number> = { xs: 5, s: 10, m: 15, l: 20, xl: 20 };
const ROTATION_MAX: Record<string, number> = { xs: 250, s: 200, m: 250, l: 100, xl: 50 };

export const SHIP_HULL_MAX: Record<string, number> = { xs: 2000, s: 6700, m: 39000, l: 211000, xl: 1190000 };
export const SHIP_SHIELD_MAX: Record<string, number> = { xs: 2000, s: 6300, m: 27597, l: 411000, xl: 998000 };
export const SHIP_REGEN_MAX: Record<string, number> = { xs: 500, s: 970, m: 231, l: 3000, xl: 6300 };
export const SHIP_SPEED_MAX: Record<string, number> = { xs: 4000, s: 1200, m: 1200, l: 500, xl: 1000 };
export const SHIP_TRAVEL_MAX: Record<string, number> = { xs: 50000, s: 15000, m: 15000, l: 12000, xl: 20000 };
export const SHIP_BOOST_MAX: Record<string, number> = { xs: 25000, s: 7000, m: 9000, l: 2500, xl: 2500 };
export const SHIP_ACCEL_MAX: Record<string, number> = { xs: 500, s: 200, m: 150, l: 50, xl: 50 };
export const SHIP_CARGO_MAX: Record<string, number> = { xs: 10, s: 20000, m: 50000, l: 100000, xl: 200000 };
export const SHIP_CREW_MAX: Record<string, number> = { xs: 2, s: 7, m: 25, l: 225, xl: 405 };
export const SHIP_MISSILE_MAX: Record<string, number> = { xs: 20, s: 50, m: 100, l: 310, xl: 500 };
export const SHIP_DPS_MAX: Record<string, number> = { xs: 1000, s: 1824, m: 9000, l: 33567, xl: 110254 };

type SortOption = { id: string; label: string; eval: (e: EquipmentItem) => number | string; desc?: boolean; };

const BASE_SORTS: SortOption[] = [
  { id: "price_asc", label: "Cost", eval: e => e.price_avg ?? 0 },
  { id: "price_desc", label: "Cost (Highest)", eval: e => e.price_avg ?? 0, desc: true },
  { id: "mk_desc", label: "Mark", eval: e => e.mk ?? 0, desc: true },
  { id: "name_asc", label: "Name", eval: e => e.name },
];

const CATEGORY_SORTS: Record<string, SortOption[]> = {
  engine: [
    { id: "thrust_desc", label: "Thrust", eval: e => e.engine_stats?.thrust_forward ?? 0, desc: true },
    { id: "travel_desc", label: "Travel Thrust", eval: e => e.engine_stats?.travel_thrust ?? 0, desc: true },
    { id: "boost_desc", label: "Boost Thrust", eval: e => e.engine_stats?.boost_thrust ?? 0, desc: true },
  ],
  thruster: [
    { id: "strafe_desc", label: "Strafe Thrust", eval: e => e.engine_stats?.thrust_strafe ?? 0, desc: true },
  ],
  shield: [
    { id: "cap_desc", label: "Capacity", eval: e => e.shield_stats?.capacity ?? 0, desc: true },
    { id: "rech_desc", label: "Recharge", eval: e => e.shield_stats?.recharge_rate ?? 0, desc: true },
  ],
  weapon: [
    { id: "type_asc", label: "Type", eval: e => getWeaponType(e.name) },
    { id: "dps_desc", label: "DPS", eval: e => dps(e.weapon_stats) ?? 0, desc: true },
    { id: "range_desc", label: "Range", eval: e => (e.weapon_stats?.bullet_speed ?? 0) * (e.weapon_stats?.bullet_lifetime ?? 0), desc: true },
  ],
  turret: [
    { id: "type_asc", label: "Type", eval: e => getWeaponType(e.name) },
    { id: "dps_desc", label: "DPS", eval: e => dps(e.weapon_stats) ?? 0, desc: true },
    { id: "range_desc", label: "Range", eval: e => (e.weapon_stats?.bullet_speed ?? 0) * (e.weapon_stats?.bullet_lifetime ?? 0), desc: true },
  ],
};

type StatDisplay = { label: string; value: number; max: number; isLog: boolean; format: (n: number) => string; color?: string };

function getEquipmentStats(item: EquipmentItem): { bars: StatDisplay[], texts: string[] } {
  const size = item.size?.toLowerCase() || 's';
  const bars: StatDisplay[] = [];
  const texts: string[] = [];

  if (item.kind === "engine" && item.engine_stats) {
    const e = item.engine_stats;
    if (e.thrust_forward) bars.push({ label: "Thrust", value: e.thrust_forward, max: THRUST_MAX[size] || 6000, isLog: false, format: n => fmtStat(n) + " N" });
    if (e.travel_thrust) bars.push({ label: "Travel", value: e.travel_thrust, max: TRAVEL_MAX[size] || 25, isLog: false, format: n => `${n.toFixed(1)}×`, color: "#3b82f6" });
    if (e.boost_thrust) bars.push({ label: "Boost", value: e.boost_thrust, max: BOOST_MAX[size] || 10, isLog: false, format: n => `${n.toFixed(1)}×`, color: "#f97316" });
  }
  else if (item.kind === "thruster" && item.engine_stats) {
    const e = item.engine_stats;
    if (e.thrust_strafe) bars.push({ label: "Strafe", value: e.thrust_strafe, max: STRAFE_MAX[size] || 1000, isLog: false, format: n => fmtStat(n) + " N", color: "#14b8a6" });
    if (e.thrust_forward) bars.push({ label: "Forward", value: e.thrust_forward, max: THRUST_MAX[size] || 1000, isLog: false, format: n => fmtStat(n) + " N" });
  }
  else if (item.kind === "shield" && item.shield_stats) {
    const s = item.shield_stats;
    if (s.capacity) bars.push({ label: "Capacity", value: s.capacity, max: SHIELD_MAX[size] || 20000, isLog: false, format: n => fmtStat(n) + " MJ" });
    if (s.recharge_rate) bars.push({ label: "Recharge", value: s.recharge_rate, max: RECHARGE_MAX[size] || 1000, isLog: false, format: n => `${fmtStat(n)}/s`, color: "#06b6d4" });
    if (s.recharge_delay) texts.push(`${s.recharge_delay.toFixed(1)}s delay`);
  }
  else if ((item.kind === "weapon" || item.kind === "turret") && item.weapon_stats) {
    const w = item.weapon_stats;
    const d = dps(w);
    if (d) bars.push({ label: "DPS", value: d, max: DPS_MAX[size] || 2000, isLog: false, format: fmtStat });
    
    const rawRange = w.bullet_speed && w.bullet_lifetime ? (w.bullet_speed * w.bullet_lifetime) / 1000 : 0;
    if (rawRange > 0) {
      bars.push({ label: "Range", value: Math.min(rawRange, RANGE_MAX[size] || 20), max: RANGE_MAX[size] || 20, isLog: false, format: n => `${n.toFixed(1)}km`, color: "#a855f7" });
    }
    if (w.rotation_speed) bars.push({ label: "Rotation", value: w.rotation_speed, max: ROTATION_MAX[size] || 200, isLog: false, format: n => `${n.toFixed(0)}°/s`, color: "#10b981" });
  }
  else if (item.kind === "missile" && item.weapon_stats) {
    const w = item.weapon_stats;
    if (w.damage) texts.push(`${fmtStat(w.damage)} dmg`);
    if (w.reload_rate) texts.push(`${w.reload_rate.toFixed(1)}/s reload`);
    if (w.bullet_speed) texts.push(`${fmtStat(w.bullet_speed)} m/s`);
  }
  return { bars, texts };
}

// ── Searchable ship selector ───────────────────────────────────────────────────

const SHIP_CLASSES = ["XS", "S", "M", "L", "XL"] as const;

function ShipSelector({
  ships, selectedId, onSelect,
}: { ships: ShipSummary[]; selectedId?: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [classFilters, setClassFilters] = useState<Set<string>>(new Set());
  const [roleFilters, setRoleFilters] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const selectedShip = ships.find(s => s.ship_id === selectedId);

  const allRoles = useMemo(() =>
    [...new Set(ships.map(s => s.role).filter(Boolean) as string[])].sort(),
  [ships]);

  const filtered = useMemo(() => {
    let list = ships;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    if (classFilters.size > 0) list = list.filter(s => classFilters.has(classShort(s.class_id)));
    if (roleFilters.size > 0) list = list.filter(s => s.role != null && roleFilters.has(s.role));
    return list;
  }, [ships, search, classFilters, roleFilters]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const toggleClass = (c: string) => setClassFilters(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleRole = (r: string) => setRoleFilters(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n; });

  return (
    <div ref={ref} className="relative w-72">
      <button
        onClick={() => { setOpen(!open); if (!open) setSearch(""); }}
        className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent/50 transition-colors"
      >
        {selectedShip ? (
          <>
            <EntityIcon src={selectedShip.icon_url} alt={selectedShip.name} size={20} />
            <span className="flex-1 text-left truncate">{selectedShip.name}</span>
            <ShipClassBadge class_id={selectedShip.class_id} className="text-[9px] px-1 py-0 shrink-0" />
          </>
        ) : (
          <span className="flex-1 text-left text-muted-foreground">Select a ship…</span>
        )}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[420px] border border-border rounded-md bg-popover shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ships…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
          </div>
          {/* Filter pills */}
          <div className="px-3 py-2 border-b border-border flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">Class:</span>
              {SHIP_CLASSES.map(c => (
                <button key={c} onClick={() => toggleClass(c)}
                  className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium uppercase transition-colors",
                    classFilters.has(c) ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground")}>
                  {classFull(`ship_${c}`)?.replace("Ship ","") ?? c}
                </button>
              ))}
            </div>
            {allRoles.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">Type:</span>
                {allRoles.map(r => (
                  <button key={r} onClick={() => toggleRole(r)}
                    className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium capitalize transition-colors",
                      roleFilters.has(r) ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground")}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Results */}
          <div className="max-h-64 overflow-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground text-center">No ships match</p>
            ) : (
              filtered.map(s => (
                <button key={s.ship_id}
                  onClick={() => { onSelect(s.ship_id); setOpen(false); setSearch(""); setClassFilters(new Set()); setRoleFilters(new Set()); }}
                  className={cn("flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                    s.ship_id === selectedId && "bg-primary/10 text-primary")}>
                  <EntityIcon src={s.icon_url} alt={s.name} size={20} />
                  <span className="flex-1 truncate">{s.name}</span>
                  <ShipTypeBadge role={s.role} className="text-[8px] px-1 py-0 shrink-0" />
                  <ShipClassBadge class_id={s.class_id} className="text-[8px] px-1 py-0 shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shopping cart ──────────────────────────────────────────────────────────────

function getCategoryStatus(kind: string, slots: SlotDef[], cart: Record<string, EquipmentItem | null>) {
  const equippedCount = slots.filter(s => cart[s.key]).length;
  const isRequired = kind === "engine" || kind === "thruster" || kind === "software";
  
  if (kind === "software") {
    const hasDock = slots.some(s => s.size === "dock" && cart[s.key]);
    const hasLongRangeScanner = slots.some(s => s.size === "scannerlongrange" && cart[s.key]);
    const hasObjectScanner = slots.some(s => s.size === "scannerobject" && cart[s.key]);
    const hasFlightAssist = slots.some(s => s.size === "flightassist" && cart[s.key]);
    
    const meetsMinimum = hasDock && hasLongRangeScanner && hasObjectScanner && hasFlightAssist;
    if (!meetsMinimum) return "missing";
    if (equippedCount === slots.length) return "full";
    return "partial";
  }

  if (slots.length === 0) return "none";
  if (equippedCount === slots.length) return "full";
  if (equippedCount > 0) return "partial";
  return isRequired ? "missing" : "empty";
}

function CategoryStatusDot({ kind, slots, cart }: { kind: string; slots: SlotDef[]; cart: Record<string, EquipmentItem | null> }) {
  const status = getCategoryStatus(kind, slots, cart);
  if (status === "full") return <div className="w-2 h-2 shrink-0 rounded-full bg-emerald-500" title="Fully equipped" />;
  if (status === "partial") return <div className="w-2 h-2 shrink-0 rounded-full bg-amber-500" title="Partially equipped" />;
  if (status === "missing") return <div className="w-2 h-2 shrink-0 rounded-full bg-destructive" title="Required component missing" />;
  return <div className="w-2 h-2 shrink-0 rounded-full bg-muted-foreground/30" title="Optional/Empty" />;
}

function CartPanel({
  slots, cart, onRemove, onClear, totalCost, onSelectCategory, shipDetail
}: {
  slots: SlotDef[]; cart: Record<string, EquipmentItem | null>;
  onRemove: (k: string) => void; onClear: () => void; totalCost: number;
  onSelectCategory: (c: string) => void; shipDetail?: ShipDetail;
}) {
  const byKind = new Map<string, SlotDef[]>();
  for (const s of slots) { if (!byKind.has(s.kind)) byKind.set(s.kind, []); byKind.get(s.kind)!.push(s); }

  return (
    <div className="flex flex-col h-full border border-border rounded-lg bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/20">
        <ShoppingCart className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold flex-1">Shopping List</span>
        <button onClick={onClear} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors" title="Clear all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-3 text-sm">
        {shipDetail && (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 w-full text-left">
              <div className="w-2 h-2 shrink-0 rounded-full bg-emerald-500" />
              <span>Hull</span>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs border-primary/30 bg-primary/5">
              <EntityIcon src={shipDetail.icon_url} alt={shipDetail.name} size={20} />
              <span className="flex-1 truncate font-medium">{shipDetail.name} (Base)</span>
              {shipDetail.price_avg && <span className="text-[10px] tabular-nums text-muted-foreground" title="Base price"><Currency value={shipDetail.price_avg} /></span>}
            </div>
          </div>
        )}
        {[...byKind.entries()].map(([kind, kindSlots]) => {
          const cat = CATEGORIES.find(c => c.kind === kind);
          const equipped = kindSlots.filter(s => cart[s.key]).length;
          return (
            <div key={kind}>
              <button 
                onClick={() => onSelectCategory(cat?.id ?? kind)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 hover:text-foreground transition-colors w-full text-left"
              >
                <CategoryStatusDot kind={kind} slots={kindSlots} cart={cart} />
                <span>{cat?.label ?? kind}</span>
                <span className="font-normal text-[10px]">({equipped}/{kindSlots.length})</span>
              </button>
              <div className="space-y-1">
                {kindSlots.map(slot => {
                  const item = cart[slot.key];
                  return (
                    <div key={slot.key} className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs",
                      item ? "border-primary/30 bg-primary/5" : "border-dashed border-border/50 bg-muted/5")}>
                      {item ? (
                        <>
                          <EntityIcon src={item.icon_url} alt={item.name} size={20} />
                          <span className="flex-1 truncate font-medium">{item.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase font-mono">{slot.size}</span>
                          {item.price_avg && <span className="text-[10px] tabular-nums text-muted-foreground" title="Base price"><Currency value={item.price_avg} /></span>}
                          <button onClick={() => onRemove(slot.key)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0"><X className="w-3 h-3" /></button>
                        </>
                      ) : (
                        <>
                          <div className="w-5 h-5 rounded bg-muted/20 shrink-0" />
                          <span className="flex-1 text-muted-foreground/50 italic">Empty</span>
                          <span className="text-[10px] text-muted-foreground/40 uppercase font-mono">{slot.size}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-3 py-2.5 border-t border-border flex items-center justify-between bg-muted/20">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</span>
        <span className="text-sm font-bold tabular-nums"><Currency value={totalCost} /></span>
      </div>
    </div>
  );
}



const getWeaponType = (name: string) => {
  return name
    .replace(/^(ARG|TEL|PAR|SPL|TER|BOR|PIO|VIG|RIP|XEN|KHA|ATF)\s+/i, '')
    .replace(/^(S|M|L|XL)\s+/i, '')
    .replace(/\s+Mk\d+$/i, '')
    .trim() || "Other";
};

const LICENCE_NAMES: Record<string, string> = {
  militaryequipment: "Military Equipment",
  capitalequipment: "Capital Ship",
  stationequipment: "Station Equipment",
  police: "Police",
  illegal: "Illegal",
};
const formatLicence = (l: string | null) => l ? (LICENCE_NAMES[l] || l.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())) : "";

// ── Equipment card ─────────────────────────────────────────────────────────────

function EquipmentCard({
  item, slots, cart, onAdd, onRemove, factionMap, shortToFullFaction, playerLicenceSet
}: {
  item: EquipmentItem; slots: SlotDef[]; cart: Record<string, EquipmentItem | null>;
  onAdd: (k: string, i: EquipmentItem) => void; onRemove: (k: string) => void;
  factionMap: Map<string, any>;
  shortToFullFaction: Map<string, string>;
  playerLicenceSet: Set<string>;
}) {
  const equippedSlots = slots.filter(s => cart[s.key]?.ware_id === item.ware_id);
  const isEquipped = equippedSlots.length > 0;
  const emptySlots = slots.filter(s => s.kind === item.kind && s.size === item.size && cart[s.key] === null);
  
  const resolvedFactionId = item.faction_id ? (shortToFullFaction.get(item.faction_id) ?? item.faction_id) : null;
  const isGeneral = item.restriction_licence === 'generaluseequipment' || item.restriction_licence === 'generaluseship';
  const isObtainable = !item.restriction_licence || isGeneral || (resolvedFactionId && playerLicenceSet.has(`${resolvedFactionId}:${item.restriction_licence}`));
  
  const canAdd = emptySlots.length > 0 && isObtainable;
  const { bars, texts } = getEquipmentStats(item);

  return (
    <Card
      className={cn(
        "relative flex flex-col overflow-hidden transition-all text-left group select-none",
        isEquipped && !canAdd
          ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
          : isEquipped && canAdd
            ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20 hover:bg-emerald-500/10 cursor-pointer hover:shadow-md"
            : canAdd
              ? "hover:border-primary/40 hover:bg-accent/30 cursor-pointer hover:shadow-md"
              : "border-border/50 bg-muted/5 opacity-40 cursor-not-allowed"
      )}
      onClick={(e) => { 
        if (canAdd) {
          if (e.shiftKey) {
            emptySlots.forEach(s => onAdd(s.key, item));
          } else {
            onAdd(emptySlots[0].key, item);
          }
        }
      }}
      title={
        !isObtainable 
          ? `Requires ${formatLicence(item.restriction_licence)} Licence` 
          : canAdd 
            ? "Click to equip (Shift+Click to fill all)" 
            : "No compatible slots remaining"
      }
    >
      {isEquipped && (
        <div className="absolute top-1.5 right-1.5 flex items-stretch rounded-md bg-emerald-500 text-white shadow-sm z-10 overflow-hidden">
          <div className="px-1.5 py-0.5 text-[10px] font-bold border-r border-emerald-600/50 flex items-center justify-center">
            {equippedSlots.length}x
          </div>
          <button 
            className="px-1.5 py-0.5 hover:bg-emerald-600 transition-colors flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(equippedSlots[equippedSlots.length - 1].key);
            }}
            title="Remove one"
          >
            <Minus className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="p-3 pb-2 flex flex-col items-center gap-2">
        <div className={cn("w-14 h-14 flex items-center justify-center rounded-lg p-1 border group-hover:scale-105 transition-transform", getMkGradientClass(item.mk))}>
          <EntityIcon src={item.icon_url} alt={item.name} size={48} className="drop-shadow-[0_0_8px_rgba(0,0,0,0.4)]" />
        </div>
        <p className="text-[11px] font-semibold text-center leading-tight line-clamp-2 h-7 flex items-center">{item.name}</p>
        
        <div className="flex items-center gap-1 flex-wrap justify-center w-full">
          {item.size && <ShipClassBadge class_id={item.size} className="text-[9px] px-1.5 py-0 h-4 min-h-0" />}
          {item.faction_id && shortToFullFaction && (
            (() => {
              const resolvedFactionId = shortToFullFaction.get(item.faction_id) ?? item.faction_id;
              const itemFaction = factionMap.get(resolvedFactionId);
              if (!itemFaction) return null;
              return (
                <FactionBadge 
                  name={itemFaction.name} 
                  color_hex={itemFaction.color_hex} 
                  className={cn("text-[9px] px-1.5 py-0 h-4 min-h-0 font-normal border-opacity-50", !isObtainable && "opacity-50")} 
                />
              );
            })()
          )}
          {!isObtainable && item.restriction_licence && (
            <span className="text-[8px] bg-destructive/10 text-destructive px-1 py-0 rounded border border-destructive/20 font-bold uppercase" title={`Requires ${formatLicence(item.restriction_licence)} Licence`}>
              Missing Required Licence
            </span>
          )}
        </div>
      </div>
      
      <CardContent className="p-3 pt-0 flex flex-col gap-2 mt-auto">
        {bars.length > 0 && (
          <div className="w-full flex flex-col gap-2 items-center">
            {bars.map((b, i) => (
              <StatBar key={i} value={b.isLog ? Math.log10(b.value + 1) : b.value}
                max={b.isLog ? Math.log10(b.max + 1) : b.max}
                label={`${b.format(b.value)} ${b.label}`} width={110} color={b.color} />
            ))}
          </div>
        )}
        {texts.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center">
            {texts.map((t, i) => <span key={i} className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">{t}</span>)}
          </div>
        )}
        <div className="text-xs tabular-nums font-semibold text-center mt-1 border-t border-border/50 pt-2 text-muted-foreground" title="Base price. Actual game prices fluctuate based on station resource supply.">
          {item.price_avg != null ? <Currency value={item.price_avg} /> : "—"}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Stats footer ───────────────────────────────────────────────────────────────

function StatRow({ label, value, max, unit, isLog }: { label: string; value: number; max: number; unit?: string; isLog?: boolean }) {
  const scaledValue = isLog ? Math.log10(value + 1) : value;
  const scaledMax = isLog ? Math.log10(max + 1) : max;
  const pct = Math.max(0, Math.min(100, (scaledValue / scaledMax) * 100));
  
  // Use app standard StatBar colors
  const barColor = 
    pct >= 66 ? "hsl(142 71% 45%)" :
    pct >= 33 ? "hsl(38 92% 50%)" :
    "hsl(0 72% 51%)";

  return (
    <div className="flex items-center gap-3 py-1.5 group">
      <span className="w-28 shrink-0 text-[11px] uppercase font-bold tracking-wider text-muted-foreground group-hover:text-foreground transition-colors leading-tight">{label}</span>
      
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300 opacity-90 group-hover:opacity-100" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      
      <div className="w-16 shrink-0 flex justify-end items-baseline gap-1">
        <span className="font-mono text-[11px] text-foreground font-medium">
          {value >= 1000 ? (value/1000).toFixed(1) + "k" : value.toFixed(value < 10 && value % 1 !== 0 ? 1 : 0)}
        </span>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function StatsFooter({ ship, cart, slots }: {
  ship: ShipDetail; cart: Record<string, EquipmentItem | null>; slots: SlotDef[];
}) {
  const engines = slots.filter(s => s.kind === "engine").map(s => cart[s.key]).filter((e): e is EquipmentItem => e != null);
  const thrusters = slots.filter(s => s.kind === "thruster").map(s => cart[s.key]).filter((e): e is EquipmentItem => e != null);
  const shields = slots.filter(s => s.kind === "shield").map(s => cart[s.key]).filter((e): e is EquipmentItem => e != null);
  const weapons = slots.filter(s => s.kind === "weapon" || s.kind === "turret").map(s => cart[s.key]).filter((e): e is EquipmentItem => e != null);

  const thrust = engines.length > 0 ? engines.reduce((sum, e) => sum + (e.engine_stats?.thrust_forward ?? 0), 0) : 0;
  const drag = ship.drag_forward;
  const speed = thrust && drag && drag > 0 ? thrust / drag : 0;
  
  const mass = ship.mass ?? 1;
  const acceleration = engines.length > 0 ? thrust / mass : 0;
  
  const travelMult = engines.length > 0 ? engines.reduce((sum, e) => sum + (e.engine_stats?.travel_thrust ?? 0), 0) / engines.length : 0;
  const boostMult = engines.length > 0 ? engines.reduce((sum, e) => sum + (e.engine_stats?.boost_thrust ?? 0), 0) / engines.length : 0;
  
  const travelSpeed = speed * travelMult;
  const boostSpeed = speed * boostMult;
  
  const shieldCap = shields.length > 0
    ? shields.reduce((s, sh) => s + (sh.shield_stats?.capacity ?? 0), 0)
    : 0;
    
  const shieldRecharge = shields.length > 0
    ? shields.reduce((s, sh) => s + (sh.shield_stats?.recharge_rate ?? 0), 0)
    : 0;
    
  const strafeThrust = thrusters.length > 0 ? thrusters.reduce((sum, e) => sum + (e.engine_stats?.thrust_strafe ?? 0), 0) : 0;
  const handlingMult = strafeThrust > 0 ? (strafeThrust / 1000) : 0;
  const pitch = (ship.pitch_max ?? 0) * handlingMult;
  const yaw = (ship.yaw_max ?? 0) * handlingMult;

  const totalDps = weapons.reduce((sum, w) => sum + (dps(w.weapon_stats) ?? 0), 0);
  const weaponRange = weapons.length > 0 
    ? Math.min(30, Math.max(...weapons.map(w => (w.weapon_stats?.bullet_speed ?? 0) * (w.weapon_stats?.bullet_lifetime ?? 0) / 1000))) 
    : 0;
  const weaponTurn = weapons.length > 0 
    ? weapons.reduce((sum, w) => sum + (w.weapon_stats?.rotation_speed ?? 0), 0) / weapons.length 
    : 0;
  
  const cid = ship.class_id || "s";
  const maxHull = SHIP_HULL_MAX[cid] || 20_000;
  const maxShield = SHIP_SHIELD_MAX[cid] || 15_000;
  const maxRegen = SHIP_REGEN_MAX[cid] || 1_000;
  const maxCargo = SHIP_CARGO_MAX[cid] || 5_000;
  const maxCrew = SHIP_CREW_MAX[cid] || 40;
  const maxSpeed = SHIP_SPEED_MAX[cid] || 800;
  const maxTravel = SHIP_TRAVEL_MAX[cid] || 10_000;
  const maxBoost = SHIP_BOOST_MAX[cid] || 4_000;
  const maxAccel = SHIP_ACCEL_MAX[cid] || 150;
  const maxMissile = SHIP_MISSILE_MAX[cid] || 100;
  const maxDps = SHIP_DPS_MAX[cid] || 5_000;
  const maxRange = RANGE_MAX[cid] || 20;

  return (
    <div className="bg-muted/10 border-t border-border/50 text-sm overflow-y-auto w-full max-h-[35vh]">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between border-b border-border/30">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          Progress bars indicate % of absolute {cid.toUpperCase()}-class limit
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 pt-3">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Flight</div>
          <div className="flex flex-col gap-1.5">
            <StatRow label="Top Speed" value={speed} max={maxSpeed} unit="m/s" />
            <StatRow label="Travel Speed" value={travelSpeed} max={maxTravel} unit="m/s" />
            <StatRow label="Boost Speed" value={boostSpeed} max={maxBoost} unit="m/s" />
            <StatRow label="Acceleration" value={acceleration} max={maxAccel} unit="m/s²" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Defense</div>
          <div className="flex flex-col gap-1.5">
            <StatRow label="Hull Capacity" value={ship.hull ?? 0} max={maxHull} unit="HP" />
            <StatRow label="Shield Capacity" value={shieldCap} max={maxShield} unit="MJ" />
            <StatRow label="Shield Regen" value={shieldRecharge} max={maxRegen} unit="MW/s" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Logistics</div>
          <div className="flex flex-col gap-1.5">
            <StatRow label="Cargo Bay" value={ship.cargo_volume ?? 0} max={maxCargo} unit="m³" />
            <StatRow label="Crew Capacity" value={ship.people_capacity ?? 0} max={maxCrew} unit="Crew" />
            <StatRow label="Deployables" value={ship.deployable_storage ?? 0} max={100} unit="Units" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Offense</div>
          <div className="flex flex-col gap-1.5">
            <StatRow label="Weapon DPS" value={totalDps} max={maxDps} unit="/s" />
            <StatRow label="Weapon Range" value={weaponRange} max={maxRange} unit="km" />
            <StatRow label="Missile Cap" value={ship.missile_storage ?? 0} max={maxMissile} unit="Ms" />
          </div>
        </div>
      </div>

      <div className="border-t border-border/30 bg-muted/5 p-4 flex flex-wrap justify-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground uppercase">Pitch Rate:</span><span className="text-xs font-semibold">{Math.round(pitch)} °/s</span></div>
        <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground uppercase">Yaw Rate:</span><span className="text-xs font-semibold">{Math.round(yaw)} °/s</span></div>
        <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground uppercase">Strafe Thrust:</span><span className="text-xs font-semibold">{Math.round(strafeThrust)}</span></div>
        <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground uppercase">Weapon Turn:</span><span className="text-xs font-semibold">{Math.round(weaponTurn)} °/s</span></div>
        
        <div className="w-[1px] h-4 bg-border/50 mx-2 hidden sm:block" />
        
        <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground uppercase">Drone Bay:</span><span className="text-xs font-semibold">{ship.drone_storage ?? 0}</span></div>
        <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground uppercase">Flares:</span><span className="text-xs font-semibold">{ship.countermeasure_storage ?? 0}</span></div>
        <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground uppercase">Radar:</span><span className="text-xs font-semibold">{((ship.radar_range ?? 0) / 1000).toFixed(0)} km</span></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function BuilderPage() {
  const { ship_id } = useSearch({ from: "/ships/builder" });
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [selectedShipId, setSelectedShipId] = useState<string | undefined>(ship_id);
  const [activeCategory, setActiveCategory] = useState<string>("engine");
  const [cart, setCart] = useState<Record<string, EquipmentItem | null>>({});
  const [factionFilter, setFactionFilter] = useState<string>("all");
  const [mkFilter, setMkFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortFilter, setSortFilter] = useState<string>("");
  const [obtainableOnly, setObtainableOnly] = useState<boolean>(false);

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

  const { data: allShips = [] } = useQuery<ShipSummary[]>({
    queryKey: ["ships"], queryFn: () => fetch("/api/v1/ships?limit=2000").then(r => r.json()),
  });

  // Filter ships by known factions when fog of war is on
  const ships = useMemo(() => {
    if (!settings.fogOfWar) return allShips;
    return allShips.filter(s => s.faction_id == null || knownFactions[s.faction_id] !== false);
  }, [allShips, knownFactions, settings.fogOfWar]);
  const { data: shipDetail, isLoading: isShipLoading } = useQuery<ShipDetail>({
    queryKey: ["ship", selectedShipId],
    queryFn: () => fetch(`/api/v1/ships/${selectedShipId}`).then(r => r.json()),
    enabled: !!selectedShipId,
  });
  const { data: equipment = [] } = useQuery<EquipmentItem[]>({
    queryKey: ["equipment"],
    queryFn: () => fetch("/api/v1/equipment?limit=2000").then(r => r.json()).then(d => {
      if (!Array.isArray(d)) return [];
      const items = d.filter((e: any) => {
        const id = e.ware_id.toLowerCase();
        return !(id.includes('xen_') || id.includes('kha_') || id.includes('yacht_01') || id.includes('battleship_01'));
      }).map((e: any) => {
        if (e.kind === "software") {
          e.size = e.ware_id.replace(/^software_/, '').replace(/mk\d+$/, '');
          const mkMatch = e.ware_id.match(/mk(\d+)$/);
          if (mkMatch) e.mk = parseInt(mkMatch[1]);
        }
        return e as EquipmentItem;
      });

      const uniqueItems = new Map<string, EquipmentItem>();
      for (const item of items) {
        const existing = uniqueItems.get(item.name);
        if (!existing || ((item.price_avg ?? 0) < (existing.price_avg ?? 0))) {
          uniqueItems.set(item.name, item);
        }
      }
      return Array.from(uniqueItems.values());
    }),
    staleTime: 5 * 60_000,
  });
  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"], queryFn: () => fetch("/api/v1/factions").then(r => r.json()),
  });

  const factionMap = new Map(factions.map(f => [f.faction_id, f]));
  const slots = useMemo(() => shipDetail ? generateSlots(shipDetail) : [], [shipDetail]);

  const shortToFullFaction = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of factions) {
      if (f.short_name) map.set(f.short_name.toLowerCase(), f.faction_id);
      map.set(f.faction_id.substring(0, 3), f.faction_id);
      map.set(f.faction_id, f.faction_id);
    }
    return map;
  }, [factions]);

  useEffect(() => {
    if (shipDetail) {
      const fresh: Record<string, EquipmentItem | null> = {};
      for (const s of generateSlots(shipDetail)) fresh[s.key] = null;
      setCart(fresh);
    }
  }, [shipDetail]);

  const category = CATEGORIES.find(c => c.id === activeCategory) ?? CATEGORIES[0];

  const availableFactions = useMemo(() => {
    if (!shipDetail) return [];
    const sizes = new Set(slots.filter(s => s.kind === category.kind).map(s => s.size));
    const items = equipment.filter(e => e.kind === category.kind && e.size != null && sizes.has(e.size));
    const set = new Set(items.map(i => i.faction_id ? (shortToFullFaction.get(i.faction_id) ?? i.faction_id) : null).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [equipment, category, shipDetail, slots, shortToFullFaction]);

  const availableMks = useMemo(() => {
    if (!shipDetail) return [];
    const sizes = new Set(slots.filter(s => s.kind === category.kind).map(s => s.size));
    const items = equipment.filter(e => e.kind === category.kind && e.size != null && sizes.has(e.size));
    const set = new Set(items.map(i => i.mk).filter(Boolean) as number[]);
    return Array.from(set).sort((a, b) => a - b);
  }, [equipment, category, shipDetail, slots]);

  const availableTypes = useMemo(() => {
    if (!shipDetail || !["weapon", "turret"].includes(category.kind)) return [];
    const sizes = new Set(slots.filter(s => s.kind === category.kind).map(s => s.size));
    const items = equipment.filter(e => e.kind === category.kind && e.size != null && sizes.has(e.size));
    const set = new Set(items.map(i => getWeaponType(i.name)));
    return Array.from(set).sort();
  }, [equipment, category, shipDetail, slots]);

  const compatibleEquipment = useMemo(() => {
    if (!shipDetail) return [];
    const sizes = new Set(slots.filter(s => s.kind === category.kind).map(s => s.size));
    let items: EquipmentItem[];
    if (category.kind === "consumable") {
      // Consumables span multiple equipment kinds
      const kinds = new Set(slots.filter(s => sizes.has(s.kind)).map(s => s.kind));
      items = equipment.filter(e => kinds.has(e.kind));
    } else if (category.kind === "software") {
      items = equipment.filter(e => e.kind === "software");
    } else {
      items = equipment.filter(e => e.kind === category.kind && e.size != null && sizes.has(e.size));
    }
    // Fog of war: hide equipment from unknown factions
    if (settings.fogOfWar) {
      items = items.filter(e => e.faction_id == null || knownFactions[e.faction_id] !== false);
    }
    if (factionFilter !== "all") {
      items = items.filter(e => (e.faction_id ? (shortToFullFaction.get(e.faction_id) ?? e.faction_id) : null) === factionFilter);
    }
    if (mkFilter !== "all") {
      items = items.filter(e => e.mk?.toString() === mkFilter);
    }
    if (typeFilter !== "all" && ["weapon", "turret"].includes(category.kind)) {
      items = items.filter(e => getWeaponType(e.name) === typeFilter);
    }
    
    if (obtainableOnly) {
      items = items.filter(e => {
        const resolvedFactionId = e.faction_id ? (shortToFullFaction.get(e.faction_id) ?? e.faction_id) : null;
        const isGen = e.restriction_licence === 'generaluseequipment' || e.restriction_licence === 'generaluseship';
        return !e.restriction_licence || isGen || (resolvedFactionId && playerLicenceSet.has(`${resolvedFactionId}:${e.restriction_licence}`));
      });
    }
    
    const validSorts = [...(CATEGORY_SORTS[category.kind] || []), ...BASE_SORTS];
    const defaultSortId = ["weapon", "turret"].includes(category.kind) ? "type_asc" : "price_asc";
    const activeSort = validSorts.find(s => s.id === sortFilter) || validSorts.find(s => s.id === defaultSortId) || BASE_SORTS[0];

    items.sort((a, b) => {
      const valA = activeSort.eval(a);
      const valB = activeSort.eval(b);
      if (typeof valA === "string" && typeof valB === "string") {
        return activeSort.desc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      }
      const numA = Number(valA);
      const numB = Number(valB);
      return activeSort.desc ? numB - numA : numA - numB;
    });

    return items;
  }, [equipment, category, shipDetail, slots, factionFilter, mkFilter, typeFilter, sortFilter, shortToFullFaction, settings.fogOfWar, knownFactions]);

  const totalCost = useMemo(() => {
    let t = shipDetail?.price_avg ?? 0;
    for (const s of slots) { 
      const it = cart[s.key]; 
      if (it?.price_avg) t += it.price_avg; 
    } 
    return t;
  }, [cart, slots, shipDetail]);

  const handleAdd = (k: string, i: EquipmentItem) => setCart(p => ({ ...p, [k]: i }));
  const handleRemove = (k: string) => setCart(p => ({ ...p, [k]: null }));
  const handleClearAll = () => setCart(p => { const f = { ...p }; for (const k of Object.keys(f)) f[k] = null; return f; });
  const handleShipSelect = (id: string) => { 
    setSelectedShipId(id); 
    navigate({ to: "/ships/builder", search: { ship_id: id } }); 
    setFactionFilter("all"); 
    setMkFilter("all"); 
    setTypeFilter("all");
    setSortFilter(""); 
    setObtainableOnly(false);
  };

  const shipFaction = shipDetail?.faction_id ? factionMap.get(shipDetail.faction_id) : undefined;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-card/30 shrink-0">
        <h1 className="text-lg font-bold">Ship Builder</h1>
        <ShipSelector ships={ships} selectedId={selectedShipId} onSelect={handleShipSelect} />
        <div className="flex-1" />
      </div>

      {isShipLoading ? (
        <PageLoaderPreset preset="builder" />
      ) : shipDetail ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Main row: cards | cart */}
          <div className="flex-1 min-h-0 flex">
            
            {/* Center column: Tabs/Filters + Cards */}
            <div className="flex-1 flex flex-col min-w-0 bg-muted/5">
              
              {/* Tabs and Filters */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0 gap-4 flex-wrap">
                <Tabs value={activeCategory} onValueChange={(v) => { setActiveCategory(v); setFactionFilter("all"); setMkFilter("all"); setTypeFilter("all"); setSortFilter(""); }}>
                  <TabsList className="w-full flex">
                    {CATEGORIES.map(cat => {
                      const catSlots = slots.filter(s => s.kind === cat.kind);
                      if (catSlots.length === 0) return null;
                      const Icon = cat.icon;
                      const status = getCategoryStatus(cat.kind, catSlots, cart);
                      const colorClass = 
                        status === "full" ? "text-emerald-500" :
                        status === "partial" ? "text-amber-500" :
                        status === "missing" ? "text-destructive" : "opacity-50";

                      return (
                        <TabsTrigger key={cat.id} value={cat.id} className="flex-1 flex gap-2 items-center text-xs">
                          <Icon className={cn("w-4 h-4", colorClass)} />
                          <span className="hidden xl:inline">{cat.label}</span>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
                
                <div className="flex items-center gap-3">
                  {(factionFilter !== "all" || mkFilter !== "all" || typeFilter !== "all" || sortFilter !== "" || obtainableOnly) && (
                    <button
                      onClick={() => { setFactionFilter("all"); setMkFilter("all"); setTypeFilter("all"); setSortFilter(""); setObtainableOnly(false); }}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-2 py-1.5 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> Clear filters
                    </button>
                  )}
                  
                  <button
                    onClick={() => setObtainableOnly(!obtainableOnly)}
                    className={cn(
                      "text-xs font-medium px-3 h-9 rounded transition-colors flex items-center shrink-0 border",
                      obtainableOnly ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-foreground border-input hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    Obtainable Only
                  </button>

                  <Select value={sortFilter || (["weapon", "turret"].includes(category.kind) ? "type_asc" : "price_asc")} onValueChange={setSortFilter}>
                    <SelectTrigger className="w-[180px] h-9 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                        <span>Order by:</span>
                        <span className="text-foreground font-medium truncate"><SelectValue /></span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_SORTS[category.kind]?.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                      {BASE_SORTS.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {["weapon", "turret"].includes(category.kind) && (
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-[140px] h-9 text-xs">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {availableTypes.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Select value={mkFilter} onValueChange={setMkFilter}>
                    <SelectTrigger className="w-[120px] h-9 text-xs">
                      <SelectValue placeholder="All Mks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Mks</SelectItem>
                      {availableMks.map(mk => (
                        <SelectItem key={mk} value={mk.toString()}>
                          <div className="flex items-center py-0.5"><EquipmentMkBadge mk={mk} className="px-1.5 py-0 rounded text-[10px]" /></div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <FactionCombobox
                    factions={factions.filter(f => availableFactions.includes(f.faction_id))}
                    value={factionFilter}
                    onChange={setFactionFilter}
                    className="w-[180px]"
                    disabled={availableFactions.length === 0}
                  />
                </div>
              </div>

              <div className="px-4 py-2 bg-muted/20 border-b border-border text-[11px] flex items-center gap-2 shrink-0">
                {activeCategory === "engine" && (
                  slots.some(s => s.kind === "engine" && cart[s.key] != null) 
                    ? <><Check className="w-3.5 h-3.5 text-emerald-500" /> <span className="text-muted-foreground">Engine requirements <span className="font-semibold text-emerald-500">met</span> for flight.</span></>
                    : <><Gauge className="w-3.5 h-3.5 text-amber-500" /> <span className="text-muted-foreground">At least one engine is <span className="font-semibold text-foreground">required</span> for flight.</span></>
                )}
                {activeCategory === "thruster" && (
                  slots.some(s => s.kind === "thruster" && cart[s.key] != null)
                    ? <><Check className="w-3.5 h-3.5 text-emerald-500" /> <span className="text-muted-foreground">Thruster requirements <span className="font-semibold text-emerald-500">met</span> for maneuverability.</span></>
                    : <><MoveVertical className="w-3.5 h-3.5 text-amber-500" /> <span className="text-muted-foreground">A thruster is <span className="font-semibold text-foreground">required</span> for maneuverability.</span></>
                )}
                {activeCategory === "software" && (
                  slots.filter(s => s.kind === "software").every(s => cart[s.key] != null)
                    ? <><Check className="w-3.5 h-3.5 text-emerald-500" /> <span className="text-muted-foreground">All required software systems are <span className="font-semibold text-emerald-500">installed</span>.</span></>
                    : <><Cpu className="w-3.5 h-3.5 text-amber-500" /> <span className="text-muted-foreground">A Docking Computer, Flight Assist, Long Range Scanner, and Object Scanner are <span className="font-semibold text-foreground">required</span>.</span></>
                )}
                {["shield", "weapon", "turret"].includes(activeCategory) && <><Shield className="w-3.5 h-3.5 text-muted-foreground" /> <span className="text-muted-foreground">Select components to equip.</span></>}
              </div>

              {/* Equipment cards */}
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                {compatibleEquipment.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">No compatible {category.label.toLowerCase()} for this ship with current filters.</p>
                ) : activeCategory === "software" ? (
                  <div className="space-y-8">
                    {Array.from(new Set(compatibleEquipment.map(e => e.size).filter(Boolean) as string[])).sort().map(subcat => {
                      const subcatItems = compatibleEquipment.filter(e => e.size === subcat);
                      const subcatNames: Record<string, string> = {
                        dock: "Docking Computer", economy: "Economy Analytics", flightassist: "Flight Assist",
                        scannerlongrange: "Long Range Scanner", scannermining: "Mining Scanner",
                        scannerobject: "Object Scanner", target: "Targeting Computer", trade: "Trading Computer"
                      };
                      return (
                        <div key={subcat} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold">{subcatNames[subcat] ?? subcat}</h3>
                            {(subcat === "dock" || subcat === "scannerlongrange" || subcat === "scannerobject" || subcat === "flightassist") && (
                              cart[`software-${subcat}-0`] ? (
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-medium border border-emerald-500/20">Equipped</span>
                              ) : (
                                <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium border border-destructive/20">Required</span>
                              )
                            )}
                          </div>
                          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                            {subcatItems.map(item => <EquipmentCard key={item.ware_id} item={item} slots={slots} cart={cart} onAdd={handleAdd} onRemove={handleRemove} factionMap={factionMap} shortToFullFaction={shortToFullFaction} playerLicenceSet={playerLicenceSet} />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                    {compatibleEquipment.map(item => (
                      <EquipmentCard key={item.ware_id} item={item} slots={slots} cart={cart} onAdd={handleAdd} onRemove={handleRemove} factionMap={factionMap} shortToFullFaction={shortToFullFaction} playerLicenceSet={playerLicenceSet} />
                    ))}
                  </div>
                )}
              </div>
              
              {/* Stats footer */}
              <StatsFooter ship={shipDetail} cart={cart} slots={slots} />
            </div>

            {/* Ship info + Cart (right) */}
            <div className="w-[280px] shrink-0 border-l border-border flex flex-col bg-card relative z-20 shadow-[-4px_0_15px_rgba(0,0,0,0.05)]">
              {/* Ship image — large */}
              <div className="p-3 border-b border-border bg-muted/5 shrink-0">
                <ShipImage
                  imageUrl={shipDetail.image_url}
                  iconUrl={shipDetail.icon_url}
                  name={shipDetail.name}
                  role={shipDetail.role}
                  classId={shipDetail.class_id}
                  className="aspect-[4/3] p-2"
                />
                <div className="mt-2 text-center">
                  <p className="text-sm font-bold leading-tight">{shipDetail.name}</p>
                  <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                    <ShipClassBadge class_id={shipDetail.class_id} className="text-[9px] px-1.5 py-0" />
                    <ShipTypeBadge role={shipDetail.role} subtype={shipDetail.ship_type} className="text-[9px] px-1.5 py-0" />
                  </div>
                  {shipFaction && (
                    <div className="mt-1 flex justify-center">
                      <FactionBadge name={shipFaction.name} color_hex={shipFaction.color_hex} faction_id={shipFaction.faction_id} />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Cart */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <CartPanel 
                  slots={slots} cart={cart} 
                  onRemove={handleRemove} onClear={handleClearAll} 
                  totalCost={totalCost} 
                  onSelectCategory={setActiveCategory}
                  shipDetail={shipDetail}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Wrench className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Select a ship to start building</p>
          </div>
        </div>
      )}
    </div>
  );
}
