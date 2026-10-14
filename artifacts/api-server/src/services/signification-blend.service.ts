// Blends what a HOUSE, a PLANET and a SIGN stand for, for the themes the person actually asked about.
//
//   1. Each theme found in the question (job, marriage, property, foreign ... or, if none, the kind of
//      question) is read house by house: the lord of each of its houses, the strength of the house, the
//      planets in it, and its natural significators (karakas). Houses shared by two themes count more
//      (the overlap); the first house of a theme counts most.
//   2. The three meanings of every key planet are joined in one line: the planet (what it stands for),
//      the house it goes to (what that house stands for) and the sign it sits in (how it acts).
//
// Both feed the score (modestly) and are shown as short points.

import { RASHI_NAMES, SIGN_RULERS } from "./vedic.service.js";
import type { BodyName } from "./ephemeris.service.js";
import {
  aspectsOnHouse,
  inMrityuBhaga,
  isBenefic,
  isGraha,
  lordOf,
  occupantsOf,
  ordinal,
  type BhavaBala,
  type Graha,
  type ShadbalaRow,
  type SkyView,
} from "./jyotish.service.js";
import { HOUSE_SIGNIFICATIONS, PLANET_KARAKATVA, SIGN_KARAKATVA } from "./significations.js";

export type ThemeData = { id: string; label: string; houses: number[]; karakas: string[] };
export type BlendInput = {
  themes: ThemeData[];
  /** Houses shared by two or more themes. */
  coreHouses: number[];
  primaryHouse: number;
  strength?: { sb: Record<Graha, ShadbalaRow>; bb: Record<number, BhavaBala> };
};

export type ThemeReading = { id: string; label: string; score: number; level: "supportive" | "mixed" | "hard"; points: string[] };

const DUSTHANA = [6, 8, 12];
const UPACHAYA = [3, 6, 10, 11];
const GOOD_FOR_NORMAL = [1, 4, 5, 7, 9, 10, 11];
const GOOD_FOR_DUSTHANA = [1, 3, 5, 6, 9, 10, 11];

const first = (text: string | undefined, n: number) => (text ?? "").split(",").slice(0, n).join(",").trim();
const signTraits = (i: number) => first((SIGN_KARAKATVA[i] ?? "").split(":")[1], 3);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

type Power = { strong: boolean; weak: boolean };
function power(view: SkyView, n: BodyName, st?: BlendInput["strength"]): Power {
  const s = view.p[n];
  const level = st && isGraha(n) ? st.sb[n].level : "adequate";
  const weak = level === "weak" || s.dignity === "debilitated" || s.combust || inMrityuBhaga(view, n) || DUSTHANA.includes(s.house);
  const strong = !weak && (level === "strong" || s.dignity === "exalted" || s.dignity === "own");
  return { strong, weak };
}

/** One theme read house by house; score from -1 (hard) to +1 (supportive). */
function readTheme(view: SkyView, t: ThemeData, input: BlendInput): ThemeReading {
  const st = input.strength;
  let total = 0;
  let weights = 0;
  const points: string[] = [];
  t.houses.forEach((h, i) => {
    const w = (i === 0 ? 1 : 0.6) * (input.coreHouses.includes(h) ? 1.5 : 1);
    const lord = lordOf(view, h) as BodyName;
    const ls = view.p[lord];
    const good = (DUSTHANA.includes(h) ? GOOD_FOR_DUSTHANA : GOOD_FOR_NORMAL).includes(ls.house);
    const bad = !DUSTHANA.includes(h) && DUSTHANA.includes(ls.house);
    let v = good ? 0.6 : bad ? -0.7 : 0;
    const pw = power(view, lord, st);
    v += pw.strong ? 0.4 : pw.weak ? -0.3 : 0;
    const bb = st?.bb[h];
    if (bb) v += bb.level === "strong" ? 0.4 : bb.level === "weak" ? -0.4 : 0;
    const occ = occupantsOf(view, h).filter((o) => o !== lord);
    for (const o of occ) v += isBenefic(view, o) ? 0.25 : UPACHAYA.includes(h) ? 0.1 : -0.3;
    const aspBen = aspectsOnHouse(view, h).filter((o) => isBenefic(view, o)).length;
    const aspMal = aspectsOnHouse(view, h).filter((o) => !isBenefic(view, o)).length;
    v += Math.max(-0.4, Math.min(0.4, aspBen * 0.15 - aspMal * 0.15));
    v = Math.max(-1.5, Math.min(1.5, v));
    total += v * w;
    weights += w * 1.5;
    points.push(
      `${ordinal(h)} house (${first(HOUSE_SIGNIFICATIONS[h], 2)}${input.coreHouses.includes(h) ? "; shared by your themes, so it counts more" : ""}): lord ${lord} is in the ${ordinal(ls.house)}${pw.strong ? ", strong" : pw.weak ? ", weak" : ""}${bb ? `; house strength ${bb.level}` : ""} → ${v >= 0.4 ? "helps" : v <= -0.3 ? "holds back" : "neutral"}.`,
    );
  });
  t.karakas.slice(0, 2).forEach((k) => {
    if (!(k in view.p)) return;
    const pw = power(view, k as BodyName, st);
    const v = pw.strong ? 0.5 : pw.weak ? -0.5 : 0;
    total += v * 0.8;
    weights += 0.8 * 1.5;
    points.push(`${k} (${first(PLANET_KARAKATVA[k], 2)}) is the natural significator: ${pw.strong ? "strong, so it helps" : pw.weak ? "weak, so it gives less" : "average"}.`);
  });
  const score = weights ? Math.max(-1, Math.min(1, total / weights * 1.6)) : 0;
  const level: ThemeReading["level"] = score >= 0.25 ? "supportive" : score <= -0.25 ? "hard" : "mixed";
  return { id: t.id, label: t.label, score: Math.round(score * 100) / 100, level, points };
}

