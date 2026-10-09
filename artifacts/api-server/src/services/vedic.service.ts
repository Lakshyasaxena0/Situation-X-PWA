// Vedic chart builder for PRASHNA (horary) astrology.
//
// The user never has to give birth details. The chart is cast for the exact moment the
// question is asked (and the place, default New Delhi), which is how Prashna works:
// the sky at the time of the question answers the question.
//
// Four charts are cast from the same sky:
//   D1  Rashi      - the main chart: lagna, Moon, houses (the overall promise of the question)
//   D3  Drekkana   - courage, initiative, effort, siblings/peers
//   D9  Navamsa    - inner strength, partnerships, the final fruit of a planet
//   D10 Dasamsa    - career, profession, status, achievement
// prashna.service.ts decides which of them matter for which kind of question.
//
// Positions and the Lahiri ayanamsa come from ephemeris.service.ts (VSOP87 via `astronomia`).

import {
  BODY_NAMES,
  type BodyName,
  isRetrograde,
  dailyMotion,
  sunTimesFor,
  type SunTimes,
  julianDayFromDate,
  lahiriAyanamsa,
  normalizeDegrees,
  siderealLongitudes,
  tropicalAscendant,
} from "./ephemeris.service.js";

export const RASHI_NAMES = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

/** Ruler of each sign, Aries..Pisces (classical Vedic rulers; the nodes rule no sign). */
export const SIGN_RULERS = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"];

const NAVAMSA_RASHI_START: Record<string, number> = {
  Aries: 0, Taurus: 9, Gemini: 6, Cancer: 3, Leo: 0, Virgo: 9, Libra: 6, Scorpio: 3, Sagittarius: 0, Capricorn: 9, Aquarius: 6, Pisces: 3,
};

// Sign indices (0 = Aries)
const EXALTATION: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6, Rahu: 1, Ketu: 7 };
const DEBILITATION: Record<string, number> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0, Rahu: 7, Ketu: 1 };
const OWN_SIGNS: Record<string, number[]> = {
  Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10], Rahu: [], Ketu: [],
};

export type Dignity = "exalted" | "own" | "debilitated" | "neutral";

export function dignityOf(planet: string, signIndex: number): Dignity {
  if (EXALTATION[planet] === signIndex) return "exalted";
  if (DEBILITATION[planet] === signIndex) return "debilitated";
  if (OWN_SIGNS[planet]?.includes(signIndex)) return "own";
  return "neutral";
}

function getSign(longitude: number): string {
  return RASHI_NAMES[Math.floor(longitude / 30)];
}

function getDegreeInSign(longitude: number): number {
  return longitude % 30;
}

// D3 (Drekkana): each sign has 3 parts of 10 degrees: the 1st part is the sign itself,
// the 2nd is its 5th sign, the 3rd is its 9th sign.
export function getDrekkana(longitude: number): string {
  const signIndex = Math.floor(longitude / 30);
  const part = Math.min(2, Math.floor((longitude % 30) / 10));
  return RASHI_NAMES[(signIndex + part * 4) % 12];
}

// D9 (Navamsa): each sign has 9 navamsas of 3 deg 20 min. Movable signs start from
// themselves, fixed from their 9th, dual from their 5th.
export function getNavamsa(longitude: number): string {
  const signIndex = Math.floor(longitude / 30);
  const posInSign = longitude % 30;
  const navamsaIndex = Math.min(8, Math.floor(posInSign / (10 / 3)));
  const startNavamsa = NAVAMSA_RASHI_START[RASHI_NAMES[signIndex]] ?? 0;
  return RASHI_NAMES[(startNavamsa + navamsaIndex) % 12];
}

// D10 (Dasamsa): each sign has 10 divisions of 3 degrees. Odd signs start from
// themselves, even signs from their 9th.
export function getDasamsa(longitude: number): string {
  const signIndex = Math.floor(longitude / 30);
  const dasamsaIndex = Math.min(9, Math.floor((longitude % 30) / 3));
  const isOddSign = signIndex % 2 === 0; // Aries (index 0) is the 1st, an odd sign
  const startSign = isOddSign ? signIndex : (signIndex + 8) % 12;
  return RASHI_NAMES[(startSign + dasamsaIndex) % 12];
}

// D4 (Chaturthamsa, property & home): four parts of 7.5 deg; the signs are the sign itself and its 4th, 7th, 10th.
export function getChaturthamsa(longitude: number): string {
  const signIndex = Math.floor(longitude / 30);
  const part = Math.min(3, Math.floor((longitude % 30) / 7.5));
  return RASHI_NAMES[(signIndex + part * 3) % 12];
}

