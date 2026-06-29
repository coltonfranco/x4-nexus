import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type SetupStatus, getSetupStatus } from "../../lib/setup";
import { SetupWizard } from "./SetupWizard";

/**
 * Blocks the main app until the static database is built.
 *
 * The app requires a populated static.db; save data builds on top of it. On a fresh
 * install neither the game folders nor the DB exist, so this gate polls /setup/status
 * and shows the wizard until `needs_setup` clears. It polls fast while a build is
 * running so the app appears the moment the DB is ready — no manual reload.
 */
export function SetupGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useQuery<SetupStatus>({
    queryKey: ["setup-status"],
    queryFn: getSetupStatus,
    refetchInterval: (q) => (q.state.data?.init.running ? 1000 : 5000),
  });

  // While the very first status request is in flight, show a neutral splash rather than
  // flashing the wizard (which would briefly appear even for already-configured users).
  if (isLoading || (isError && !data)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data && data.needs_setup) return <SetupWizard status={data} />;
  return <>{children}</>;
}
