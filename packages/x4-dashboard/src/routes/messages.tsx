import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, MailOpen, Star, ArrowLeft, Clock, User, MapPin } from "lucide-react";
import { PageLoaderPreset } from "../components/PageLoader";
import { cn } from "../lib/utils";

type PlayerMessage = {
  id: number;
  time: number;
  title: string;
  text: string | null;
  source: string | null;
  highpriority: number | null;
  interact: string | null;
  component: string | null;
  component_name: string | null;
  component_kind: string | null;
  read: number | null;
  extra_json: string | null;
};

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, "0")}m`;
  if (mins > 0) return `${mins}m`;
  return `${Math.floor(seconds)}s`;
}

function formatBody(text: string | null): string {
  if (!text) return "";
  // X4 encodes formatting: [\033]#RRGGBB#text[\033]X for colors, [\012] for newlines.
  // Strip color markup, convert newline codes.
  return text
    .replace(/\[\\?\d+\]#[A-Fa-f0-9]{6,8}#/g, "")
    .replace(/\[\\?\d+\]X?/g, (m) => {
      if (m.includes("033")) return "";
      return "\n";
    })
    .replace(/#[A-Fa-f0-9]{6,8}#/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function MessagesPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: messages = [], isLoading } = useQuery<PlayerMessage[]>({
    queryKey: ["player-messages"],
    queryFn: () => fetch("/api/v1/player/messages").then((r) => r.json()),
  });

  if (isLoading) return <PageLoaderPreset preset="default" />;

  const selected = messages.find((m) => m.id === selectedId) ?? null;

  const unreadCount = messages.filter((m) => !m.read).length;

  // Mobile: show list OR detail. Desktop: two-pane.
  const showDetail = selectedId !== null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-2 shrink-0 flex items-center gap-3">
        {showDetail && (
          <button
            onClick={() => setSelectedId(null)}
            className="lg:hidden p-1 rounded hover:bg-muted/50 transition-colors -ml-1"
            title="Back to inbox"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <Mail className="h-6 w-6 text-primary" /> Inbox
          </h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
            {unreadCount > 0 && (
              <span className="ml-2 text-primary">{unreadCount} unread</span>
            )}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden px-6 pb-6 pt-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Mail className="h-10 w-10 opacity-30" />
            <p className="text-sm">No messages. Activate a save to load your inbox.</p>
          </div>
        ) : (
          <div className="flex h-full gap-0 rounded-lg border border-border overflow-hidden bg-card/60">
            {/* Message list (left pane) — fixed width */}
            <div
              className={cn(
                "flex flex-col overflow-auto border-r border-border",
                showDetail ? "hidden lg:flex lg:w-80 xl:w-96" : "lg:w-80 xl:w-96"
              )}
            >
              {messages.map((msg) => {
                const isSelected = msg.id === selectedId;
                const isUnread = !msg.read;
                return (
                  <button
                    key={msg.id}
                    onClick={() => setSelectedId(msg.id)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-border/40 last:border-b-0",
                      isSelected
                        ? "bg-primary/10 border-l-[3px] border-l-primary pl-[13px]"
                        : "border-l-[3px] border-l-transparent pl-[13px] hover:bg-muted/30",
                      isUnread && "bg-muted/20"
                    )}
                  >
                    {/* Priority + read indicator */}
                    <div className="shrink-0 mt-0.5">
                      {msg.highpriority ? (
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      ) : isUnread ? (
                        <Mail className="h-4 w-4 text-primary" />
                      ) : (
                        <MailOpen className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm font-semibold truncate",
                            isUnread && "text-foreground"
                          )}
                        >
                          {msg.source ?? "Unknown"}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {formatTime(msg.time)}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "text-xs mt-0.5 truncate",
                          isUnread ? "text-foreground/80 font-medium" : "text-muted-foreground"
                        )}
                      >
                        {msg.title}
                      </p>
                      {msg.text && (
                        <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5 leading-relaxed">
                          {formatBody(msg.text).replace(/\n/g, " ").substring(0, 80)}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail pane (right) */}
            <div
              className={cn(
                "flex flex-col overflow-auto",
                showDetail ? "flex-1" : "hidden lg:flex lg:flex-1 lg:items-center lg:justify-center"
              )}
            >
              {!selected ? (
                <div className="flex flex-col items-center gap-3 text-muted-foreground p-8">
                  <Mail className="h-12 w-12 opacity-20" />
                  <p className="text-sm">Select a message to read</p>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {/* Message header */}
                  <div className="px-6 py-4 border-b border-border shrink-0">
                    <h2 className="text-lg font-bold leading-tight">{selected.title}</h2>
                    <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        <span className="font-medium text-foreground/80">{selected.source ?? "Unknown"}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(selected.time)}
                      </span>
                      {selected.highpriority ? (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Star className="h-3.5 w-3.5 fill-amber-400" /> Priority
                        </span>
                      ) : null}
                    </div>
                    {selected.component && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {selected.component_name ? (
                          <span className="font-medium text-foreground/80">{selected.component_name}</span>
                        ) : (
                          <code className="text-[11px] bg-muted/30 px-1.5 py-0.5 rounded">{selected.component}</code>
                        )}
                        {selected.component_kind && (
                          <span className="text-muted-foreground/60 capitalize">({selected.component_kind})</span>
                        )}
                        {selected.interact && (
                          <span className="text-primary/70 capitalize ml-1">· {selected.interact}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Message body */}
                  <div className="flex-1 overflow-auto px-6 py-5">
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85 max-w-2xl">
                      {formatBody(selected.text)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