// D7 (Saptamsa, children): seven parts of 4 deg 17 min. Odd signs start from themselves, even signs from their 7th.
export function getSaptamsa(longitude: number): string {
  const signIndex = Math.floor(longitude / 30);
  const part = Math.min(6, Math.floor((longitude % 30) / (30 / 7)));
  const start = signIndex % 2 === 0 ? signIndex : (signIndex + 6) % 12;
  return RASHI_NAMES[(start + part) % 12];
}

// D12 (Dwadasamsa, parents & lineage): twelve parts of 2.5 deg, counted from the sign itself.
export function getDwadasamsa(longitude: number): string {
  const signIndex = Math.floor(longitude / 30);
  const part = Math.min(11, Math.floor((longitude % 30) / 2.5));
  return RASHI_NAMES[(signIndex + part) % 12];
}

// D2 (Hora, used for strength only): odd signs give Leo then Cancer, even signs Cancer then Leo.
export function getHora(longitude: number): string {
  const signIndex = Math.floor(longitude / 30);
  const first = (longitude % 30) < 15;
  const odd = signIndex % 2 === 0;
  return odd === first ? "Leo" : "Cancer";
}

// D30 (Trimsamsa, used for strength only): unequal parts ruled by Mars, Saturn, Jupiter, Mercury, Venus.
export function getTrimsamsa(longitude: number): string {
  const signIndex = Math.floor(longitude / 30);
  const d = longitude % 30;
  if (signIndex % 2 === 0) {
    return d < 5 ? "Aries" : d < 10 ? "Aquarius" : d < 18 ? "Sagittarius" : d < 25 ? "Gemini" : "Libra";
  }
  return d < 5 ? "Taurus" : d < 12 ? "Virgo" : d < 20 ? "Pisces" : d < 25 ? "Capricorn" : "Scorpio";
}

export type DashaLevel = { planet: string; startDate: string; endDate: string; years: number };
export type VedicDashaTree = {
  mahadasha: DashaLevel;
  antardasha?: DashaLevel;
  pratyantardasha?: DashaLevel;
  sookshmadasha?: DashaLevel;
};

export type PlanetPosition = {
  name: string;
  longitude: number;
  sign: string;
  signIndex: number;
  degree: number;
  isRetrograde: boolean;
  navamsaSign: string;
  dasamsaSign: string;
  drekkanaSign: string;
  /** House (1-12, whole-sign) counted from THIS chart's own lagna. */
  house: number;
  /** Dignity of the planet in this chart's sign. */
  dignity: Dignity;
};

export type VedicChart = {
  ascendant: string;
  ascendantDegree: number;
  planets: PlanetPosition[];
  currentDasha?: VedicDashaTree;
  ayanamsa: number;
  chartType: string;
};

export type VedicChartSet = { d1: VedicChart; d3: VedicChart; d4: VedicChart; d7: VedicChart; d9: VedicChart; d10: VedicChart; d12: VedicChart };

export type PrashnaSky = {
  charts: VedicChartSet;
  castAt: Date;
  latitude: number;
  longitude: number;
  /** True when the Moon is between new and full (waxing). */
  moonWaxing: boolean;
  /** Planets too close to the Sun to give their results freely. */
  combust: string[];
  /** Julian day (UT) of the question. */
  jd: number;
  /** Sidereal (Lahiri) longitude of the ascendant and of every graha. */
  ascendant: number;
  longitudes: Record<BodyName, number>;
  /** Daily motion, degrees per day (negative = retrograde). */
  speeds: Record<BodyName, number>;
  /** Sidereal positions of the question's planets in the strength divisions that are not shown (D2, D30). */
  sunTimes: SunTimes;
};

export class ChartInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartInputError";
  }
}

/** Orb in degrees within which a planet is considered combust (asta). */
const COMBUST_ORB: Record<string, number> = { Moon: 12, Mars: 17, Mercury: 14, Jupiter: 11, Venus: 10, Saturn: 15 };

const DEFAULT_LATITUDE = 28.6139;   // New Delhi
const DEFAULT_LONGITUDE = 77.209;

function angularSeparation(a: number, b: number): number {
  const d = Math.abs(normalizeDegrees(a) - normalizeDegrees(b)) % 360;
  return d > 180 ? 360 - d : d;
}

type DivisionFn = (lon: number) => string;

