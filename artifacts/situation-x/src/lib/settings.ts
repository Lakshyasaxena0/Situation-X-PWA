import { createStore } from "./store";
import { validCoords } from "./places";

export type Language = "auto" | "en" | "hi" | "hinglish";
export type Depth = "auto" | "standard" | "deep" | "expert";

export type SavedPlace = { name: string; latitude: number; longitude: number };

export type Settings = {
  language: Language;
  useAi: boolean;
  useAstrology: boolean;
  depth: Depth;
  /** Where the questions are asked; sets the ascendant of the chart. null = New Delhi. */
  location: SavedPlace | null;
  /** Show the astrology details expanded by default. */
  expandAstrology: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  useAi: true,
  useAstrology: true,
  depth: "auto",
  location: null,
  expandAstrology: false,
};

const LANGS: Language[] = ["auto", "en", "hi", "hinglish"];
const DEPTHS: Depth[] = ["auto", "standard", "deep", "expert"];

function place(raw: unknown): SavedPlace | null {
  const p = raw as Partial<SavedPlace> | null;
  if (!p || typeof p.name !== "string" || typeof p.latitude !== "number" || typeof p.longitude !== "number") return null;
  return validCoords(p.latitude, p.longitude) ? { name: p.name.slice(0, 80), latitude: p.latitude, longitude: p.longitude } : null;
}

/** Accepts whatever is in storage and returns a safe Settings object. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    language: LANGS.includes(r.language as Language) ? (r.language as Language) : DEFAULT_SETTINGS.language,
    useAi: typeof r.useAi === "boolean" ? r.useAi : DEFAULT_SETTINGS.useAi,
    useAstrology: typeof r.useAstrology === "boolean" ? r.useAstrology : DEFAULT_SETTINGS.useAstrology,
    depth: DEPTHS.includes(r.depth as Depth) ? (r.depth as Depth) : DEFAULT_SETTINGS.depth,
    location: place(r.location),
    expandAstrology: typeof r.expandAstrology === "boolean" ? r.expandAstrology : DEFAULT_SETTINGS.expandAstrology,
  };
}

export const settingsStore = createStore<Settings>("sx_settings_v1", DEFAULT_SETTINGS, "local", sanitizeSettings);

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const s = settingsStore.use();
  return [s, (patch) => settingsStore.set((prev) => ({ ...prev, ...patch }))];
}

/** The part of the analysis request that comes from Settings. */
export function requestOptions(s: Settings) {
  return {
    language: s.language,
    useAi: s.useAi,
    useAstrology: s.useAstrology,
    latitude: s.location?.latitude,
    longitude: s.location?.longitude,
  };
}
