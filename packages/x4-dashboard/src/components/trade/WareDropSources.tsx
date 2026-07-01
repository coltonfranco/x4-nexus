import { useQuery } from "@tanstack/react-query";
import { prettyId } from "../../lib/wareFormat";
import { StatBar } from "../StatBar";
import { Badge } from "../ui/badge";
import { apiGet } from "../../lib/api";

type DropSource = {
  list_id: string;
  category: string | null;
  spawn_chance: number | null;
  item_chance: number | null;
  min_amount: number;
  max_amount: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  ship: "Ship wreck",
  lockbox: "Lockbox",
  asteroid: "Asteroid",
  crystal: "Crystal",
  story: "Mission",
  masstraffic: "Traffic",
  other: "Other",
};

/** Where a ware can drop from (wrecks, lockboxes, asteroids…). Shared by the
 *  inventory and trade detail panels. */
export function WareDropSources({ wareId }: { wareId: string }) {
  const { data = [], isLoading } = useQuery<DropSource[]>({
    queryKey: ["drops", "wares", wareId],
    queryFn: () => apiGet<DropSource[]>(`/api/v1/drops/wares/${wareId}`),
  });

  if (isLoading) return <p className="py-2 text-xs text-muted-foreground">Loading…</p>;
  if (data.length === 0)
    return <p className="py-2 text-xs italic text-muted-foreground">Not obtainable via drops.</p>;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="pb-2 font-medium">Source</th>
          <th className="pb-2 font-medium">Type</th>
          <th className="pb-2 font-medium">Basket fires</th>
          <th className="pb-2 font-medium">Item chance</th>
          <th className="pb-2 font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {data.map((src, i) => (
          <tr key={i} className="border-t border-border/50">
            <td className="py-1 pr-4 font-mono">{prettyId(src.list_id)}</td>
            <td className="py-1 pr-4">
              <Badge variant="muted" className="text-xs">
                {CATEGORY_LABELS[src.category ?? ""] ?? src.category}
              </Badge>
            </td>
            <td className="py-1 pr-4">
              <div className="flex items-center gap-2">
                <StatBar value={src.spawn_chance ?? 100} max={100} width={48} />
                <span className="tabular-nums text-muted-foreground">
                  {src.spawn_chance != null ? `${src.spawn_chance}%` : "always"}
                </span>
              </div>
            </td>
            <td className="py-1 pr-4">
              {src.item_chance != null ? (
                <div className="flex items-center gap-2">
                  <StatBar value={src.item_chance} max={100} width={48} />
                  <span className="tabular-nums text-muted-foreground">{src.item_chance}%</span>
                </div>
              ) : (
                <span className="text-muted-foreground">guaranteed</span>
              )}
            </td>
            <td className="py-1 tabular-nums text-muted-foreground">
              {src.min_amount === src.max_amount ? src.min_amount : `${src.min_amount}–${src.max_amount}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
