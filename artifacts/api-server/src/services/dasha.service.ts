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
//   - Chara dasha (Jaimini), the Jaimini Upadesa / K.N. Rao convention:
//       * Order of the Mahadashas: from the Lagna, direct for Aries, Leo, Virgo, Libra, Aquarius and
//         Pisces lagnas, reverse for Taurus, Gemini, Cancer, Scorpio, Sagittarius and Capricorn.
//       * A sign's years = signs counted from it to its lord, minus one; counted forward from
//         Aries/Taurus/Gemini/Libra/Scorpio/Sagittarius, backward from the other six; a lord in its
//         own sign gives 12.
//       * Scorpio (Mars & Ketu) and Aquarius (Saturn & Rahu): if one of the two sits in the sign, the
//         OTHER one is used; if both sit in it, 12 years; if neither, the stronger one.
//       * Exaltation / debilitation of the lord (+1 / -1 year) is taught by some schools and is OFF by
//         default; `exaltationAdjustment: true` switches it on.
//       * Antardashas: the 12 signs, each 1/12 of the Mahadasha, counted in the direction of the
//         Mahadasha sign itself (forward for Aries/Taurus/Gemini/Libra/Scorpio/Sagittarius, backward
//         for the rest), starting from the next sign in that direction; the dasha sign is last.
//       * Only the first cycle of 12 Mahadashas is computed.
//     These rules were checked against a published worked example (Gemini lagna) in the tests, not
//     against JHora itself.

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

/** Aries, Leo, Virgo, Libra, Aquarius and Pisces lagnas run their Mahadashas forward; the other six backward. */
const LAGNA_RUNS_FORWARD = [true, false, false, false, true, true, true, false, false, false, true, true];

/** Which of two lords is stronger when neither sits in the sign: more planets with it, then higher degree. */
function strongerLord(classical: string, coLord: string, lon: Record<string, number>): string {
  const companions = (p: string) =>
    Object.keys(lon).filter((q) => q !== p && signOf(lon[q]) === signOf(lon[p])).length;
  if (companions(classical) !== companions(coLord)) return companions(classical) > companions(coLord) ? classical : coLord;
  const deg = (p: string) => ((lon[p] % 30) + 30) % 30;
  if (Math.abs(deg(classical) - deg(coLord)) > 1e-9) return deg(classical) > deg(coLord) ? classical : coLord;
  return classical;
}

const EXALTATION_SIGN: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };

/** The lord whose position sets the years, or "both" when both lords of Scorpio / Aquarius sit in the sign (12 years). */
function charaLordOf(signIndex: number, lon: Record<string, number>): string {
  const classical = CLASSICAL_LORDS[signIndex];
  const coLord = signIndex === 7 ? "Ketu" : signIndex === 10 ? "Rahu" : null;
  if (!coLord || lon[coLord] === undefined) return classical;
  const here = (p: string) => signOf(lon[p]) === signIndex;
  if (here(classical) && here(coLord)) return "both";
  if (here(classical)) return coLord;
  if (here(coLord)) return classical;
  return strongerLord(classical, coLord, lon);
}

export function charaSignYears(signIndex: number, lon: Record<string, number>, exaltationAdjustment = false): number {
  const lord = charaLordOf(signIndex, lon);
  if (lord === "both") return 12;
  const lordSign = signOf(lon[lord]);
  const steps = COUNTS_FORWARD[signIndex] ? (lordSign - signIndex + 12) % 12 : (signIndex - lordSign + 12) % 12;
  let years = steps === 0 ? 12 : steps;
  if (exaltationAdjustment && lord in EXALTATION_SIGN) {
    if (lordSign === EXALTATION_SIGN[lord]) years += 1;
    else if (lordSign === (EXALTATION_SIGN[lord] + 6) % 12) years -= 1;
  }
  return Math.max(1, years);
}

export function charaDashaAt(input: CharaInput, birth: Date, at: Date, options: { exaltationAdjustment?: boolean } = {}): CharaDasha | null {
  const lagna = signOf(input.lagnaLongitude);
  const direct = LAGNA_RUNS_FORWARD[lagna];
  const step = direct ? 1 : -1;
  const signAt = (i: number) => (lagna + step * i + 120) % 12;

  const sequence: (CharaPeriod & { startMs: number; endMs: number })[] = [];
  let cursor = birth.getTime();
  for (let i = 0; i < 12; i++) {
    const idx = signAt(i);
    const years = charaSignYears(idx, input.longitudes, options.exaltationAdjustment);
    const endMs = cursor + years * DASHA_YEAR_MS;
    sequence.push({ sign: SIGNS[idx], signIndex: idx, years, startDate: dateOnly(cursor), endDate: dateOnly(endMs), startMs: cursor, endMs });
    cursor = endMs;
  }
  const t = at.getTime();
  const maha = sequence.find((p) => t >= p.startMs && t < p.endMs);
  if (!maha) return null; // beyond the first cycle: not computed

  const sub = (maha.endMs - maha.startMs) / 12;
  const antarIdx = Math.min(11, Math.floor((t - maha.startMs) / sub));
  // Sub-periods run in the direction of the dasha sign itself, from the next sign; the dasha sign is last.
  const antarStep = COUNTS_FORWARD[maha.signIndex] ? 1 : -1;
  const antarSign = (maha.signIndex + antarStep * (antarIdx + 1) + 120) % 12;
  const antarStart = maha.startMs + antarIdx * sub;
  const strip = ({ startMs: _s, endMs: _e, ...rest }: (typeof sequence)[number]): CharaPeriod => rest;

  return {
    school: "Jaimini Chara dasha (Jaimini Upadesa / K.N. Rao convention; no exaltation adjustment)",
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
      "Schools differ on the direction rule, exaltation adjustments, the starting sign of antardashas and the second cycle; this is one common convention, checked against a published worked example and not against JHora itself.",
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
