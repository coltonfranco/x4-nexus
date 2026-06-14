import { Eye, EyeOff, Settings as SettingsIcon } from "lucide-react";
import { useState } from "react";
import { useSettings } from "../lib/settingsStore";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const { settings, updateSettings } = useSettings();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Settings"
      >
        <SettingsIcon className="w-4 h-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-primary" />
              Settings
            </DialogTitle>
            <DialogDescription>Configure your dashboard experience.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-6 mb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium leading-none">
                  Fog of War
                </label>
                <p className="text-sm text-muted-foreground">
                  Hide sectors, stations, and factions that haven't been discovered by the player.
                </p>
              </div>
              <Switch
                checked={settings.fogOfWar}
                onCheckedChange={(v) => updateSettings({ fogOfWar: v })}
                iconOn={<EyeOff className="h-3 w-3 text-muted-foreground" />}
                iconOff={<Eye className="h-3 w-3 text-muted-foreground" />}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
