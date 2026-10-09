// Prashna (horary) reading.
//
// The chart is cast for the moment of the question (no birth details). AJIT's intent decides the
// main house and the divisional charts; the words of the question refine that (significations.ts:
// "job abroad" adds the 12th, "marriage" the 7th and the Navamsa, "children" the 5th and D7, and so on).
//
// Everything below is weighed internally; only the ascendant, the verdict and a short list of
// the strongest reasons are ever shown:
//   D1, D3, D4, D7, D9, D10, D12 (the ones the question needs), retrograde motion, graha aspects,
//   natural + temporal friendship, shadbala, bhava bala, the hora of the question, karakatva of
//   planets and signs, where the concerned lord sits (1/4/10, 2/12, 6/8 ...), combustion, the Moon's
//   profile and the lagna lord's profile.
//
// Every factor that moves the score is recorded with a plain-language reason and a FAMILY. Families are
// what the feedback loop can re-weigh (astro-tuning.service.ts); the weights cannot go outside a small band.

import type { IntentType } from "./ajit.service.js";
import { castPrashnaCharts, RASHI_NAMES, type Dignity, type PrashnaSky, type VedicChart } from "./vedic.service.js";
import {
  GRAHAS,
  aspectsOnHouse,
  bhavaBala,
  compoundRelation,
  conditionNotes,
  horaOf,
  isBenefic,
  isGraha,
  lagnaProfile,
  lordOf,
  moonProfile,
  nakshatraOf,
  occupantsOf,
  ordinal,
  pairRelation,
  shadbala,
  viewOf,
  type BhavaBala,
  type Graha,
  type HoraInfo,
  type LagnaProfile,
  type MoonProfile,
  type ShadbalaRow,
  type SkyView,
} from "./jyotish.service.js";
import { HOUSE_SIGNIFICATIONS, PLANET_KARAKATVA, SIGN_KARAKATVA, detectFocus, type DivisionalUse, type Focus } from "./significations.js";
import type { BodyName } from "./ephemeris.service.js";

export type FactorFamily = "lagna" | "moon" | "house" | "karaka" | "divisional" | "aspects" | "relations" | "strength" | "hora" | "condition";
export const FACTOR_FAMILIES: FactorFamily[] = ["lagna", "moon", "house", "karaka", "divisional", "aspects", "relations", "strength", "hora", "condition"];

export type PrashnaFactor = { label: string; effect: number; detail: string; family: FactorFamily };

export type PrashnaChartUse = { chart: string; purpose: string; note: string };

export type PrashnaReading = {
  castAt: string;
  latitude: number;
  longitude: number;
  lagna: string;
  lagnaDegree: number;
  lagnaLord: string;
  moonSign: string;
  moonNakshatra: string;
  moonWaxing: boolean;
  topic: string;
  primaryHouse: number;
  chartsUsed: PrashnaChartUse[];
  factors: PrashnaFactor[];
  score: number;
  signal: "favorable" | "challenging" | "neutral";
  stability: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  dominantPlanet: string;
  summary: string;
  /** The themes found in the question and the houses weighed (not a chart). */
  focus: { themes: string[]; houses: number[] };
  /** Which learned weighting was applied (null = the built-in weights). */
  tuningId: number | null;
  /** Everything the reading looked at, written for the AI. Never sent to the person. */
  dossier: string[];
};

export type Tuning = { id: number | null; multipliers: Partial<Record<FactorFamily, number>>; astroShare?: number };
export const NO_TUNING: Tuning = { id: null, multipliers: {} };

export type ReadOptions = { text?: string; tuning?: Tuning };

type Profile = {
  topic: string;
  primaryHouse: number;
  supportHouses: number[];
  karakas: string[];
  divisional: DivisionalUse[];
  /** Houses in which the lord of the question-house is well placed for THIS topic. */
  goodLordHouses: number[];
};

const STANDARD_GOOD_HOUSES = [1, 4, 5, 7, 9, 10, 11];
const CONFLICT_GOOD_HOUSES = [1, 3, 5, 6, 9, 10, 11];

