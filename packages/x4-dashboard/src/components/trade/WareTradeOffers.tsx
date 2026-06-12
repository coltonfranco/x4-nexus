import { useQuery } from "@tanstack/react-query";
import { Currency } from "../Currency";

type WareOfferRow = {
  station_id: string;
  station_name: string | null;
  sector_id: string | null;
  side: string;
  price: number;
  quantity: number;
};

export function WareTradeOffers({ wareId }: { wareId: string }) {
  const { data: offers = [], isLoading } = useQuery<WareOfferRow[]>({
    queryKey: ["economy", "wares", wareId, "stations"],
    queryFn: () => fetch(`/api/v1/economy/wares/${wareId}/stations`).then((r) => r.json()),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading trade offers…</p>;
  if (!offers || offers.length === 0) return <p className="text-xs text-muted-foreground py-2 italic">No live trade offers found.</p>;

  // Split into buy and sell offers
  const buyOffers = offers.filter(o => o.side === "buy").sort((a, b) => b.price - a.price);
  const sellOffers = offers.filter(o => o.side === "sell").sort((a, b) => a.price - b.price);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top Buyers (Demanding)</h3>
        {buyOffers.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No buyers found.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left font-medium py-2 pl-3 text-xs text-muted-foreground">Station</th>
                  <th className="text-right font-medium py-2 text-xs text-muted-foreground">Price</th>
                  <th className="text-right font-medium py-2 pr-3 text-xs text-muted-foreground">Qty</th>
                </tr>
              </thead>
              <tbody>
                {buyOffers.slice(0, 50).map((o, i) => (
                  <tr key={`${o.station_id}-buy-${i}`} className="border-t border-border/50 hover:bg-muted/10">
                    <td className="py-2 pl-3 truncate max-w-[120px]" title={o.station_name || "Unknown Station"}>{o.station_name || "Unknown Station"}</td>
                    <td className="py-2 text-right"><Currency value={o.price} /></td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">{o.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top Sellers (Supplying)</h3>
        {sellOffers.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No sellers found.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left font-medium py-2 pl-3 text-xs text-muted-foreground">Station</th>
                  <th className="text-right font-medium py-2 text-xs text-muted-foreground">Price</th>
                  <th className="text-right font-medium py-2 pr-3 text-xs text-muted-foreground">Qty</th>
                </tr>
              </thead>
              <tbody>
                {sellOffers.slice(0, 50).map((o, i) => (
                  <tr key={`${o.station_id}-sell-${i}`} className="border-t border-border/50 hover:bg-muted/10">
                    <td className="py-2 pl-3 truncate max-w-[120px]" title={o.station_name || "Unknown Station"}>{o.station_name || "Unknown Station"}</td>
                    <td className="py-2 text-right"><Currency value={o.price} /></td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">{o.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
