// Floating, screen-space info card for a clicked station: identity, owner, function,
// build status, and current trade offers (live saves only).

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { apiGetOrNull } from "../../lib/api";
import type { FactionSummary, MapStation } from "../../lib/map/types";
import { stationCategoryLabel, stationDisplayName } from "../../lib/map/stations";
import { prettyId } from "../../lib/wareFormat";
import { formatCompactNumber } from "../../lib/formatters";

type Offer = { ware_id: string; side: string; price: number; quantity: number };

function compactCr(n: number): string {
  return formatCompactNumber(n);
}

function OfferList({ title, offers }: { title: string; offers: Offer[] }) {
  if (offers.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{title}</span>
      {offers.slice(0, 4).map((o) => (
        <div key={o.ware_id} className="flex justify-between gap-3 tabular-nums">
          <span className="text-foreground truncate">{prettyId(o.ware_id)}</span>
          <span className="text-amber-400">{compactCr(o.price)} cr</span>
        </div>
      ))}
    </div>
  );
}

export function StationPopover({
  station, x, y, faction, onClose,
}: {
  station: MapStation;
  x: number;
  y: number;
  faction: FactionSummary | null;
  onClose: () => void;
}) {
  const isLive = station.source === "live";
  const offersQuery = useQuery<Offer[] | null>({
    queryKey: ["station-offers", station.station_id],
    // Falls back to null (not []) on a non-ok response; `offers` below already coalesces to [].
    queryFn: () => apiGetOrNull<Offer[]>(`/api/v1/stations/${station.station_id}/offers`),
    enabled: isLive,
  });

  const offers = offersQuery.data ?? [];
  const sells = offers.filter((o) => o.side === "sell");
  const buys = offers.filter((o) => o.side === "buy");

  return (
    <div
      style={{ position: "absolute", left: x + 12, top: y + 12, zIndex: 25, maxWidth: 260 }}
      className="rounded-md border border-border bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur text-xs"
    >
      <button onClick={onClose}
        className="absolute top-1.5 right-1.5 flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-foreground">
        <X className="w-3 h-3" />
      </button>

      <p className="font-semibold pr-4 leading-tight">{stationDisplayName(station)}</p>
      <p className="text-muted-foreground mt-0.5">
        {faction?.name ?? station.owner_faction ?? "Unknown"} · {stationCategoryLabel(station.category)}
        {station.is_hq && <span className="text-amber-400"> · HQ</span>}
      </p>
      {station.is_under_construction && (
        <p className="text-sky-400 mt-0.5">Under construction</p>
      )}
      {station.code && <p className="text-muted-foreground/60 mt-0.5">{station.code}</p>}

      {isLive ? (
        offersQuery.isLoading ? (
          <p className="text-muted-foreground mt-2">Loading offers…</p>
        ) : offers.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
            <OfferList title="Sells" offers={sells} />
            <OfferList title="Buys" offers={buys} />
          </div>
        ) : (
          <p className="text-muted-foreground/60 mt-2 border-t border-border pt-2">No active trade offers</p>
        )
      ) : (
        <p className="text-muted-foreground/60 mt-2 border-t border-border pt-2">Gamestart placement (load a save for live trade)</p>
      )}
    </div>
  );
}
