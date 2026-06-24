import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { fmtSeconds, prettyId } from "../../lib/wareFormat";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { EntityIcon } from "../EntityIcon";

type ProductionInput = { ware_id: string; amount: number };

type ProductionMethod = {
  method: string;
  time_sec: number | null;
  amount: number | null;
  workforce: number | null;
  inputs: ProductionInput[];
};

type WareDetail = {
  owners: string[];
  illegal_factions: string[];
  restriction_licence: string | null;
  production: ProductionMethod[];
  icon_url: string | null;
};

function ProductionInputLine({ input, depth, parentTimeSec }: { input: ProductionInput; depth: number; parentTimeSec: number | null }) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail, isLoading } = useQuery<WareDetail>({
    queryKey: ["wares", input.ware_id],
    queryFn: () => fetch(`/api/v1/wares/${input.ware_id}`).then((r) => r.json()),
  });

  const hasInputs = detail?.production?.some((m) => m.inputs.length > 0) ?? false;

  return (
    <div className="mt-2 first:mt-0">
      <div className="flex items-center justify-between gap-3 group">
        <div className="flex items-start gap-2">
          {depth < 3 && (isLoading || hasInputs) ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              disabled={isLoading}
              className="mt-0.5 flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground shrink-0"
              style={{ width: 16, height: 16 }}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3 opacity-50" />}
            </button>
          ) : (
            <span style={{ width: 16 }} className="shrink-0" />
          )}
          {detail?.icon_url ? (
            <EntityIcon src={detail.icon_url} alt={input.ware_id} size={20} className="shrink-0 opacity-80 mt-0.5" />
          ) : (
            <div className="w-5 h-5 shrink-0" />
          )}
          <div>
            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{prettyId(input.ware_id)}</div>
            <div className="text-xs text-muted-foreground">{input.amount.toLocaleString()} × per cycle</div>
          </div>
        </div>
        {parentTimeSec != null && (
          <div className="text-right shrink-0">
            <div className="text-sm font-mono font-semibold text-foreground">
              {Math.round((input.amount / parentTimeSec) * 3600).toLocaleString()} / hr
            </div>
          </div>
        )}
      </div>
      {expanded && hasInputs &&
        detail?.production?.slice(0, 1).map((method) => (
          <div key={method.method} className="ml-3 mt-2 border-l border-border/50 pl-3">
            {method.inputs.map((inp) => (
              <ProductionInputLine key={inp.ware_id} input={inp} depth={depth + 1} parentTimeSec={method.time_sec} />
            ))}
          </div>
        ))}
    </div>
  );
}

/** Production-method explorer for a ware: cycle time, output, workforce, and a
 *  recursively expandable input tree. Shared by the trade and inventory pages. */
export function ProductionChain({ wareId, filterMethod }: { wareId: string; filterMethod?: string }) {
  const { data, isLoading } = useQuery<WareDetail>({
    queryKey: ["wares", wareId],
    queryFn: () => fetch(`/api/v1/wares/${wareId}`).then((r) => r.json()),
  });

  if (isLoading) return <p className="py-2 text-xs text-muted-foreground">Loading…</p>;
  if (!data || data.production.length === 0) {
    return <p className="py-2 text-xs italic text-muted-foreground">No production method — raw resource</p>;
  }

  let methods = data.production;
  if (filterMethod) {
    const matched = methods.filter((m) => m.method === filterMethod);
    if (matched.length > 0) methods = matched;
  }

  const content = (method: ProductionMethod) => (
    <div className="space-y-4 pt-2">
      <div className="flex flex-col lg:flex-row items-stretch gap-4">
        {/* Inputs */}
        <div className="flex-1 rounded-lg border border-border/50 bg-muted/5 p-4 overflow-hidden">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Inputs</p>
          {method.inputs.length > 0 ? (
            <div className="space-y-1">
              {method.inputs.map((inp) => (
                <ProductionInputLine key={inp.ware_id} input={inp} depth={0} parentTimeSec={method.time_sec} />
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">No inputs — raw resource</p>
          )}
        </div>

        {/* Arrow */}
        <div className="flex lg:flex-col items-center justify-center py-2 lg:py-0">
          <span className="text-2xl lg:text-3xl text-muted-foreground/30 select-none">→</span>
        </div>

        {/* Output */}
        <div className="flex-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-3">Output</p>
          <div className="flex justify-between items-start gap-3">
            <div>
              <div className="flex items-center gap-2">
                {data.icon_url && <EntityIcon src={data.icon_url} alt={wareId} size={24} className="shrink-0" />}
                <div className="text-sm font-semibold">{prettyId(wareId)}</div>
              </div>
              {method.time_sec != null && method.amount != null ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {method.amount.toLocaleString()} × per cycle <span className="opacity-60">({fmtSeconds(method.time_sec)})</span>
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">
                  {method.amount != null ? `${method.amount.toLocaleString()} × per cycle` : "Unknown amount"} 
                  {method.time_sec != null ? ` (${fmtSeconds(method.time_sec)})` : ""}
                </div>
              )}
            </div>
            {method.time_sec != null && method.amount != null && (
              <div className="text-right shrink-0">
                <div className="text-sm font-mono font-semibold">
                  {Math.round((method.amount / method.time_sec) * 3600).toLocaleString()} / hr
                </div>
              </div>
            )}
          </div>
          {method.workforce != null && method.workforce > 0 && (
            <div className="mt-3 pt-3 border-t border-emerald-500/20 text-xs text-muted-foreground">
              Optimal Workforce: <span className="font-medium text-foreground">{method.workforce.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (methods.length === 1) return content(methods[0]);
  return (
    <Tabs defaultValue={methods[0].method}>
      <TabsList className="mb-2 h-7">
        {methods.map((m) => (
          <TabsTrigger key={m.method} value={m.method} className="h-6 px-3 text-xs">
            {m.method}
          </TabsTrigger>
        ))}
      </TabsList>
      {methods.map((m) => (
        <TabsContent key={m.method} value={m.method}>
          {content(m)}
        </TabsContent>
      ))}
    </Tabs>
  );
}

