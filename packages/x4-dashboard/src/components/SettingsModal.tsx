import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, EyeOff, Loader2, RotateCcw, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettings } from "../lib/settingsStore";
import { FolderField } from "./setup/FolderField";
import {
  type PathValidation,
  type SetupStatus,
  getSetupStatus,
  resetGameData,
  saveConfig,
} from "../lib/setup";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

/** Shows the running app version from the API health endpoint. */
function AppVersion() {
  const { data } = useQuery<{ api_version: string }>({
    queryKey: ["health-version"],
    queryFn: () => fetch("/api/v1/health").then((r) => r.json()),
    staleTime: Infinity,
  });
  return (
    <p className="text-xs text-muted-foreground/40 text-center pt-4">
      X4 Nexus v{data?.api_version ?? "..."}
    </p>
  );
}

type RefreshConfig = {
  background_refresh: boolean;
  interval_enabled: boolean;
  interval_sec: number;
  min_interval_sec: number;
};

/** Server-side live-sync controls. The API watches the save folder and re-ingests on write;
 *  this only governs the periodic *backstop* poll, which the user may want to slow down or
 *  turn off because even its cheap freshness check can briefly collide with X4 saving. */
function LiveSyncSection() {
  const qc = useQueryClient();
  const { data } = useQuery<RefreshConfig>({
    queryKey: ["refresh-config"],
    queryFn: () => fetch("/api/v1/refresh-config").then((r) => r.json()),
  });

  const update = useMutation({
    mutationFn: async (body: Partial<Pick<RefreshConfig, "interval_enabled" | "interval_sec">>) => {
      const r = await fetch("/api/v1/refresh-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`refresh-config ${r.status}`);
      return r.json() as Promise<RefreshConfig>;
    },
    onSuccess: (cfg) => qc.setQueryData(["refresh-config"], cfg),
  });

  // Local mirror of the interval field so typing doesn't fire a request per keystroke.
  const [intervalText, setIntervalText] = useState("");
  useEffect(() => {
    if (data) setIntervalText(String(data.interval_sec));
  }, [data?.interval_sec]);

  const min = data?.min_interval_sec ?? 5;
  const commitInterval = () => {
    const n = Number(intervalText);
    if (!data || !Number.isFinite(n) || n < min) {
      setIntervalText(String(data?.interval_sec ?? min)); // reject: snap back to the live value
      return;
    }
    if (n !== data.interval_sec) update.mutate({ interval_sec: n });
  };

  if (data && !data.background_refresh) {
    return (
      <p className="text-sm text-muted-foreground">
        Live sync is disabled on the server (background refresh is off), so there's nothing to
        configure here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium leading-none">Periodic safety sync</label>
          <p className="text-sm text-muted-foreground">
            Live changes always sync the instant X4 writes a save. This is an extra backstop poll
            that catches a missed write — disable it if it ever interferes with saving.
          </p>
        </div>
        <Switch
          checked={data?.interval_enabled ?? false}
          disabled={!data || update.isPending}
          onCheckedChange={(v) => update.mutate({ interval_enabled: v })}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium leading-none">Backstop interval</label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={min}
            value={intervalText}
            disabled={!data || !data.interval_enabled || update.isPending}
            onChange={(e) => setIntervalText(e.target.value)}
            onBlur={commitInterval}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="w-24 text-right tabular-nums"
          />
          <span className="text-sm text-muted-foreground">sec</span>
        </div>
      </div>
    </div>
  );
}

/** Folder reconfiguration + a destructive full rebuild of the game-derived databases.
 *  Used after a game patch, mod change, or moving the install/save folder. Saved Station
 *  Builder designs (appdata.db) are preserved — only game-derived data is wiped. */
function AdvancedSection({ onReloadStarted }: { onReloadStarted: () => void }) {
  const qc = useQueryClient();
  const { data: status } = useQuery<SetupStatus>({
    queryKey: ["setup-status"],
    queryFn: getSetupStatus,
  });

  const [install, setInstall] = useState("");
  const [save, setSave] = useState("");
  const [installVal, setInstallVal] = useState<PathValidation | null>(null);
  const [saveVal, setSaveVal] = useState<PathValidation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the fields from the persisted config once it loads.
  useEffect(() => {
    if (status?.install_path) setInstall(status.install_path);
    if (status?.save_path) setSave(status.save_path);
  }, [status?.install_path, status?.save_path]);

  const foldersChanged =
    install.trim() !== (status?.install_path ?? "") || save.trim() !== (status?.save_path ?? "");
  // Edited folders must validate; untouched folders are assumed fine (already in use).
  const installOk = install.trim() === (status?.install_path ?? "") || installVal?.ok === true;
  const saveOk = save.trim() === (status?.save_path ?? "") || saveVal?.ok === true;
  const canReload = installOk && saveOk && !submitting;

  async function reload() {
    setSubmitting(true);
    setError(null);
    try {
      if (foldersChanged) await saveConfig(install.trim(), save.trim());
      await resetGameData();
      // Flip the setup gate into its full-screen progress view; the modal can close.
      await qc.invalidateQueries({ queryKey: ["setup-status"] });
      onReloadStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <FolderField
        label="Game install folder"
        hint="The folder containing X4.exe and the .cat archives."
        value={install}
        onChange={setInstall}
        onValidated={setInstallVal}
        kind="install"
      />
      <FolderField
        label="Save folder"
        hint="The folder with your *.xml.gz saves (…/Egosoft/X4/<id>/save)."
        value={save}
        onChange={setSave}
        onValidated={setSaveVal}
        kind="save"
      />

      <div className="rounded-md border border-border p-3 space-y-2">
        <p className="text-sm text-muted-foreground">
          Rebuilds the game databases from your install files. Run this after a game patch, adding
          or removing mods, or changing the folders above. It takes a few minutes. Your saved
          Station Builder designs are kept.
        </p>
        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}
        {confirming ? (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="gap-2"
              disabled={!canReload}
              onClick={reload}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Yes, reload game data
            </Button>
            <Button variant="outline" disabled={submitting} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="gap-2"
            disabled={!canReload}
            onClick={() => setConfirming(true)}
          >
            <RotateCcw className="w-4 h-4" /> Reload game data
          </Button>
        )}
      </div>
    </div>
  );
}

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

            <div className="border-t border-border pt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                Live sync
              </h3>
              <LiveSyncSection />
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                Advanced
              </h3>
              <AdvancedSection onReloadStarted={() => setOpen(false)} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>

          <AppVersion />
        </DialogContent>
      </Dialog>
    </>
  );
}
