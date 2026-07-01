import React, { createContext, useContext, useEffect, useState } from "react";

export type EventPriority = "critical" | "high" | "normal" | "low" | "hidden";

/** Priority keys are category keys from logbook_rules.json, plus "general" fallback. */
export type EventPriorities = Record<string, EventPriority>;

export type Settings = {
  fogOfWar: boolean;
  logbookPriorities: EventPriorities;
};

type SettingsContextType = {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
};

const defaultSettings: Settings = {
  fogOfWar: true,
  logbookPriorities: {
    // combat
    combat: "critical",
    "combat.destroyed": "critical",
    "combat.attack": "high",
    "combat.hostile": "normal",
    "combat.ammo": "low",
    // personnel
    personnel: "normal",
    "personnel.assigned": "low",
    "personnel.hired": "high",
    "personnel.fired": "normal",
    "personnel.transferred": "low",
    "personnel.promoted": "high",
    "personnel.crew_lost": "critical",
    "personnel.arrived": "low",
    // economy
    economy: "normal",
    "economy.trade": "normal",
    "economy.transaction": "normal",
    "economy.account": "high",
    "economy.mining": "low",
    "economy.refuel": "low",
    // reputation
    reputation: "normal",
    "reputation.gained": "normal",
    "reputation.lost": "high",
    "reputation.relations": "normal",
    // missions
    missions: "normal",
    "missions.accepted": "normal",
    "missions.completed": "high",
    "missions.failed": "high",
    "missions.update": "normal",
    "missions.aborted": "normal",
    // alerts
    alerts: "high",
    "alerts.police": "low",
    "alerts.pirate": "high",
    "alerts.abandoned": "normal",
    "alerts.lockbox": "low",
    "alerts.contraband": "high",
    "alerts.warning": "normal",
    // boarding
    boarding: "high",
    "boarding.operation": "high",
    "boarding.casualties": "critical",
    "boarding.captured": "high",
    "boarding.forced_pilot": "high",
    // construction
    construction: "normal",
    "construction.built": "high",
    "construction.repaired": "normal",
    "construction.resupplied": "normal",
    "construction.plot": "high",
    // looting
    looting: "low",
    "looting.container": "low",
    "looting.ammo": "low",
    "looting.inventory": "low",
    "looting.lockbox_loot": "low",
    // hacking
    hacking: "normal",
    "hacking.success": "normal",
    "hacking.failure": "normal",
    "hacking.discount": "high",
    "hacking.sabotage": "high",
    // research
    research: "low",
    "research.blueprint": "high",
    "research.research": "high",
    "research.signal": "normal",
    // rewards
    rewards: "normal",
    "rewards.reward": "normal",
    "rewards.bounty": "high",
    // news
    news: "normal",
    "news.emergency": "critical",
    "news.news": "normal",
    "news.war": "high",
    // tips
    tips: "low",
    "tips.tip": "low",
    // ventures
    ventures: "low",
    "ventures.venture": "low",
    // fallback
    other: "normal",
    "other.other": "normal",
    general: "normal",
  },
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("x4c_settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate: if stored priorities use old keys (emergency, destroyed, …),
        // drop them and use the new defaults.
        const storedPrios = parsed.logbookPriorities ?? {};
        const hasOldKeys = Object.keys(storedPrios).some(
          (k) => ["emergency", "destroyed", "attack", "evacuation", "police"].includes(k)
        );
        if (hasOldKeys) {
          delete parsed.logbookPriorities;
        }
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch (e) {
      console.error("Failed to load settings from local storage", e);
    }
    setIsLoaded(true);
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem("x4c_settings", JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save settings to local storage", e);
      }
      return updated;
    });
  };

  if (!isLoaded) return null; // Avoid hydration mismatch

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
