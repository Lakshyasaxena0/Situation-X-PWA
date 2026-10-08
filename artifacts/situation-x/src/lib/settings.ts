import { createStore } from "./store";
import { validCoords } from "./places";

export type Language = "auto" | "en" | "hi" | "hinglish";
export type Depth = "auto" | "standard" | "deep" | "expert";

export type SavedPlace = { name: string; latitude: number; longitude: number };

export type BirthSettings = {
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm (24 hour) */
  time: string;
  /** Minutes east of UTC at the birth place, e.g. 330 for India. */
  utcOffsetMinutes: number;
  place: SavedPlace;
};

export type Settings = {
  language: Language;
  useAi: boolean;
  useAstrology: boolean;
  depth: Depth;
  /** Where the questions are asked; sets the ascendant of the chart. null = New Delhi. */
  location: SavedPlace | null;
  /** Optional: with birth details the dashas are those of the person's own chart. */
  birth: BirthSettings | null;
  /** Show the astrology details expanded by default. */
  expandAstrology: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  useAi: true,
  useAstrology: true,
  depth: "auto",
  location: null,
  birth: null,
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
  const b = r.birth as Partial<BirthSettings> | null | undefined;
  const birthPlace = place(b?.place);
  const birth =
    b && typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && typeof b.time === "string" && /^\d{2}:\d{2}$/.test(b.time) &&
    typeof b.utcOffsetMinutes === "number" && Math.abs(b.utcOffsetMinutes) <= 14 * 60 && birthPlace
      ? { date: b.date, time: b.time, utcOffsetMinutes: b.utcOffsetMinutes, place: birthPlace }
      : null;
  return {
    language: LANGS.includes(r.language as Language) ? (r.language as Language) : DEFAULT_SETTINGS.language,
    useAi: typeof r.useAi === "boolean" ? r.useAi : DEFAULT_SETTINGS.useAi,
    useAstrology: typeof r.useAstrology === "boolean" ? r.useAstrology : DEFAULT_SETTINGS.useAstrology,
    depth: DEPTHS.includes(r.depth as Depth) ? (r.depth as Depth) : DEFAULT_SETTINGS.depth,
    location: place(r.location),
    birth,
    expandAstrology: typeof r.expandAstrology === "boolean" ? r.expandAstrology : DEFAULT_SETTINGS.expandAstrology,
  };
}

export const settingsStore = createStore<Settings>("sx_settings_v1", DEFAULT_SETTINGS, "local", sanitizeSettings);

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const s = settingsStore.use();
  return [s, (patch) => settingsStore.set((prev) => ({ ...prev, ...patch }))];
}

/** "1995-04-12" + "08:30" + 330 -> "1995-04-12T08:30:00+05:30" */
export function birthToIso(b: BirthSettings): string {
  const sign = b.utcOffsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(b.utcOffsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${b.date}T${b.time}:00${sign}${hh}:${mm}`;
}

/** The part of the analysis request that comes from Settings. */
export function requestOptions(s: Settings) {
  return {
    language: s.language,
    useAi: s.useAi,
    useAstrology: s.useAstrology,
    latitude: s.location?.latitude,
    longitude: s.location?.longitude,
    birth: s.birth && s.useAstrology
      ? { datetime: birthToIso(s.birth), latitude: s.birth.place.latitude, longitude: s.birth.place.longitude }
      : undefined,
  };
}