/** Builds one chart. `signOf` maps a sidereal longitude to the sign it falls in for this chart. */
function buildChart(
  chartType: string,
  signOf: DivisionFn,
  rashiLongitudes: Record<string, number>,
  ascendantSidereal: number,
  retro: Record<string, boolean>,
  ayanamsa: number,
): VedicChart {
  const ascSign = signOf(ascendantSidereal);
  const ascIndex = RASHI_NAMES.indexOf(ascSign);
  const planets: PlanetPosition[] = BODY_NAMES.map((name) => {
    const lon = rashiLongitudes[name];
    const sign = signOf(lon);
    const signIndex = RASHI_NAMES.indexOf(sign);
    return {
      name,
      // D1: the real sidereal longitude. Divisional charts: the exact degree inside a divisional
      // sign has no meaning, so keep the planet's degree-in-sign within its divisional sign.
      longitude: chartType === "D1"
        ? parseFloat(lon.toFixed(4)) % 360
        : signIndex * 30 + Math.min(29.99, getDegreeInSign(lon)),
      sign,
      signIndex,
      degree: parseFloat(getDegreeInSign(lon).toFixed(2)),
      isRetrograde: retro[name],
      navamsaSign: getNavamsa(lon),
      dasamsaSign: getDasamsa(lon),
      drekkanaSign: getDrekkana(lon),
      house: ((signIndex - ascIndex + 12) % 12) + 1,
      dignity: dignityOf(name, signIndex),
    };
  });
  return {
    ascendant: ascSign,
    ascendantDegree: parseFloat(getDegreeInSign(ascendantSidereal).toFixed(2)),
    planets,
    ayanamsa: parseFloat(ayanamsa.toFixed(4)),
    chartType,
  };
}

/**
 * Casts the Prashna charts for the moment `at` (default: now) at a place
 * (default: New Delhi). No birth data is involved.
 */
export function castPrashnaCharts(
  at: Date = new Date(),
  latitude: number = DEFAULT_LATITUDE,
  longitude: number = DEFAULT_LONGITUDE,
): PrashnaSky {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ChartInputError("latitude must be between -90 and 90.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ChartInputError("longitude must be between -180 and 180.");
  }

  const jd = julianDayFromDate(at);
  const ayanamsa = lahiriAyanamsa(jd);
  const sidereal = siderealLongitudes(jd);
  const ascendantSidereal = normalizeDegrees(tropicalAscendant(jd, latitude, longitude) - ayanamsa);

  const retro: Record<string, boolean> = {};
  for (const name of BODY_NAMES) retro[name] = isRetrograde(name, jd);

  const d1 = buildChart("D1", getSign, sidereal, ascendantSidereal, retro, ayanamsa);
  const d3 = buildChart("D3", getDrekkana, sidereal, ascendantSidereal, retro, ayanamsa);
  const d4 = buildChart("D4", getChaturthamsa, sidereal, ascendantSidereal, retro, ayanamsa);
  const d7 = buildChart("D7", getSaptamsa, sidereal, ascendantSidereal, retro, ayanamsa);
  const d9 = buildChart("D9", getNavamsa, sidereal, ascendantSidereal, retro, ayanamsa);
  const d10 = buildChart("D10", getDasamsa, sidereal, ascendantSidereal, retro, ayanamsa);
  const d12 = buildChart("D12", getDwadasamsa, sidereal, ascendantSidereal, retro, ayanamsa);
  const speeds = {} as Record<BodyName, number>;
  for (const name of BODY_NAMES) speeds[name] = dailyMotion(name, jd);

  const elongation = normalizeDegrees(sidereal.Moon - sidereal.Sun);
  // Orbs are a little tighter for Mercury and Venus when retrograde. Within 1 degree of the Sun a planet is
  // "cazimi" (in the heart of the Sun), which strengthens it, so it is not listed as combust.
  const combust = Object.entries(COMBUST_ORB)
    .filter(([name, orb]) => {
      if (name === "Moon") return false;
      const sep = angularSeparation(sidereal[name as BodyName], sidereal.Sun);
      const limit = retro[name] && name === "Mercury" ? 12 : retro[name] && name === "Venus" ? 8 : orb;
      return sep <= limit && sep >= 1;
    })
    .map(([name]) => name);

  return {
    charts: { d1, d3, d4, d7, d9, d10, d12 },
    castAt: at,
    latitude,
    longitude,
    moonWaxing: elongation < 180,
    combust,
    jd,
    ascendant: ascendantSidereal,
    longitudes: sidereal,
    speeds,
    sunTimes: sunTimesFor(jd, latitude, longitude),
  };
}
