import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ProductionChain } from "./ProductionChain";
import { WareDropSources } from "./WareDropSources";

/** Expander body for a ware row. Shows only the panels that have content:
 *  Production when the ware is producible, Drop Sources when it can drop. With a
 *  single available panel the tab strip is omitted entirely. Render this only when
 *  `hasProduction || hasDrops` — the row should not expand otherwise. */
export function WareDetailTabs({
  wareId,
  hasProduction,
  hasDrops,
  prefer = "production",
}: {
  wareId: string;
  hasProduction: boolean;
  hasDrops: boolean;
  prefer?: "production" | "drops";
}) {
  if (hasProduction && !hasDrops) return <ProductionChain wareId={wareId} />;
  if (hasDrops && !hasProduction) return <WareDropSources wareId={wareId} />;
  if (!hasProduction && !hasDrops) return null;

  return (
    <Tabs defaultValue={prefer}>
      <TabsList className="mb-3 h-7">
        {prefer === "drops" ? (
          <>
            <TabsTrigger value="drops" className="h-6 px-3 text-xs">
              Drop Sources
            </TabsTrigger>
            <TabsTrigger value="production" className="h-6 px-3 text-xs">
              Production
            </TabsTrigger>
          </>
        ) : (
          <>
            <TabsTrigger value="production" className="h-6 px-3 text-xs">
              Production
            </TabsTrigger>
            <TabsTrigger value="drops" className="h-6 px-3 text-xs">
              Drop Sources
            </TabsTrigger>
          </>
        )}
      </TabsList>
      <TabsContent value="production">
        <ProductionChain wareId={wareId} />
      </TabsContent>
      <TabsContent value="drops">
        <WareDropSources wareId={wareId} />
      </TabsContent>
    </Tabs>
  );
}
