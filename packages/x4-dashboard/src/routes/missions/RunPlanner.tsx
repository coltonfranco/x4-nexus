import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type { Mission, MissionOffer } from "./types";
import { typeColor, typeLabel, fmtCredits } from "./helpers";
import { EmbeddedMap } from "./EmbeddedMap";

type RunStop = {
  id: string;
  title: string;
  typeLabel: string;
  typeColor: string;
  destName: string;
  legJumps: number | null;
  rewardText: string;
  rewardColor: string;
};

type Props = {
  missions: Mission[];
  offers: MissionOffer[];
  runIds: string[];
  onRemoveFromRun: (id: string) => void;
};

export function RunPlanner({
  missions,
  offers,
  runIds,
  onRemoveFromRun,
}: Props) {
  const [mapExpanded, setMapExpanded] = useState(false);
  // Build run stops from missions and offers
  const stops: RunStop[] = [];
  let totalCredits = 0;
  let totalJumps = 0;

  for (const id of runIds) {
    const m = missions.find((x) => x.mission_id === id);
    const o = offers.find((x) => x.offer_id === id);
    const item = m ?? o;
    if (!item) continue;

    const name = "name" in item && item.name ? item.name : "Unknown";
    const credits =
      "reward_credits" in item ? (item.reward_credits as number | null) : null;
    const reward =
      credits != null
        ? fmtCredits(credits)
        : "rewardtext" in item && item.rewardtext
          ? (item.rewardtext as string)
          : "—";

    const tColor =
      item.type && typeColor(item.type) ? typeColor(item.type) : "#8a95ab";
    const tLabel =
      item.type ? typeLabel(item.type) : "Mission";

    const destName =
      "station_name" in item && item.station_name
        ? (item.station_name as string)
        : "associated_entity_name" in item && item.associated_entity_name
          ? (item.associated_entity_name as string)
          : "—";

    const jumps =
      "distance" in item ? (item.distance as number | null) : null;

    stops.push({
      id,
      title: name,
      typeLabel: tLabel,
      typeColor: tColor,
      destName,
      legJumps: jumps,
      rewardText: reward,
      rewardColor: "var(--gold)",
    });

    if (credits) totalCredits += credits;
    if (jumps) totalJumps += jumps;
  }

  const hasStops = stops.length > 0;

  if (mapExpanded) {
    return (
      <EmbeddedMap
        targetSectorId={null}
        fullscreen
        onBack={() => setMapExpanded(false)}
      />
    );
  }

  return (
    <div className="p-6 max-w-[840px] animate-in fade-in slide-in-from-right-2 duration-150">
      {/* Header */}
      <div
        className="text-[10px] tracking-[2px] font-mono uppercase mb-2"
        style={{ color: "#7fb9d6" }}
      >
        NEXUS EXCLUSIVE
      </div>
      <h2 className="text-[26px] font-semibold leading-tight">Run Planner</h2>
      <p
        className="text-[12.5px] mt-2.5 leading-relaxed max-w-[600px]"
        style={{ color: "#8a95ab" }}
      >
        The game only tracks one active mission at a time. Stack compatible
        missions into a single run and Nexus orders the stops into the shortest
        flight path — clear several objectives without flying back and forth.
      </p>

      {/* Empty state */}
      {!hasStops && (
        <div className="mt-6 p-12 rounded-2xl border border-dashed border-border/40 flex flex-col items-center text-center">
          <div className="text-3xl opacity-40 mb-3.5">⛓</div>
          <div className="text-[15px] text-foreground/70">
            No missions in this run yet
          </div>
          <div
            className="text-[12.5px] max-w-[360px] leading-relaxed mt-1.5"
            style={{ color: "#5a6680" }}
          >
            Hit the <span style={{ color: "#7fb9d6" }}>＋</span> on any mission
            in the list to add it here. Nexus will plot the optimal multi-stop
            route.
          </div>
        </div>
      )}

      {/* Stats */}
      {hasStops && (
        <>
          <div className="flex gap-3.5 mt-5">
            <div
              className="flex-1 p-3.5 rounded-xl border"
              style={{
                background: "rgba(240,217,138,0.06)",
                borderColor: "rgba(240,217,138,0.18)",
              }}
            >
              <div
                className="text-[9.5px] tracking-[1.5px] font-mono uppercase"
                style={{ color: "#a9966a" }}
              >
                TOTAL REWARD
              </div>
              <div
                className="font-mono text-xl font-semibold mt-1.5"
                style={{ color: "#f0d98a" }}
              >
                {fmtCredits(totalCredits)}
              </div>
            </div>
            <div
              className="flex-1 p-3.5 rounded-xl border"
              style={{
                background: "rgba(92,200,236,0.06)",
                borderColor: "rgba(92,200,236,0.18)",
              }}
            >
              <div
                className="text-[9.5px] tracking-[1.5px] font-mono uppercase"
                style={{ color: "#6f93a6" }}
              >
                TOTAL JUMPS
              </div>
              <div
                className="font-mono text-xl font-semibold mt-1.5"
                style={{ color: "#5cc8ec" }}
              >
                {totalJumps}
              </div>
            </div>
            <div
              className="flex-1 p-3.5 rounded-xl border"
              style={{
                background: "rgba(255,255,255,0.02)",
                borderColor: "rgba(255,255,255,0.07)",
              }}
            >
              <div
                className="text-[9.5px] tracking-[1.5px] font-mono uppercase"
                style={{ color: "#7a8499" }}
              >
                STOPS
              </div>
              <div
                className="font-mono text-xl font-semibold mt-1.5 text-foreground"
              >
                {stops.length}
              </div>
            </div>
          </div>

          {/* Route */}
          <div className="flex items-center gap-2.5 mt-6 mb-3">
            <span
              className="text-[11px] tracking-[1.5px] font-mono uppercase"
              style={{ color: "#7a8499" }}
            >
              ▸ OPTIMIZED ROUTE
            </span>
            <div className="flex-1 h-px bg-border/40" />
            <button
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border transition-colors hover:brightness-125 opacity-50 cursor-not-allowed"
              style={{
                color: "#7ec9a0",
                borderColor: "rgba(52,211,153,0.25)",
                background: "rgba(52,211,153,0.07)",
              }}
              title="Re-optimize (coming soon)"
            >
              <RefreshCw className="w-3 h-3" />
              Re-optimize
            </button>
            <button
              onClick={() => setMapExpanded(true)}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border transition-colors hover:brightness-125"
              style={{
                color: "#7fb9d6",
                borderColor: "rgba(92,200,236,0.22)",
                background: "rgba(92,200,236,0.06)",
              }}
            >
              ⤢ Expand
            </button>
          </div>

          <EmbeddedMap
            targetSectorId={null}
            onExpand={() => setMapExpanded(true)}
            height={250}
          />

          {/* Flight order */}
          <div className="flex items-center gap-2.5 mt-6 mb-3">
            <span
              className="text-[11px] tracking-[1.5px] font-mono uppercase"
              style={{ color: "#7a8499" }}
            >
              ▸ FLIGHT ORDER
            </span>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          <div className="flex flex-col">
            {/* Player start */}
            <div className="flex items-center gap-3 py-2 px-1">
              <div
                className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs shrink-0"
                style={{
                  border: "2px solid #5cc8ec",
                  background: "#0c1322",
                  color: "#5cc8ec",
                }}
              >
                ◉
              </div>
              <div className="text-[12.5px] text-foreground/70">
                You are here —{" "}
                <span className="text-foreground font-medium">
                  Current Location
                </span>
              </div>
            </div>

            {/* Stops */}
            {stops.map((stop, i) => (
              <div key={stop.id}>
                <div
                  className="ml-[12px] h-4 border-l-2 border-dashed"
                  style={{ borderColor: "rgba(52,211,153,0.4)" }}
                />
                <div
                  className="flex items-center gap-3 p-3 rounded-xl border"
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    borderColor: "rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    className="w-[26px] h-[26px] rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0"
                    style={{
                      border: "2px solid #34d399",
                      background: "#0c1322",
                      color: "#34d399",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-foreground truncate">
                      {stop.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[9px] font-semibold uppercase tracking-[0.3px] px-2 py-0.5 rounded-md"
                        style={{
                          background: `${stop.typeColor}18`,
                          color: stop.typeColor,
                        }}
                      >
                        {stop.typeLabel}
                      </span>
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: "#7fb9d6" }}
                      >
                        ⌖ {stop.destName}
                      </span>
                      {stop.legJumps != null && (
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                          +{stop.legJumps} jump
                          {stop.legJumps !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div
                      className="font-mono text-[13px] font-semibold tabular-nums"
                      style={{ color: stop.rewardColor }}
                    >
                      {stop.rewardText}
                    </div>
                    <button
                      onClick={() => onRemoveFromRun(stop.id)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-xs transition-colors hover:brightness-125"
                      style={{
                        background: "rgba(248,113,113,0.1)",
                        border: "1px solid rgba(248,113,113,0.25)",
                        color: "#f0928f",
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            className="text-[11px] mt-3.5 leading-relaxed"
            style={{ color: "#5a6680" }}
          >
            ⓘ Jump estimates assume highway / accelerated travel between
            adjacent sectors. Re-optimize reorders stops by nearest-next from
            your position.
          </div>
        </>
      )}
    </div>
  );
}
