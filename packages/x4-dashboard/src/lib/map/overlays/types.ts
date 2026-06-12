// The sector-fill overlay tab. Faction is the default (plain ownership colors). Resources
// tints by dominant/selected resource. Trade shows routes until a ware is picked, then the
// ware's supply/demand. Navigation (path) is always live on top — see useAnalysisOverlay.

export type FillMode = "faction" | "relations" | "resources" | "trade";

export type EconomyWare = {
  ware_id: string;
  ware_name: string | null;
};

export type WareOffer = {
  station_id: string;
  station_name: string | null;
  sector_id: string | null;
  side: string; // "buy" | "sell"
  price: number;
  quantity: number;
};

export type TradeRoute = {
  ware_id: string;
  ware_name: string | null;
  buy_sector: string | null;
  sell_sector: string | null;
  buy_price: number | null;
  sell_price: number | null;
  profit_per_trip: number;
  est_profit_per_hour: number;
  hops: number | null;
};

export type PlayerRelation = {
  faction_id: string;
  faction_name: string | null;
  color_hex: string | null;
  relation: number;
  initial_relation: number | null;
};
