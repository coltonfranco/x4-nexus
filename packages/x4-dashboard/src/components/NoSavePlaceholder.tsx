import { Save } from "lucide-react";

/**
 * Consistent empty-state shown when a page/section requires a save but none is loaded.
 */
export function NoSavePlaceholder({
  title = "No save loaded",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#6b7890]">
      <Save className="w-10 h-10 opacity-30" strokeWidth={1.5} />
      <p className="text-sm font-medium">{title}</p>
      {children ?? (
        <p className="text-xs max-w-[280px] text-center leading-relaxed">
          Ingest a save file to see live game data — faction relations,
          trade routes, conflict zones, and your empire stats.
        </p>
      )}
    </div>
  );
}