export function readThemes(view: SkyView, input: BlendInput): ThemeReading[] {
  return input.themes.map((t) => readTheme(view, t, input));
}

/** The meaning of a planet, a house and a sign joined for one planet. */
export function blendLines(view: SkyView, input: BlendInput, extra: BodyName[] = []): string[] {
  const lagnaLord = lordOf(view, 1) as BodyName;
  const qLord = lordOf(view, input.primaryHouse) as BodyName;
  const coreLords = input.coreHouses.filter((h) => h !== input.primaryHouse && h !== 1).map((h) => lordOf(view, h) as BodyName);
  const karaka = input.themes[0]?.karakas[0] as BodyName | undefined;
  const planets = [...new Set<BodyName>([qLord, lagnaLord, ...coreLords, ...(karaka ? [karaka] : []), ...extra])].filter((n) => n in view.p).slice(0, 6);
  const wanted = new Set(input.themes.flatMap((t) => t.houses));
  return planets.map((n) => {
    const s = view.p[n];
    const p = power(view, n, input.strength);
    const roles: string[] = [];
    if (n === lagnaLord) roles.push("you");
    if (n === qLord) roles.push(`the ${ordinal(input.primaryHouse)}`);
    for (const h of input.coreHouses) if (lordOf(view, h) === n && h !== input.primaryHouse && h !== 1) roles.push(`the ${ordinal(h)}`);
    if (input.themes.some((t) => t.karakas.includes(n))) roles.push("a natural significator");
    const touches = input.themes.filter((t) => t.houses.includes(s.house));
    const link = touches.length
      ? `The house it goes to belongs to your question (${list(touches.map((t) => t.label))}), so the result comes through it.`
      : wanted.has(s.house) ? "" : `That house is not a main house of your question, so it is an indirect route.`;
    return (
      `${n}${roles.length ? ` (${list(roles)})` : ""}: ${first(PLANET_KARAKATVA[n], 3)} → works through the ${ordinal(s.house)} house (${first(HOUSE_SIGNIFICATIONS[s.house], 3)}) → in a ${RASHI_NAMES[s.sign]} way (${signTraits(s.sign)}). ` +
      `${p.strong ? "Strong, so this comes easily." : p.weak ? "Weak, so this comes with effort or delay." : "Average strength."} ${link}`
    ).trim();
  });
}

export type BlendEffect = { family: "house" | "karaka"; label: string; effect: number; detail: string };

/** Modest score effects: the first theme counts fully, the others a little less. */
export function themeFactors(readings: ThemeReading[]): BlendEffect[] {
  return readings.map((r, i) => ({
    family: "house" as const,
    label: `Theme: ${r.label}`,
    effect: Math.round(r.score * 7 * (i === 0 ? 1 : 0.7) * 10) / 10,
    detail: `For "${r.label}" the houses, lords and significators together look ${r.level}`,
  })).filter((f) => f.effect !== 0);
}