const PROFILES: Record<IntentType, Profile> = {
  career: { topic: "Career & status", primaryHouse: 10, supportHouses: [6, 11], karakas: ["Saturn", "Sun"], divisional: [{ chart: "D10", house: 10, purpose: "Profession & achievement" }], goodLordHouses: STANDARD_GOOD_HOUSES },
  relationship: { topic: "Relationship & partnership", primaryHouse: 7, supportHouses: [5, 11], karakas: ["Venus", "Jupiter"], divisional: [{ chart: "D9", house: 7, purpose: "Partnership & marriage" }], goodLordHouses: STANDARD_GOOD_HOUSES },
  decision: {
    topic: "Decision & judgment", primaryHouse: 1, supportHouses: [5, 9], karakas: ["Mercury", "Jupiter"],
    divisional: [{ chart: "D3", house: 3, purpose: "Courage & effort to act" }, { chart: "D9", house: 9, purpose: "Fortune behind the choice" }],
    goodLordHouses: STANDARD_GOOD_HOUSES,
  },
  conflict: { topic: "Conflict & opponents", primaryHouse: 6, supportHouses: [7, 3], karakas: ["Mars"], divisional: [{ chart: "D3", house: 3, purpose: "Courage, effort & allies" }], goodLordHouses: CONFLICT_GOOD_HOUSES },
  health: { topic: "Health & vitality", primaryHouse: 1, supportHouses: [6, 8], karakas: ["Sun", "Moon"], divisional: [{ chart: "D9", house: 1, purpose: "Inner vitality & resilience" }], goodLordHouses: STANDARD_GOOD_HOUSES },
  unclear: { topic: "General outlook", primaryHouse: 1, supportHouses: [10, 11], karakas: ["Moon"], divisional: [{ chart: "D9", house: 1, purpose: "Overall strength" }], goodLordHouses: STANDARD_GOOD_HOUSES },
};

/** The house, topic and natural significators used for a kind of question (also used for dasha timing). */
export function houseProfile(intent: IntentType, text = ""): { topic: string; primaryHouse: number; karakas: string[] } {
  const c = configFor(intent, text);
  return { topic: c.topic, primaryHouse: c.primaryHouse, karakas: c.karakas };
}

/** Score at or above this is favorable, at or below its negative is challenging (after scaling). */
export const SIGNAL_THRESHOLD = 8;
/** The standard deviation the reading is scaled to, so a third of all skies read favorable / neutral / challenging. */
const TARGET_SIGMA = 18;

type Config = {
  intent: IntentType;
  topic: string;
  primaryHouse: number;
  supportHouses: number[];
  karakas: string[];
  vargas: DivisionalUse[];
  goodLordHouses: number[];
  focus: Focus;
};

function configFor(intent: IntentType, text: string): Config {
  const base = PROFILES[intent] ?? PROFILES.unclear;
  const focus = detectFocus(text, intent);
  if (focus.themes.length === 0) {
    return { intent, topic: base.topic, primaryHouse: base.primaryHouse, supportHouses: base.supportHouses, karakas: base.karakas, vargas: base.divisional, goodLordHouses: base.goodLordHouses, focus };
  }
  const primaryHouse = focus.primaryHouse ?? base.primaryHouse;
  const supports = [...new Set([...focus.houses, ...base.supportHouses])].filter((h) => h !== primaryHouse && h !== 1).slice(0, 4);
  const vargas = [...base.divisional];
  for (const v of focus.vargas) if (!vargas.some((x) => x.chart === v.chart)) vargas.push(v);
  return {
    intent,
    topic: `${base.topic} (${focus.themes.map((t) => t.label).join(", ")})`,
    primaryHouse,
    supportHouses: supports,
    karakas: [...new Set([...focus.karakas, ...base.karakas])].slice(0, 4),
    vargas: vargas.slice(0, 4),
    goodLordHouses: intent === "conflict" || focus.themes.some((t) => t.id === "legal") ? CONFLICT_GOOD_HOUSES : STANDARD_GOOD_HOUSES,
    focus,
  };
}

const DUSTHANA = new Set([6, 8, 12]);
const UPACHAYA = new Set([3, 6, 10, 11]);
const NATURAL_BENEFICS = new Set(["Jupiter", "Venus", "Mercury"]);
const NATURAL_MALEFICS = new Set(["Saturn", "Mars", "Sun", "Rahu", "Ketu"]);

// ---------------------------------------------------------------- per-sky facts (computed once)

type Derived = { view: SkyView; sb: Record<Graha, ShadbalaRow>; hora: HoraInfo; moon: MoonProfile; lagna: LagnaProfile; bb: Record<number, BhavaBala> };
const derivedCache = new WeakMap<PrashnaSky, Derived>();

