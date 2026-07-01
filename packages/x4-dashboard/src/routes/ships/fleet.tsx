import { Rocket, Construction } from "lucide-react";
import { HUDCard } from "../../components/HUDCard";
import { PageSubtitle } from "../../components/ui/page-subtitle";

export default function FleetPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
          <Rocket className="h-6 w-6 text-primary" /> Fleets
        </h1>
        <PageSubtitle>Fleet and Squadron Management</PageSubtitle>
      </div>
      
      <div className="flex-1 p-6">
        <HUDCard className="h-full flex flex-col items-center justify-center text-center gap-4 border-dashed border-2 border-border/50 bg-card/30">
          <Construction className="h-12 w-12 text-primary opacity-80" />
          <div>
            <h2 className="text-xl font-bold text-foreground">Work in Progress</h2>
            <p className="text-sm text-muted-foreground max-w-md mt-2 mx-auto">
              This section will provide a detailed overview of your fleets, allowing you to monitor squadron composition, leadership, and operational stats. Check back in a future update!
            </p>
          </div>
        </HUDCard>
      </div>
    </div>
  );
}
