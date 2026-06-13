import { Eye, EyeOff, Settings as SettingsIcon, X } from "lucide-react";
import { useState } from "react";
import { useSettings } from "../lib/settingsStore";
import { cn } from "../lib/utils";

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const { settings, updateSettings } = useSettings();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Settings"
      >
        <SettingsIcon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-8 h-8 rounded-md text-primary bg-primary/10 transition-colors"
        title="Settings"
      >
        <SettingsIcon className="w-4 h-4" />
      </button>

      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
        onClick={() => setOpen(false)}
      >
        {/* Modal */}
        <div 
          className="bg-card border border-border shadow-lg rounded-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-primary" />
              Settings
            </h2>
            <button 
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-6">
            {/* Fog of War Toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium leading-none">
                  Fog of War
                </label>
                <p className="text-sm text-muted-foreground">
                  Hide sectors, stations, and factions that haven't been discovered by the player.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.fogOfWar}
                onClick={() => updateSettings({ fogOfWar: !settings.fogOfWar })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  settings.fogOfWar ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none flex h-5 w-5 items-center justify-center rounded-full bg-background shadow-lg ring-0 transition-transform",
                    settings.fogOfWar ? "translate-x-5" : "translate-x-0"
                  )}
                >
                  {settings.fogOfWar ? (
                    <EyeOff className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <Eye className="h-3 w-3 text-muted-foreground" />
                  )}
                </span>
              </button>
            </div>
            
            {/* Add more settings here in the future */}
          </div>
          
          <div className="px-5 py-4 border-t border-border bg-muted/30 flex justify-end">
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium rounded-md transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
