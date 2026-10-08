// Dasha systems: Vimshottari (Moon-nakshatra based) and Jaimini Chara dasha (sign based).
//
// Both are pure functions of (chart, birth moment, "now") so they can be tested against known
// charts. They work for ANY chart moment: the person's birth when they gave birth details, or
// the moment of the question (the Prashna chart) when they did not.
//
// Conventions (stated because astrologers differ on them):
//   - A dasha year is 365.25 days (JHora's default; the 360-day "savana" year is not used).
//   - Vimshottari: balance of the first Mahadasha from the Moon's exact position in its nakshatra;
//     sub-periods in proportion to the planets' years, starting with the period lord.
//   - Chara dasha (Jaimini): signs run from the Lagna, direct when the Lagna is an odd sign and
//     reverse when it is an even sign. A sign's years = signs counted from it to its lord, minus
//     one (counted forward from Aries/Taurus/Gemini/Libra/Scorpio/Sagittarius, backward from the
//     other six); a lord in its own sign gives 12. Scorpio and Aquarius take the stronger of their
//     two lords. Antardashas are the 12 signs, each 1/12 of the Mahadasha, in the same direction
//     starting from the sign after the dasha sign (the dasha sign comes last). Only the first
//     cycle of 12 Mahadashas is computed.

export const NAKSHATRA_SPAN = 360 / 27;
export const NAKSHATRA_LORDS = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"] as const;
export const DASHA_YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};
export const TOTAL_DASHA_YEARS = 120;
export const DASHA_YEAR_MS = 365.25 * 24 * 3600 * 1000;

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const CLASSICAL_LORDS = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"];

const dateOnly = (ms: number) => new Date(ms).toISOString().split("T")[0];

// ---------------------------------------------------------------------------
// Vimshottari
// ---------------------------------------------------------------------------

export type DashaLevel = { planet: string; startDate: string; endDate: string; durationYears: number };
export type VimshottariDasha = {
  mahadasha: DashaLevel;
  antardasha: DashaLevel;
  pratyantardasha: DashaLevel;
  sookshmadasha: DashaLevel;
};

type Span = { planet: string; start: number; end: number };

/** The sub-period of `parent` (in Vimshottari order, starting with the parent's own lord) that contains `at`. */
function subPeriod(parent: Span, at: number): Span {
  const order = NAKSHATRA_LORDS as readonly string[];
  const startIdx = order.indexOf(parent.planet);
  const length = parent.end - parent.start;
  let cursor = parent.start;
  for (let i = 0; i < 9; i++) {
    const planet = order[(startIdx + i) % 9];
    const end = i === 8 ? parent.end : cursor + (length * DASHA_YEARS[planet]) / TOTAL_DASHA_YEARS;
    if (at < end) return { planet, start: cursor, end };
    cursor = end;
  }
  const last = order[(startIdx + 8) % 9];
  return { planet: last, start: cursor - (length * DASHA_YEARS[last]) / TOTAL_DASHA_YEARS, end: parent.end };
}

/**
 * Vimshottari periods running at `at` for a chart whose Moon was at `moonLongitude` (sidereal,
 * 0-360) at `birth`. For a Prashna chart pass the same moment for both.
 */
export function vimshottariAt(moonLongitude: number, birth: Date, at: Date): VimshottariDasha {
  const moon = ((moonLongitude % 360) + 360) % 360;
  const nakshatra = Math.min(26, Math.floor(moon / NAKSHATRA_SPAN));
  const elapsedFraction = (moon - nakshatra * NAKSHATRA_SPAN) / NAKSHATRA_SPAN;
  const order = NAKSHATRA_LORDS as readonly string[];
  let planet = order[nakshatra % 9];

  // Birth falls this far into the first Mahadasha, so it began before birth.
  let start = birth.getTime() - elapsedFraction * DASHA_YEARS[planet] * DASHA_YEAR_MS;
  let end = start + DASHA_YEARS[planet] * DASHA_YEAR_MS;
  const t = at.getTime();
  // Later Mahadashas follow in the fixed order (the 120-year cycle repeats).
  for (let guard = 0; t >= end && guard < 40; guard++) {
    planet = order[(order.indexOf(planet) + 1) % 9];
    start = end;
    end = start + DASHA_YEARS[planet] * DASHA_YEAR_MS;
  }
  const maha: Span = { planet, start, end };
  const antar = subPeriod(maha, t);
  const prat = subPeriod(antar, t);
  const sook = subPeriod(prat, t);
  const level = (s: Span, digits: number): DashaLevel => ({
    planet: s.planet,
    startDate: dateOnly(s.start),
    endDate: dateOnly(s.end),
    durationYears: parseFloat(((s.end - s.start) / DASHA_YEAR_MS).toFixed(digits)),
  });
  return { mahadasha: level(maha, 3), antardasha: level(antar, 3), pratyantardasha: level(prat, 5), sookshmadasha: level(sook, 7) };
}

// ---------------------------------------------------------------------------
// Chara dasha (Jaimini)
// ---------------------------------------------------------------------------

