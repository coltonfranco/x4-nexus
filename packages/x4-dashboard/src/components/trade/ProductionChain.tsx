import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { fmtSeconds, prettyId } from "../../lib/wareFormat";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

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
};

function ProductionInputLine({ input, depth }: { input: ProductionInput; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail } = useQuery<WareDetail>({
    queryKey: ["wares", input.ware_id],
    queryFn: () => fetch(`/api/v1/wares/${input.ware_id}`).then((r) => r.json()),
    enabled: expanded,
  });
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-2 py-1">
        {depth < 3 ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
            style={{ width: 16, height: 16 }}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3 opacity-50" />}
          </button>
        ) : (
          <span style={{ width: 16 }} />
        )}
        <span className="font-mono text-xs text-primary">{input.amount}×</span>
        <span className="text-sm">{prettyId(input.ware_id)}</span>
      </div>
      {expanded &&
        detail?.production?.slice(0, 1).map((method) => (
          <div key={method.method} className="ml-4">
            {method.inputs.map((inp) => (
              <ProductionInputLine key={inp.ware_id} input={inp} depth={depth + 1} />
            ))}
          </div>
        ))}
    </div>
  );
}

/** Production-method explorer for a ware: cycle time, output, workforce, and a
 *  recursively expandable input tree. Shared by the trade and inventory pages. */
export function ProductionChain({ wareId }: { wareId: string }) {
  const { data, isLoading } = useQuery<WareDetail>({
    queryKey: ["wares", wareId],
    queryFn: () => fetch(`/api/v1/wares/${wareId}`).then((r) => r.json()),
  });

  if (isLoading) return <p className="py-2 text-xs text-muted-foreground">Loading…</p>;
  if (!data || data.production.length === 0) {
    return <p className="py-2 text-xs italic text-muted-foreground">No production method — raw resource</p>;
  }

  const methods = data.production;
  const content = (method: ProductionMethod) => (
    <div className="space-y-2">
      {(data.restriction_licence || data.illegal_factions?.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {data.restriction_licence && (
            <Badge variant="outline" className="text-xs">
              Requires: {data.restriction_licence}
            </Badge>
          )}
          {data.illegal_factions?.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              Contraband in {data.illegal_factions.length} faction
              {data.illegal_factions.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      )}
      <div className="space-y-2 rounded-md bg-muted/40 p-3">
        <div className="flex gap-6 text-xs text-muted-foreground">
          {method.time_sec != null && (
            <span>
              <span className="font-medium text-foreground">{fmtSeconds(method.time_sec)}</span> / cycle
            </span>
          )}
          {method.amount != null && (
            <span>
              Output: <span className="font-medium text-foreground">{method.amount}</span>
            </span>
          )}
          {method.workforce != null && method.workforce > 0 && (
            <span>
              Workforce: <span className="font-medium text-foreground">{method.workforce}</span>
            </span>
          )}
        </div>
        {method.inputs.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Inputs</p>
            {method.inputs.map((inp) => (
              <ProductionInputLine key={inp.ware_id} input={inp} depth={0} />
            ))}
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground">No inputs</p>
        )}
      </div>
    </div>
  );

  if (methods.length === 1) return content(methods[0]);
  return (
    <Tabs defaultValue={methods[0].method}>
      <TabsList className="mb-2 h-7">
        {methods.map((m) => (
          <TabsTrigger key={m.method} value={m.method} className="h-6 px-2 text-xs">
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