function deriveFrom(sky: PrashnaSky): Derived {
  const hit = derivedCache.get(sky);
  if (hit) return hit;
  const view = viewOf(sky);
  const sb = shadbala(view);
  const bb: Record<number, BhavaBala> = {};
  for (let h = 1; h <= 12; h++) bb[h] = bhavaBala(view, sb, h);
  const d: Derived = { view, sb, hora: horaOf(sky), moon: moonProfile(view), lagna: lagnaProfile(view), bb };
  derivedCache.set(sky, d);
  return d;
}

const chartOf = (sky: PrashnaSky, name: string): VedicChart => (sky.charts as Record<string, VedicChart>)[name.toLowerCase()];
const lordInChart = (chart: VedicChart, house: number): string => {
  const signIdx = (RASHI_NAMES.indexOf(chart.ascendant) + house - 1) % 12;
  return ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"][signIdx];
};
const planetIn = (chart: VedicChart, name: string) => chart.planets.find((p) => p.name === name)!;
const dignityScore = (d: Dignity, weight: number) => (d === "exalted" || d === "own" ? weight : d === "debilitated" ? -weight : 0);

// ---------------------------------------------------------------- the factors

type Collector = { factors: PrashnaFactor[]; add: (family: FactorFamily, label: string, effect: number, detail: string) => void };
function collector(): Collector {
  const factors: PrashnaFactor[] = [];
  return {
    factors,
    add(family, label, effect, detail) {
      if (effect !== 0) factors.push({ family, label, effect: Math.round(effect * 10) / 10, detail });
    },
  };
}

function scoreHouseIn(c: Collector, chart: VedicChart, house: number, goodHouses: number[], weight: number, label: string, family: FactorFamily): void {
  const lordName = lordInChart(chart, house);
  const lord = planetIn(chart, lordName);
  const where = `${chart.chartType} ${ordinal(house)} lord ${lordName}`;
  if (goodHouses.includes(lord.house)) c.add(family, label, 8 * weight, `${where} sits in the ${ordinal(lord.house)} house (supportive)`);
  else if (DUSTHANA.has(lord.house)) c.add(family, label, -10 * weight, `${where} sits in the ${ordinal(lord.house)} house (a difficult house)`);
  const dig = dignityScore(lord.dignity, 5 * weight);
  if (dig !== 0) c.add(family, label, dig, `${where} is ${lord.dignity} in ${lord.sign}`);
  for (const occ of chart.planets.filter((p) => p.house === house && p.name !== lordName && p.name !== "Moon")) {
    if (NATURAL_BENEFICS.has(occ.name)) c.add(family, label, 5 * weight, `${occ.name} (benefic) occupies the ${ordinal(house)} house in ${chart.chartType}`);
    else if (NATURAL_MALEFICS.has(occ.name)) {
      if (UPACHAYA.has(house)) c.add(family, label, 3 * weight, `${occ.name} occupies the ${ordinal(house)} house, a house where it gives drive`);
      else c.add(family, label, -5 * weight, `${occ.name} (malefic) occupies the ${ordinal(house)} house in ${chart.chartType}`);
    }
  }
}

const levelPts = (sb: ShadbalaRow, strong: number, weak: number) => (sb.level === "strong" ? strong : sb.level === "weak" ? weak : 0);