export type CharaPeriod = { sign: string; signIndex: number; startDate: string; endDate: string; years: number };
export type CharaDasha = {
  school: string;
  direction: "direct" | "reverse";
  mahadasha: CharaPeriod;
  antardasha: CharaPeriod;
  /** The first cycle of 12 Mahadashas with dates. */
  sequence: CharaPeriod[];
  notes: string[];
};

export type CharaInput = {
  /** Sidereal longitude (0-360) of Sun..Saturn, Rahu and Ketu. */
  longitudes: Record<string, number>;
  /** Sidereal longitude of the Lagna. */
  lagnaLongitude: number;
};

const signOf = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30);
/** Aries, Taurus, Gemini, Libra, Scorpio, Sagittarius count forward; the other six count backward. */
const COUNTS_FORWARD = [true, true, true, false, false, false, true, true, true, false, false, false];

/** Which lord of a dual-lord sign is stronger: sits in the sign, has more planets with it, higher degree. */
function strongerLord(signIndex: number, classical: string, coLord: string, lon: Record<string, number>): string {
  const inSign = (p: string) => (signOf(lon[p]) === signIndex ? 1 : 0);
  if (inSign(classical) !== inSign(coLord)) return inSign(classical) ? classical : coLord;
  const companions = (p: string) =>
    Object.keys(lon).filter((q) => q !== p && signOf(lon[q]) === signOf(lon[p])).length;
  if (companions(classical) !== companions(coLord)) return companions(classical) > companions(coLord) ? classical : coLord;
  const deg = (p: string) => ((lon[p] % 30) + 30) % 30;
  if (Math.abs(deg(classical) - deg(coLord)) > 1e-9) return deg(classical) > deg(coLord) ? classical : coLord;
  return classical;
}

export function charaSignYears(signIndex: number, lon: Record<string, number>): number {
  let lord = CLASSICAL_LORDS[signIndex];
  if (signIndex === 7 && lon.Ketu !== undefined) lord = strongerLord(signIndex, "Mars", "Ketu", lon);
  if (signIndex === 10 && lon.Rahu !== undefined) lord = strongerLord(signIndex, "Saturn", "Rahu", lon);
  const lordSign = signOf(lon[lord]);
  const steps = COUNTS_FORWARD[signIndex] ? (lordSign - signIndex + 12) % 12 : (signIndex - lordSign + 12) % 12;
  return steps === 0 ? 12 : steps;
}

export function charaDashaAt(input: CharaInput, birth: Date, at: Date): CharaDasha | null {
  const lagna = signOf(input.lagnaLongitude);
  const direct = lagna % 2 === 0; // Aries (index 0) is an odd sign
  const step = direct ? 1 : -1;
  const signAt = (i: number) => (lagna + step * i + 120) % 12;

  const sequence: (CharaPeriod & { startMs: number; endMs: number })[] = [];
  let cursor = birth.getTime();
  for (let i = 0; i < 12; i++) {
    const idx = signAt(i);
    const years = charaSignYears(idx, input.longitudes);
    const endMs = cursor + years * DASHA_YEAR_MS;
    sequence.push({ sign: SIGNS[idx], signIndex: idx, years, startDate: dateOnly(cursor), endDate: dateOnly(endMs), startMs: cursor, endMs });
    cursor = endMs;
  }
  const t = at.getTime();
  const maha = sequence.find((p) => t >= p.startMs && t < p.endMs);
  if (!maha) return null; // beyond the first cycle: not computed

  const sub = (maha.endMs - maha.startMs) / 12;
  const antarIdx = Math.min(11, Math.floor((t - maha.startMs) / sub));
  // Sub-periods start from the sign after the dasha sign, in the same direction; the dasha sign is last.
  const antarSign = (maha.signIndex + step * (antarIdx + 1) + 120) % 12;
  const antarStart = maha.startMs + antarIdx * sub;
  const strip = ({ startMs: _s, endMs: _e, ...rest }: (typeof sequence)[number]): CharaPeriod => rest;

  return {
    school: "Jaimini Chara dasha (odd/even Lagna direction, stronger lord for Scorpio and Aquarius)",
    direction: direct ? "direct" : "reverse",
    mahadasha: strip(maha),
    antardasha: {
      sign: SIGNS[antarSign],
      signIndex: antarSign,
      years: parseFloat((sub / DASHA_YEAR_MS).toFixed(4)),
      startDate: dateOnly(antarStart),
      endDate: dateOnly(antarStart + sub),
    },
    sequence: sequence.map(strip),
    notes: [
      "Schools differ on the direction rule, the starting sign of antardashas and the second cycle; this is one common convention.",
      "A dasha year is 365.25 days.",
    ],
  };
}

/** Jaimini sign aspect: movable signs aspect fixed signs except the adjacent one, fixed aspect movable except adjacent, dual aspect other duals. */
export function signAspects(from: number, to: number): boolean {
  if (from === to) return false;
  const kind = (i: number) => i % 3; // 0 movable, 1 fixed, 2 dual
  const adjacent = (from + 1) % 12 === to || (to + 1) % 12 === from;
  if (kind(from) === 0) return kind(to) === 1 && !adjacent;
  if (kind(from) === 1) return kind(to) === 0 && !adjacent;
  return kind(to) === 2;
}
