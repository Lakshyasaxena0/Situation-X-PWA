// backend/src/services/astro.service.ts
//
// Astronomical calculations (see ephemeris.service.ts):
// - Full VSOP87D planetary theory + Meeus lunar series via `astronomia`
//   (geocentric, light-time corrected) — arc-second level accuracy
// - Lahiri ayanamsa (standard for Vedic/Indian astrology)
// - Vimshottari Dasha system (4 levels: Maha → Antar → Pratyantar → Sookshma)
// - PRASHNA (horary) charts D1, D3, D9, D10 cast for the moment of the question
//   (vedic.service.ts) and read per question type (prashna.service.ts)
// - System clock for date/time; NO birth details are asked from the user
// - Optional lat/lon (defaults to New Delhi if not provided)

import type { IntentType } from "./ajit.service.js";
import type { EmotionType } from "./manu.service.js";
import { castPrashnaCharts, type VedicChart, type VedicDashaTree } from "./vedic.service.js";
import { readPrashna, type PrashnaReading } from "./prashna.service.js";
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

export type DivisionalChart = {
  name: string;
  planets: Record<string, { sign: string; signIndex: number }>;
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
  currentPlanets: Record<string, PlanetPosition>;
  dasha: VimshottariDasha;
  d1: DivisionalChart;
  d9: DivisionalChart;
  d10: DivisionalChart;
  /** Prashna charts cast for the moment of the question (no birth data). */
  vedicD1: VedicChart;
  vedicD3: VedicChart;
  vedicD9: VedicChart;
  vedicD10: VedicChart;
  /** Which house and which divisional charts were used for this question, and why. */
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
// STEP 5: DIVISIONAL CHARTS
// -----------------------------------------------------------------------

// D1 — Rasi chart (same as natal positions)
function getD1(
  positions: Record<string, PlanetPosition>
): DivisionalChart {
  const planets: Record<string, { sign: string; signIndex: number }> = {};
  for (const [name, pos] of Object.entries(positions)) {
    planets[name] = { sign: pos.sign, signIndex: pos.signIndex };
  }
  return { name: "D1 (Rasi)", planets };
}

// D9 — Navamsha chart
// Each sign is divided into 9 parts of 3°20' (3.333°)
// Start sign depends on element: Fire→Aries, Earth→Capricorn, Air→Libra, Water→Cancer
function getNavamshaSign(lon: number): { sign: string; signIndex: number } {
  const signIndex = Math.floor(lon / 30);
  const degInSign = lon - signIndex * 30;
  const navamshaNum = Math.floor(degInSign / (30 / 9)); // 0–8

  // Element-based start sign
  const startMap = [0, 9, 6, 3, 0, 9, 6, 3, 0, 9, 6, 3];
  const navamshaSignIndex = (startMap[signIndex] + navamshaNum) % 12;
  return { sign: SIGNS[navamshaSignIndex], signIndex: navamshaSignIndex };
}

function getD9(
  positions: Record<string, PlanetPosition>
): DivisionalChart {
  const planets: Record<string, { sign: string; signIndex: number }> = {};
  for (const [name, pos] of Object.entries(positions)) {
    planets[name] = getNavamshaSign(pos.longitude);
  }
  return { name: "D9 (Navamsha)", planets };
}

// D10 — Dashamsha chart
// Each sign is divided into 10 parts of 3°
// Odd signs: count from same sign; Even signs: count from 9th sign
function getDashamamshaSign(lon: number): { sign: string; signIndex: number } {
  const signIndex = Math.floor(lon / 30);
  const degInSign = lon - signIndex * 30;
  const dashamamshaNum = Math.floor(degInSign / 3); // 0–9
  const isOdd = signIndex % 2 === 0; // 0-indexed Aries = odd
  const startSign = isOdd ? signIndex : (signIndex + 8) % 12;
  const dashamamshaSignIndex = (startSign + dashamamshaNum) % 12;
  return { sign: SIGNS[dashamamshaSignIndex], signIndex: dashamamshaSignIndex };
}

function getD10(
  positions: Record<string, PlanetPosition>
): DivisionalChart {
  const planets: Record<string, { sign: string; signIndex: number }> = {};
  for (const [name, pos] of Object.entries(positions)) {
    planets[name] = getDashamamshaSign(pos.longitude);
  }
  return { name: "D10 (Dashamsha)", planets };
}

// -----------------------------------------------------------------------
// STEP 6: VIMSHOTTARI DASHA — 4 LEVELS
// Based on Moon's current nakshatra and position within it
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// STEP 7: PRASHNA CHART + READING (replaces natal charts; no birth data needed)
// -----------------------------------------------------------------------

function dashaToTree(dasha: VimshottariDasha): VedicDashaTree {
  const lv = (d: DashaLevel) => ({ planet: d.planet, startDate: d.startDate, endDate: d.endDate, years: d.durationYears });
  return {
    mahadasha: lv(dasha.mahadasha),
    antardasha: lv(dasha.antardasha),
    pratyantardasha: lv(dasha.pratyantardasha),
    sookshmadasha: lv(dasha.sookshmadasha),
  };
}

// -----------------------------------------------------------------------
// MAIN EXPORTED FUNCTION
// -----------------------------------------------------------------------

export function analyzeAstro(
  intent: IntentType,
  _emotion: EmotionType,
  options?: { latitude?: number; longitude?: number; at?: Date; text?: string }
): AstroResult {
  const now = options?.at ?? new Date(); // The sky at the moment of the question

  const latitude = options?.latitude ?? 28.6139;   // Default: New Delhi
  const longitude = options?.longitude ?? 77.2090;

  const jd = julianDayFromDate(now);

  // Current sidereal positions (Lahiri) with nakshatras
  const positions = computePlanetPositions(jd);

  // Simple sign-only divisional views (kept for backward compatibility)
  const d1 = getD1(positions);
  const d9 = getD9(positions);
  const d10 = getD10(positions);

  // Vimshottari Dasha running from the Moon at this moment
  const dasha = vimshottariAt(positions["Moon"].longitude, now, now);

  // Prashna: cast D1, D3, D9, D10 for this moment and read the ones relevant to the question
  const sky = castPrashnaCharts(now, latitude, longitude);
  const prashna = readPrashna(intent, sky);

  // Dashas are consulted only when the question is about timing ("when", "kab tak", "how long").
  const timing = isTimeBased(options?.text ?? "") ? analyzeTiming(intent, { at: now, latitude, longitude }) : undefined;

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
    currentPlanets: positions,
    dasha,
    d1,
    d9,
    d10,
    vedicD1: { ...sky.charts.d1, currentDasha: dashaToTree(dasha) },
    vedicD3: sky.charts.d3,
    vedicD9: sky.charts.d9,
    vedicD10: sky.charts.d10,
    prashna,
    timing,
    calculatedAt: now.toISOString(),
    location: { latitude, longitude },
  };
}