/** Every factor for one sky and one question configuration (before tuning and scaling). */
function evaluate(sky: PrashnaSky, cfg: Config): { factors: PrashnaFactor[]; querent: number; moon: number } {
  const { view, sb, hora, moon, lagna, bb } = deriveFrom(sky);
  const c = collector();
  const d1 = sky.charts.d1;
  const lagnaLord = lordOf(view, 1);
  const qLord = lordOf(view, cfg.primaryHouse);
  const qLordS = view.p[qLord];
  const lagnaLordS = view.p[lagnaLord];

  // 1. The querent: lagna and its lord.
  const q0 = c.factors.length;
  if (cfg.primaryHouse !== 1) scoreHouseIn(c, d1, 1, STANDARD_GOOD_HOUSES, 0.8, "Querent (lagna)", "lagna");
  c.add("strength", "Querent (lagna)", levelPts(sb[lagnaLord], 3, -3), `Lagna lord ${lagnaLord} has ${sb[lagnaLord].level} shadbala (${sb[lagnaLord].ratio} of the required strength)`);
  if (lagnaLordS.retro) c.add("condition", "Querent (lagna)", -2, `Lagna lord ${lagnaLord} is retrograde (hesitation, second thoughts)`);
  if (lagnaLordS.combust) c.add("condition", "Querent (lagna)", -4, `Lagna lord ${lagnaLord} is combust (too close to the Sun)`);
  if (lagnaLordS.cazimi) c.add("condition", "Querent (lagna)", 3, `Lagna lord ${lagnaLord} is cazimi (in the heart of the Sun)`);
  const onLagna = aspectsOnHouse(view, 1);
  const lagnaAsp = Math.max(-5, Math.min(5, onLagna.reduce((s, n) => s + (isBenefic(view, n) ? 2 : -2), 0)));
  if (onLagna.length) c.add("aspects", "Querent (lagna)", lagnaAsp, `Aspects on the lagna: ${onLagna.map((n) => `${n} (${isBenefic(view, n) ? "benefic" : "malefic"})`).join(", ")}`);
  if (lagna.timing !== "ripe") c.add("lagna", "Querent (lagna)", -2, `Lagna is in ${lagna.timing === "early" ? "its first degree: the matter is not ripe yet" : "its last degree: the matter is ending or already decided"}`);
  const querent = c.factors.slice(q0).reduce((s, f) => s + f.effect, 0);

  // 2. The Moon: the mind of the querent and the pulse of the question.
  const m0 = c.factors.length;
  const m = view.p.Moon;
  c.add("moon", "Moon", sky.moonWaxing ? 4 : -4, sky.moonWaxing ? "Moon is waxing (growing, supportive)" : "Moon is waning (shrinking, less supportive)");
  if (DUSTHANA.has(m.house)) c.add("moon", "Moon", -8, `Moon sits in the ${ordinal(m.house)} house (a difficult house)`);
  else if ([1, 4, 5, 7, 9, 10].includes(m.house)) c.add("moon", "Moon", 5, `Moon sits in the ${ordinal(m.house)} house (supportive)`);
  c.add("moon", "Moon", dignityScore(m.dignity, 4), `Moon is ${m.dignity} in ${m.signName}`);
  const joined = moon.with.filter((n) => NATURAL_MALEFICS.has(n));
  if (joined.length) c.add("moon", "Moon", -4, `Moon is joined by ${joined.join(", ")}`);
  if (moon.rikta) c.add("moon", "Moon", -2, `The tithi is rikta (${moon.tithi}), an empty tithi that does not favour beginnings`);
  c.add("strength", "Moon", levelPts(sb.Moon, 3, -3), `Moon has ${sb.Moon.level} shadbala (${sb.Moon.ratio})`);
  const moonAsp = Math.max(-4, Math.min(4, moon.beneficAspects.length * 2 - moon.maleficAspects.length * 2));
  if (moon.beneficAspects.length + moon.maleficAspects.length) c.add("aspects", "Moon", moonAsp, `Moon is aspected by ${[...moon.beneficAspects.map((n) => `${n} (benefic)`), ...moon.maleficAspects.map((n) => `${n} (malefic)`)].join(", ")}`);
  if (moon.voidOfCourse) c.add("moon", "Moon", -3, "The Moon makes no contact before leaving its sign (void of course): little comes of the matter");
  else {
    const significators = new Set<string>([lagnaLord, qLord, ...cfg.karakas]);
    const hit = moon.next.find((x) => significators.has(x.planet));
    if (hit) {
      const kind = hit.aspect === "conjunction" || hit.aspect === "sextile" || hit.aspect === "trine";
      c.add("moon", "Moon", kind ? 4 : -2, `The Moon next ${hit.aspect === "conjunction" ? "joins" : `makes a ${hit.aspect} to`} ${hit.planet}, a significator of this matter, in ${hit.degrees}° (${kind ? "the matter is likely to connect" : "with friction"})`);
    } else if (moon.next[0] && !isBenefic(view, moon.next[0].planet)) {
      c.add("moon", "Moon", -2, `The Moon's next contact is with ${moon.next[0].planet} (malefic)`);
    }
  }
  const moonScore = c.factors.slice(m0).reduce((s, f) => s + f.effect, 0);

  // 3. The house of the question (D1): lord, occupants, strength, aspects.
  scoreHouseIn(c, d1, cfg.primaryHouse, cfg.goodLordHouses, 1, cfg.topic, "house");
  const bhava = bb[cfg.primaryHouse];
  c.add("strength", cfg.topic, Math.max(-8, Math.min(8, bhava.score * 0.5)), `${ordinal(cfg.primaryHouse)} house bhava bala is ${bhava.level}: ${bhava.notes.slice(0, 3).join("; ")}`);
  if (qLord !== lagnaLord) {
    c.add("strength", cfg.topic, levelPts(sb[qLord], 4, -4), `${qLord} (lord of the ${ordinal(cfg.primaryHouse)}) has ${sb[qLord].level} shadbala (${sb[qLord].ratio})`);
  }
  if (qLordS.retro && !DUSTHANA.has(cfg.primaryHouse)) c.add("condition", cfg.topic, -2, `${qLord} (lord of the ${ordinal(cfg.primaryHouse)}) is retrograde: delays and revisions`);
  if (qLordS.combust) c.add("condition", cfg.topic, -5, `${qLord} (lord of the ${ordinal(cfg.primaryHouse)}) is combust: its results are burnt`);
  if (qLordS.cazimi) c.add("condition", cfg.topic, 3, `${qLord} (lord of the ${ordinal(cfg.primaryHouse)}) is cazimi: strengthened by the Sun`);
  const onQ = aspectsOnHouse(view, qLordS.house).filter((n) => n !== qLord);
  if (onQ.length) {
    c.add("aspects", cfg.topic, Math.max(-6, Math.min(6, onQ.reduce((s, n) => s + (isBenefic(view, n) ? 2.5 : -2.5), 0))), `Aspects on ${qLord}: ${onQ.map((n) => `${n} (${isBenefic(view, n) ? "benefic" : "malefic"})`).join(", ")}`);
  }

  // 4. Supporting houses, lighter.
  for (const h of cfg.supportHouses) scoreHouseIn(c, d1, h, STANDARD_GOOD_HOUSES, 0.4, `${ordinal(h)} house`, "house");

  // 5. How the concerned lord sits with the lagna lord, the Moon and the karaka (1/7, 2/12, 3/11, 4/10, 5/9, 6/8), and friendship.
  if (qLord !== lagnaLord) {
    const pr = pairRelation(view, lagnaLord, qLord);
    c.add("relations", "Querent and the matter", pr.effect * 0.6, `Lagna lord ${lagnaLord} and ${qLord} (lord of the ${ordinal(cfg.primaryHouse)}) are ${pr.meaning}`);
    const f1 = compoundRelation(view, lagnaLord, qLord);
    const f2 = compoundRelation(view, qLord, lagnaLord);
    c.add("relations", "Querent and the matter", (f1.score + f2.score) * 0.75, `${lagnaLord} regards ${qLord} as ${f1.relation}, and ${qLord} regards ${lagnaLord} as ${f2.relation} (natural and temporal friendship)`);
  }
  if (qLord !== "Moon") {
    const pm = pairRelation(view, "Moon", qLord);
    c.add("relations", "Mind and the matter", pm.effect * 0.5, `Moon and ${qLord} are ${pm.meaning}`);
  }
  const fromMoon = ((qLordS.sign - m.sign + 12) % 12) + 1;
  if ([1, 4, 5, 7, 9, 10].includes(fromMoon)) c.add("relations", "Mind and the matter", 2, `${qLord} is in the ${ordinal(fromMoon)} from the Moon (supportive)`);
  else if ([6, 8, 12].includes(fromMoon)) c.add("relations", "Mind and the matter", -2, `${qLord} is in the ${ordinal(fromMoon)} from the Moon (a difficult place)`);

  // 6. Karakas: the natural significators of this kind of question.
  cfg.karakas.forEach((k, i) => {
    const p = view.p[k as BodyName];
    const label = `${k} (significator)`;
    c.add("karaka", label, dignityScore(p.dignity, 6), `${k} is ${p.dignity} in ${p.signName}`);
    if (p.retro && k !== "Rahu" && k !== "Ketu") c.add("condition", label, -3, `${k} is retrograde (delays, second thoughts)`);
    if (p.combust) c.add("condition", label, -4, `${k} is combust (too close to the Sun)`);
    if (p.cazimi) c.add("condition", label, 3, `${k} is cazimi`);
    if (DUSTHANA.has(p.house) && !(cfg.intent === "conflict" && p.house === 6)) c.add("karaka", label, -3, `${k} sits in the ${ordinal(p.house)} house`);
    if (isGraha(k)) c.add("strength", label, levelPts(sb[k], 3, -3), `${k} has ${sb[k].level} shadbala (${sb[k].ratio})`);
    if (i === 0 && qLord !== k) {
      const pk = pairRelation(view, k as BodyName, qLord);
      c.add("relations", label, pk.effect * 0.4, `${k} and ${qLord} are ${pk.meaning}`);
    }
  });

  // 7. Hora of the question.
  const horaLord = hora.horaLord;
  const horaRel = horaLord === qLord ? { relation: "the same planet", score: 2 } : compoundRelation(view, horaLord, qLord);
  const horaPts = horaLord === qLord ? 4 : horaRel.score >= 2 ? 3 : horaRel.score === 1 ? 2 : horaRel.score <= -2 ? -3 : horaRel.score === -1 ? -2 : 0;
  c.add("hora", "Hora of the question", horaPts, `The hora lord is ${horaLord}, ${horaLord === qLord ? `the very planet that rules the ${ordinal(cfg.primaryHouse)} house (the matter is in focus)` : `${horaRel.relation} to ${qLord}, the lord of the ${ordinal(cfg.primaryHouse)}`}`);
  if (horaLord === lagnaLord && horaLord !== qLord) c.add("hora", "Hora of the question", 2, `The hora lord ${horaLord} is also the lagna lord (the querent is at the centre of the matter)`);
  if (cfg.karakas.includes(horaLord) && horaLord !== qLord) c.add("hora", "Hora of the question", 2, `The hora lord ${horaLord} is a natural significator of this matter`);
  if (hora.weekdayLord !== horaLord) {
    const wl = hora.weekdayLord === qLord ? 2 : compoundRelation(view, hora.weekdayLord, qLord).score;
    c.add("hora", "Day lord", Math.max(-2, Math.min(2, wl)) * 0.75, `The day lord is ${hora.weekdayLord} (${hora.weekdayLord === qLord ? "also the lord of the matter" : compoundRelation(view, hora.weekdayLord, qLord).relation + " to " + qLord})`);
  }

  // 8. Divisional charts the question needs.
  for (const use of cfg.vargas) {
    const chart = chartOf(sky, use.chart);
    if (!chart) continue;
    const label = `${use.chart} ${use.purpose}`;
    scoreHouseIn(c, chart, use.house, STANDARD_GOOD_HOUSES, 0.6, label, "divisional");
    const k = cfg.karakas[0];
    if (k) {
      const p = planetIn(chart, k);
      c.add("divisional", label, dignityScore(p.dignity, 4), `${k} is ${p.dignity} in ${use.chart} (${p.sign})`);
    }
    if (use.chart === "D9" && qLordS.vargottama) c.add("divisional", label, 4, `${qLord} is vargottama (same sign in D1 and D9), which greatly strengthens it`);
  }
  return { factors: c.factors, querent, moon: moonScore };
}

