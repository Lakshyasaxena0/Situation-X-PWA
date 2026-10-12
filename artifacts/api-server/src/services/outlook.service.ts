// The ASTRO module's answer in plain terms: "Will it happen?" (a chance in %) and, if so, "by when?"
//
// 1. The chance comes from the whole Prashna score (prashna.service.ts), not from a single sign.
// 2. A GATE comes first: if the chart shows low chance, no date is promised (a date for something the
//    chart does not support would only mislead).
// 3. Timing (classical horary rule): the Moon's next contact with a planet that stands for the matter
//    (lagna lord, lord of the question's house, natural significator) is measured in degrees; the sign the
//    Moon is in decides the unit: movable = days, dual = weeks, fixed = months.
//    For time questions the running/next Vimshottari antardasha of a significator is shown as a cross-check.

import type { IntentType } from "./ajit.service.js";
import type { PrashnaSky } from "./vedic.service.js";
import { lordOf, moonProfile, viewOf } from "./jyotish.service.js";
import { houseProfile, type PrashnaReading } from "./prashna.service.js";
import { vimshottariAt } from "./dasha.service.js";

export type AnticipatedTiming = {
  /** Short, readable: "about 12 days", "about 3 weeks", "about 4 months". */
  text: string;
  /** Window as dates (YYYY-MM-DD). */
  from: string;
  to: string;
  confidence: "low" | "medium" | "high";
  /** Why this timing (plain words). */
  basis: string;
  /** Vimshottari cross-check (only for time questions). */
  dashaCheck?: string;
};

export type Outlook = {
  /** Chance that the matter happens, 5-95. */
  chance: number;
  level: "high" | "fair" | "low";
  /** One line. */
  headline: string;
  /** What the chart shows in favour / against, short points. */
  favours: string[];
  against: string[];
  /** Null when the gate stopped it or the chart gives no contact to measure. */
  timing: AnticipatedTiming | null;
  /** Said when no timing is given, and why. */
  timingNote: string | null;
};

const MOVABLE = new Set([0, 3, 6, 9]);
const FIXED = new Set([1, 4, 7, 10]);
const GATE = 35;

export function chanceFromScore(score: number): number {
  const p = 100 / (1 + Math.exp(-score / 20));
  return Math.round(Math.max(5, Math.min(95, p)));
}

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().split("T")[0];

function unitFor(signIdx: number): { unit: "day" | "week" | "month"; days: number } {
  if (MOVABLE.has(signIdx)) return { unit: "day", days: 1 };
  if (FIXED.has(signIdx)) return { unit: "month", days: 30.44 };
  return { unit: "week", days: 7 };
}

function phrase(value: number, unit: "day" | "week" | "month"): string {
  const v = Math.max(1, Math.round(value));
  if (unit === "month" && v >= 12) {
    const y = Math.round((v / 12) * 2) / 2;
    return `about ${y} year${y === 1 ? "" : "s"}`;
  }
  return `about ${v} ${unit}${v === 1 ? "" : "s"}`;
}

/** First Vimshottari antardasha (now or within ~3 years) ruled by one of the planets that stand for the matter. */
function dashaCheck(moonLon: number, at: Date, planets: string[]): string | undefined {
  const now = vimshottariAt(moonLon, at, at).antardasha;
  if (planets.includes(now.planet)) return `${now.planet} period (supports this matter) is running now, until ${now.endDate}.`;
  for (let d = 10; d <= 3 * 365; d += 10) {
    const a = vimshottariAt(moonLon, at, new Date(at.getTime() + d * DAY)).antardasha;
    if (planets.includes(a.planet)) return `Next supportive period: ${a.planet} from ${a.startDate} to ${a.endDate}.`;
  }
  return "No supportive period begins within the next 3 years, so a long wait is possible.";
}

export function buildOutlook(intent: IntentType, sky: PrashnaSky, reading: PrashnaReading, options: { text?: string; at: Date; timeBased: boolean }): Outlook {
  const chance = chanceFromScore(reading.score);
  const level: Outlook["level"] = chance >= 62 ? "high" : chance >= GATE + 10 ? "fair" : "low";

  const real = reading.factors.filter((f) => f.label !== "Scale centering");
  const favours = real.filter((f) => f.effect > 0).sort((a, b) => b.effect - a.effect).slice(0, 3).map((f) => f.detail);
  const against = real.filter((f) => f.effect < 0).sort((a, b) => a.effect - b.effect).slice(0, 3).map((f) => f.detail);

  const headline =
    level === "high" ? `Chart shows good chances (about ${chance}%).` :
    level === "fair" ? `Chart shows a fair, not certain chance (about ${chance}%).` :
    `Chart shows low chances right now (about ${chance}%).`;

  // Gate: no date for something the chart does not support.
  if (chance < GATE) {
    return {
      chance, level, headline, favours, against, timing: null,
      timingNote: "The chart does not support this strongly, so no date is given. Ask again after some days, or change the plan and ask again.",
    };
  }

  const view = viewOf(sky);
  const moon = moonProfile(view);
  const prof = houseProfile(intent, options.text ?? "");
  const lagnaLord = lordOf(view, 1);
  const qLord = lordOf(view, prof.primaryHouse);
  const sig = new Set<string>([lagnaLord, qLord, ...prof.karakas]);

  const dasha = options.timeBased
    ? dashaCheck(view.p.Moon.lon, options.at, [...new Set([qLord, ...prof.karakas.slice(0, 1)])])
    : undefined;

  const hit = moon.next.find((x) => sig.has(x.planet));
  if (!hit || moon.voidOfCourse) {
    return {
      chance, level, headline, favours, against, timing: null,
      timingNote: moon.voidOfCourse
        ? "The Moon makes no contact before leaving its sign, so the chart gives no clear date. " + (dasha ?? "")
        : "The Moon meets none of the planets of this matter soon, so the chart gives no clear date. " + (dasha ?? ""),
    };
  }

  const { unit, days } = unitFor(view.p.Moon.sign);
  const value = Math.max(0.5, hit.degrees);
  const midDays = value * days;
  const lowDays = Math.max(1, midDays * 0.75);
  const highDays = Math.max(lowDays + 1, midDays * 1.25);
  const kindWord = hit.aspect === "conjunction" ? "joins" : `makes a ${hit.aspect} to`;
  const confidence: AnticipatedTiming["confidence"] = chance >= 62 && hit.degrees <= 20 ? "medium" : "low";
  const t = options.at.getTime();

  return {
    chance, level, headline, favours, against,
    timing: {
      text: phrase(value, unit),
      from: iso(t + lowDays * DAY),
      to: iso(t + highDays * DAY),
      confidence,
      basis: `The Moon (in a ${unit === "day" ? "movable" : unit === "month" ? "fixed" : "dual"} sign, so counted in ${unit}s) ${kindWord} ${hit.planet} in ${hit.degrees}°.`,
      dashaCheck: dasha,
    },
    timingNote: null,
  };
}
