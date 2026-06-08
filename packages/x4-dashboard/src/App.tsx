import { useQuery } from "@tanstack/react-query";

type Health = {
  ok: boolean;
  api_version: string;
  save_age_sec: number | null;
  game_version: string | null;
};

export default function App() {
  const { data, isLoading, error } = useQuery<Health>({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await fetch("/api/v1/health");
      if (!r.ok) throw new Error(`Health check failed: ${r.status}`);
      return r.json();
    },
  });

  if (isLoading) return <div>Loading…</div>;
  if (error) return <div>API unreachable: {(error as Error).message}</div>;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>X4 Companion</h1>
      <p>API v{data?.api_version}</p>
      <p>
        Save age:{" "}
        {data?.save_age_sec == null
          ? "no save parsed yet"
          : `${Math.floor(data.save_age_sec)}s`}
      </p>
      <p>Game version: {data?.game_version ?? "unknown"}</p>
      <p style={{ marginTop: 24, color: "#888" }}>
        Routes / Stations / Chains views land in M4. See <code>AGENTS.md</code>.
      </p>
    </main>
  );
}
