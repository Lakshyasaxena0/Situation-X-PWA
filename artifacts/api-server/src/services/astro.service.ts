// backend/src/services/astro.service.ts
//
// Astronomical calculations (see ephemeris.service.ts):
// - Full VSOP87D planetary theory + Meeus lunar series via `astronomia`
//   (geocentric, light-time corrected) — arc-second level accuracy
// - Lahiri ayanamsa (standard for Vedic/Indian astrology)
// - Vimshottari Dasha system (4 levels: Maha → Antar → Pratyantar → Sookshma)
// - PRASHNA (horary) charts D1/D3/D4/D7/D9/D10/D12 cast for the moment of the question
//   (vedic.service.ts) and read per question type (prashna.service.ts); everything is used
//   internally, only the ascendant (sign + degree) is shown to the person
// - System clock for date/time; NO birth details are asked from the user
// - Optional lat/lon (defaults to New Delhi if not provided)

import type { IntentType } from "./ajit.service.js";
import type { EmotionType } from "./manu.service.js";
import { castPrashnaCharts } from "./vedic.service.js";
import { readPrashna, NO_TUNING, type PrashnaReading, type Tuning } from "./prashna.service.js";
import { vimshottariAt, type DashaLevel, type VimshottariDasha } from "./dasha.service.js";
import { analyzeTiming, isTimeBased, type TimingResult } from "./timing.service.js";
import {
  BODY_NAMES,
  julianDayFromDate,
  siderealLongitudes,
} from "./ephemeris.service.js";

// -----------------------------------------------------------------------
// EXTENDED TYPE DEFINITIONS
// -----------------------------------------------------------------------

export type PlanetPosition = {
  name: string;
  longitude: number;       // 0–360 sidereal (Lahiri)
  sign: string;            // e.g. "Aries"
  signIndex: number;       // 0–11
  degree: number;          // degrees within sign (0–30)
  nakshatra: string;       // e.g. "Rohini"
  nakshatraLord: string;   // ruling planet of nakshatra
};

export type { DashaLevel, VimshottariDasha } from "./dasha.service.js";

export type AstroInfluence = {
  dominantPlanet: string;
  stability: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  signal: "favorable" | "challenging" | "neutral";
};

export type AstroResult = {
  influence: AstroInfluence;
  interpretation: string;
  /** The only part of the chart that is shown: the rising sign and how far into it. */
  ascendant: { sign: string; degree: number; lord: string };
  /** Which learned weighting was applied (null = built-in weights). */
  tuning: { id: number | null; astroShare: number | null };
  /** Positions at the moment of the question. Internal (fed to the AI), not sent to the person. */
  currentPlanets: Record<string, PlanetPosition>;
  /** Running Vimshottari dasha of the moment. Internal; the person sees dashas only in `timing`. */
  dasha: VimshottariDasha;
  /** What the reading weighed (houses, charts, factors). `dossier` is internal. */
  prashna: PrashnaReading;
  /** Running dashas (Vimshottari + Chara) of the Prashna chart. Only present when the question asks about timing. */
  timing?: TimingResult;
  calculatedAt: string;
  location: { latitude: number; longitude: number };
};

// -----------------------------------------------------------------------
// CONSTANTS
// -----------------------------------------------------------------------

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer",
  "Leo", "Virgo", "Libra", "Scorpio",
  "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira",
  "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha",
  "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra",
  "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula",
  "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishtha",
  "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];

// Nakshatra lords in the Vimshottari sequence (repeats every 9)
const NAKSHATRA_LORDS = [
  "Ketu", "Venus", "Sun", "Moon", "Mars",
  "Rahu", "Jupiter", "Saturn", "Mercury",
];

const NAKSHATRA_SPAN = 360 / 27; // 13.3333°

// -----------------------------------------------------------------------
// STEP 1: COMPUTE ALL SIDEREAL POSITIONS (Lahiri)
// -----------------------------------------------------------------------

function computePlanetPositions(
  jd: number
): Record<string, PlanetPosition> {
  const sidereal = siderealLongitudes(jd);
  const positions: Record<string, PlanetPosition> = {};

  for (const name of BODY_NAMES) {
    const lon = sidereal[name];
    const signIndex = Math.floor(lon / 30);
    const degree = lon - signIndex * 30;
    const nakshatraIndex = Math.floor(lon / NAKSHATRA_SPAN);
    const lordIndex = nakshatraIndex % 9;

    positions[name] = {
      name,
      // Rounding can produce exactly 360 (e.g. 359.99996); keep it in [0, 360).
      longitude: parseFloat(lon.toFixed(4)) % 360,
      sign: SIGNS[signIndex],
      signIndex,
      degree: parseFloat(degree.toFixed(4)),
      nakshatra: NAKSHATRAS[nakshatraIndex],
      nakshatraLord: NAKSHATRA_LORDS[lordIndex],
    };
  }

  return positions;
}

// -----------------------------------------------------------------------
// STEP 7: PRASHNA CHART + READING (replaces natal charts; no birth data needed)
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// MAIN EXPORTED FUNCTION
// -----------------------------------------------------------------------

export function analyzeAstro(
  intent: IntentType,
  _emotion: EmotionType,
  options?: { latitude?: number; longitude?: number; at?: Date; text?: string; tuning?: Tuning }
): AstroResult {
  const now = options?.at ?? new Date(); // The sky at the moment of the question
  const text = options?.text ?? "";
  const tuning = options?.tuning ?? NO_TUNING;

  const latitude = options?.latitude ?? 28.6139;   // Default: New Delhi
  const longitude = options?.longitude ?? 77.2090;

  const jd = julianDayFromDate(now);
  const positions = computePlanetPositions(jd);
  const dasha = vimshottariAt(positions["Moon"].longitude, now, now);

  // Prashna: cast D1/D3/D4/D7/D9/D10/D12 for this moment and read the ones relevant to the question
  const sky = castPrashnaCharts(now, latitude, longitude);
  const prashna = readPrashna(intent, sky, { text, tuning });

  // Dashas are consulted only when the question is about timing ("when", "kab tak", "how long").
  const timing = isTimeBased(text) ? analyzeTiming(intent, { at: now, latitude, longitude, text }) : undefined;

  const influence: AstroInfluence = {
    dominantPlanet: prashna.dominantPlanet,
    stability: prashna.stability,
    risk: prashna.risk,
    signal: prashna.signal,
  };

  const dashaStr = `${dasha.mahadasha.planet} / ${dasha.antardasha.planet} / ${dasha.pratyantardasha.planet}`;
  const interpretation = timing ? `${prashna.summary} Dasha of the question chart now: ${dashaStr}.` : prashna.summary;

  return {
    influence,
    interpretation,
    ascendant: { sign: prashna.lagna, degree: Math.round(prashna.lagnaDegree * 100) / 100, lord: prashna.lagnaLord },
    tuning: { id: tuning.id, astroShare: tuning.astroShare ?? null },
    currentPlanets: positions,
    dasha,
    prashna,
    timing,
    calculatedAt: now.toISOString(),
    location: { latitude, longitude },
  };
}

/** What may leave the server: no chart tables, no dossier, no raw dasha of the moment. */
export function publicAstro(a: AstroResult): Omit<AstroResult, "currentPlanets" | "dasha" | "prashna"> & { prashna: Omit<PrashnaReading, "dossier"> } {
  const { currentPlanets: _c, dasha: _d, prashna, ...rest } = a;
  const { dossier: _dossier, ...pub } = prashna;
  return { ...rest, prashna: pub };
}