// ---------------------------------------------------------------- scaling against typical skies

/** 100 skies across several years, built once (the same ones every run), to measure what a "typical" reading is. */
let referenceSkies: PrashnaSky[] | null = null;
function skies(): PrashnaSky[] {
  if (referenceSkies) return referenceSkies;
  let seed = 20240607;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const start = Date.UTC(2025, 0, 1);
  referenceSkies = Array.from({ length: 100 }, () => castPrashnaCharts(new Date(start + rnd() * 6 * 365.25 * 86400000)));
  return referenceSkies;
}

type Scale = { median: number; k: number };
const scaleCache = new Map<string, Scale>();

function applyTuning(factors: PrashnaFactor[], tuning: Tuning): PrashnaFactor[] {
  return factors.map((f) => ({ ...f, effect: f.effect * (tuning.multipliers[f.family] ?? 1) }));
}

function scaleFor(cfg: Config, tuning: Tuning): Scale {
  const key = [cfg.intent, cfg.primaryHouse, cfg.supportHouses.join(","), cfg.karakas.join(","), cfg.vargas.map((v) => `${v.chart}${v.house}`).join(","), tuning.id ?? "none"].join("|");
  const hit = scaleCache.get(key);
  if (hit) return hit;
  const raws = skies()
    .map((s) => applyTuning(evaluate(s, cfg).factors, tuning).reduce((a, f) => a + f.effect, 0))
    .sort((a, b) => a - b);
  const median = raws[Math.floor(raws.length / 2)];
  const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
  const sigma = Math.sqrt(raws.reduce((a, b) => a + (b - mean) ** 2, 0) / raws.length) || 1;
  const out = { median, k: TARGET_SIGMA / sigma };
  scaleCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- the reading

const strengthLabel = (score: number): "low" | "medium" | "high" => (score >= 8 ? "high" : score <= -8 ? "low" : "medium");

function dossierFor(sky: PrashnaSky, cfg: Config, d: Derived, qLord: Graha, top: PrashnaFactor[]): string[] {
  const { view, sb, hora, moon, lagna, bb } = d;
  const line = (...parts: string[]) => parts.filter(Boolean).join(" ");
  const pl = (n: BodyName) => {
    const s = view.p[n];
    const cond = conditionNotes(view, n);
    return `${n} ${s.signName} ${s.deg.toFixed(1)}° (${ordinal(s.house)} house${cond.length ? ", " + cond.join(", ") : ""})`;
  };
  const lines: string[] = [];
  lines.push(line(`Lagna ${lagna.sign} ${lagna.degree}° (${lagna.element}), ${lagna.note}.`, `Lagna lord ${lagna.lord}: ${pl(lagna.lord)}; shadbala ${sb[lagna.lord].level} (${sb[lagna.lord].ratio}).`));
  lines.push(line(`Focus of the question: ${cfg.topic}; main house ${ordinal(cfg.primaryHouse)} (${view.p.Sun && RASHI_NAMES[(view.ascSign + cfg.primaryHouse - 1) % 12]}), lord ${qLord}: ${pl(qLord)}; shadbala ${sb[qLord].level} (${sb[qLord].ratio}).`, `House stands for: ${HOUSE_SIGNIFICATIONS[cfg.primaryHouse]}.`));
  if (cfg.focus.themes.length) {
    lines.push(`Themes found in the question: ${cfg.focus.themes.map((t) => t.label).join(", ")}. Houses by weight: ${cfg.focus.houses.join(", ")}. Shared by two or more themes (the overlap): ${cfg.focus.coreHouses.length ? cfg.focus.coreHouses.join(", ") : "none"}.`);
  }
  lines.push(`Supporting houses weighed: ${cfg.supportHouses.map((h) => `${ordinal(h)} (${HOUSE_SIGNIFICATIONS[h]})`).join("; ")}.`);
  lines.push(`Significators (karakas): ${cfg.karakas.map((k) => `${k} [${PLANET_KARAKATVA[k]}] ${pl(k as BodyName)}`).join("; ")}.`);
  lines.push(
    line(
      `Moon: ${moon.sign} (${ordinal(moon.house)} house), ${moon.nakshatra} (lord ${moon.nakshatraLord}), tithi ${moon.tithi} ${moon.waxing ? "waxing" : "waning"}${moon.rikta ? " (rikta)" : ""}, ${moon.dignity}, ${moon.pace} pace.`,
      moon.with.length ? `Joined by ${moon.with.join(", ")}.` : "",
      moon.beneficAspects.length || moon.maleficAspects.length ? `Aspected by benefics ${moon.beneficAspects.join(", ") || "none"}, malefics ${moon.maleficAspects.join(", ") || "none"}.` : "",
      moon.voidOfCourse ? "Void of course." : `Next contacts: ${moon.next.map((x) => `${x.aspect} ${x.planet} in ${x.degrees}°`).join("; ")}.`,
    ),
  );
  lines.push(`Hora of the question: ${hora.horaLord} (hora ${hora.horaNumber} of the day, ${hora.isDay ? "daytime" : "night"}); day lord ${hora.weekdayLord}.`);
  lines.push(`Shadbala (virupas; ratio to required): ${GRAHAS.map((g) => `${g} ${sb[g].total} (${sb[g].ratio}, ${sb[g].level})`).join("; ")}. Simplified method.`);
  lines.push(`Bhava bala: ${Object.values(bb).map((b) => `${ordinal(b.house)} ${b.level} (${b.score})`).join("; ")}.`);
  const pairs = [`${lagna.lord}-${qLord}`, `Moon-${qLord}`].filter((x) => x.split("-")[0] !== x.split("-")[1]);
  lines.push(`Placement between planets: ${pairs.map((p) => { const [a, b] = p.split("-"); return `${a} and ${b} are ${pairRelation(view, a as BodyName, b as BodyName).meaning}`; }).join("; ")}.`);
  lines.push(`Planets: ${(["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"] as BodyName[]).map(pl).join("; ")}.`);
  lines.push(`Nature of the main house's sign: ${SIGN_KARAKATVA[(view.ascSign + cfg.primaryHouse - 1) % 12]}.`);
  lines.push(`Divisional charts read: D1${cfg.vargas.map((v) => `, ${v.chart} (${v.purpose})`).join("")}.`);
  lines.push(`Strongest reasons in the score: ${top.map((f) => `${f.effect > 0 ? "+" : ""}${f.effect} ${f.detail}`).join(" | ")}.`);
  return lines;
}

/** Builds the reading from the cast charts. Deterministic for a given sky, question and tuning. */
export function readPrashna(intent: IntentType, sky: PrashnaSky, options: ReadOptions = {}): PrashnaReading {
  const tuning = options.tuning ?? NO_TUNING;
  const cfg = configFor(intent, options.text ?? "");
  const d = deriveFrom(sky);
  const { view, moon, lagna } = d;
  const ev = evaluate(sky, cfg);
  const scale = scaleFor(cfg, tuning);

  const tuned = applyTuning(ev.factors, tuning);
  const factors: PrashnaFactor[] = tuned.map((f) => ({ ...f, effect: Math.round(f.effect * scale.k * 10) / 10 })).filter((f) => f.effect !== 0);
  factors.push({ family: "house", label: "Scale centering", effect: Math.round(-scale.median * scale.k * 10) / 10, detail: `Scores are measured against a typical sky for ${cfg.topic.toLowerCase()} questions` });
  const raw = factors.reduce((s, f) => s + f.effect, 0);
  const score = Math.round(Math.max(-100, Math.min(100, raw)));
  const signal: PrashnaReading["signal"] = score >= SIGNAL_THRESHOLD ? "favorable" : score <= -SIGNAL_THRESHOLD ? "challenging" : "neutral";
  const stability = strengthLabel((ev.querent + ev.moon) * scale.k);
  const risk: PrashnaReading["risk"] = score >= 16 ? "low" : score <= -SIGNAL_THRESHOLD ? "high" : "medium";
  const qLord = lordOf(view, cfg.primaryHouse);

  const top = factors.filter((f) => f.label !== "Scale centering").sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 3);
  const moonNakshatra = nakshatraOf(view.p.Moon.lon);

  const chartsUsed: PrashnaChartUse[] = [
    {
      chart: "D1",
      purpose: "The question itself",
      note: `Lagna ${lagna.sign}, Moon in ${moon.sign}; ${ordinal(cfg.primaryHouse)} house (${occupantsOf(view, cfg.primaryHouse).join(", ") || "empty"}) ruled by ${qLord}`,
    },
    ...cfg.vargas.map((use) => {
      const chart = chartOf(sky, use.chart);
      return { chart: use.chart, purpose: use.purpose, note: chart ? `${use.chart} lagna ${chart.ascendant}; ${ordinal(use.house)} house ruled by ${lordInChart(chart, use.house)}` : "" };
    }),
  ];

  const summary =
    `Prashna chart cast for the moment of your question: lagna ${lagna.sign} ${lagna.degree.toFixed(1)}° (lord ${lagna.lord}), ` +
    `Moon in ${moon.sign} (${moonNakshatra}, ${sky.moonWaxing ? "waxing" : "waning"}). ` +
    `For a ${cfg.topic.toLowerCase()} question the ${ordinal(cfg.primaryHouse)} house and ${cfg.vargas.map((v) => v.chart).join("/") || "D1"} were weighed: ` +
    `${top.map((f) => f.detail).join("; ")}. Overall the chart is ${signal}.`;

  return {
    castAt: sky.castAt.toISOString(),
    latitude: sky.latitude,
    longitude: sky.longitude,
    lagna: lagna.sign,
    lagnaDegree: lagna.degree,
    lagnaLord: lagna.lord,
    moonSign: moon.sign,
    moonNakshatra,
    moonWaxing: sky.moonWaxing,
    topic: cfg.topic,
    primaryHouse: cfg.primaryHouse,
    chartsUsed,
    factors,
    score,
    signal,
    stability,
    risk,
    dominantPlanet: qLord,
    summary,
    focus: { themes: cfg.focus.themes.map((t) => t.label), houses: [cfg.primaryHouse, ...cfg.supportHouses] },
    tuningId: tuning.id,
    dossier: dossierFor(sky, cfg, d, qLord, top),
  };
}

export const PRASHNA_PROFILES = PROFILES;

/** Builds the reference skies and the usual scales ahead of time (called once after the server starts), so the first question is not slow. */
export function warmUpPrashna(): number {
  const t0 = Date.now();
  for (const intent of Object.keys(PROFILES) as IntentType[]) scaleFor(configFor(intent, ""), NO_TUNING);
  return Date.now() - t0;
}
