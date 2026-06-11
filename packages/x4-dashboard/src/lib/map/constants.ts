// Shared constants for the universe map feature.

export const DLC_LABELS: Record<string, string> = {
  boron:     "Kingdom End",
  terran:    "Cradle of Humanity",
  split:     "Split Vendetta",
  pirate:    "Tides of Avarice",
  timelines: "Timelines",
  "4":       "Hyperion Pack",
  "5":       "Boron Pack",
  odyssey:   "Odyssey of the Ancients",
};

export const RESOURCE_COLORS: Record<string, string> = {
  energy: "#fde047",
  ore: "#fca5a5",
  silicon: "#93c5fd",
  ice: "#bfdbfe",
  nividium: "#d8b4fe",
  rawscrap: "#d1d5db",
  methane: "#fdba74",
  helium: "#fcd34d",
  hydrogen: "#f472b6",
};

export const RESOURCE_ORDER = ["ore", "silicon", "ice", "nividium", "hydrogen", "helium", "methane", "scrap"];

export const MAP_W = 3000;
export const MAP_H = 2200;
export const SQRT3 = Math.sqrt(3);
