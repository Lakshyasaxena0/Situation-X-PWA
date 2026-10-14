// Where each key planet "goes" in the Prashna chart, and with whom: the chain a Prashna astrologer follows.
//
//   Lagna (rising sign) -> its lord -> the house, sign and company the lord goes to
//   Moon -> its sign lord and nakshatra lord -> where they go
//   The concerned house -> its sign, occupants, aspects -> its lord -> where it goes, with whom
//   The lords of the 6th, 8th and 12th -> where they go (obstacles, loss, delay) or whether they ease each other
//   Blend: house meaning + sign nature + planet condition in one line
//
// `traceReading` writes it as short plain-language points for the person; `traceFactors` turns the same
// facts into score effects, so the chain moves the verdict as well as explaining it.

import { RASHI_NAMES, SIGN_RULERS, type VedicChart } from "./vedic.service.js";
import type { BodyName } from "./ephemeris.service.js";
import {
  aspectsOnHouse,
  compoundRelation,
  conditionNotes,
  inMrityuBhaga,
  isBenefic,
  isGraha,
  lordOf,
  moonProfile,
  naturalRelation,
  occupantsOf,
  ordinal,
  temporalRelation,
  type BhavaBala,
  type Graha,
  type ShadbalaRow,
  type SkyView,
} from "./jyotish.service.js";
import { vimshottariAt } from "./dasha.service.js";
import { blendLines, readThemes, type BlendInput, type ThemeData } from "./signification-blend.service.js";
import { HOUSE_SIGNIFICATIONS, SIGN_KARAKATVA } from "./significations.js";

export type TraceSection = { title: string; points: string[] };
export type TraceInput = {
  primaryHouse: number;
  supportHouses: number[];
  topic: string;
  karakas: string[];
  /** The themes found in the question (or the kind of question) and the houses they share: used to blend house, planet and sign meanings. */
  themes?: ThemeData[];
  coreHouses?: number[];
  /** The divisional charts to read (D9 is always among them) with the house of the matter in each. */
  vargas?: { chart: string; house: number; purpose: string }[];
  /** Shadbala per planet and bhava bala per house of the same sky (adds the strength to every "goes to" line). */
  strength?: { sb: Record<Graha, ShadbalaRow>; bb: Record<number, BhavaBala> };
};

const SHORT_MEANING = (h: number) => (HOUSE_SIGNIFICATIONS[h] ?? "").split(",").slice(0, 3).join(",").trim();
const signTraits = (signIdx: number) => (SIGN_KARAKATVA[signIdx] ?? "").split(":")[1]?.split(",").slice(0, 3).join(",").trim() ?? "";
const MODALITY = ["movable", "fixed", "dual"] as const;
const ELEMENT = ["fire", "earth", "air", "water"] as const;
const signNature = (i: number) => `${MODALITY[i % 3]}, ${ELEMENT[i % 4]}`;
const DUSTHANAS = [6, 8, 12] as const;
const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

function company(view: SkyView, n: BodyName): { with: BodyName[]; seenBy: BodyName[] } {
  const h = view.p[n].house;
  return { with: occupantsOf(view, h).filter((x) => x !== n), seenBy: aspectsOnHouse(view, h).filter((x) => x !== n) };
}

/** "goes to the 10th (work, status) in Capricorn (friend's sign), with Mars, seen by Jupiter (benefic)". */
function whereItGoes(view: SkyView, n: BodyName, strength?: TraceInput["strength"]): string {
  const s = view.p[n];
  const owner = SIGN_RULERS[s.sign];
  const rel = s.dignity === "own" ? "its own sign" : s.dignity === "exalted" ? "its sign of exaltation" : s.dignity === "debilitated" ? "its sign of fall" : owner === n ? "its own sign" : naturalRelation(n, owner) === 1 ? `a friend's sign (${owner})` : naturalRelation(n, owner) === -1 ? `an enemy's sign (${owner})` : `a neutral sign (${owner})`;
  const c = company(view, n);
  const cond = conditionNotes(view, n).filter((x) => !["exalted", "debilitated", "in its own sign"].includes(x));
  return (
    `goes to the ${ordinal(s.house)} house (${SHORT_MEANING(s.house)}) in ${s.signName}, ${rel}` +
    (cond.length ? `; it is ${cond.join(", ")}` : "") +
    (strength && isGraha(n) ? `; its strength (shadbala) is ${strength.sb[n].level}` : "") +
    (strength ? `; that house is ${strength.bb[s.house].level} in strength (bhava bala)` : "") +
    (c.with.length ? `; with ${list(c.with)}` : "") +
    (c.seenBy.length ? `; seen by ${c.seenBy.map((x) => `${x}${isBenefic(view, x) ? " (benefic)" : " (malefic)"}`).join(", ")}` : "")
  );
}

const exchange = (view: SkyView, a: BodyName, b: BodyName) => a !== b && SIGN_RULERS[view.p[a].sign] === b && SIGN_RULERS[view.p[b].sign] === a;


const VARGA_NAME: Record<string, string> = { D3: "Drekkana (D3)", D4: "Chaturthamsa (D4)", D7: "Saptamsa (D7)", D9: "Navamsa (D9)", D10: "Dasamsa (D10)", D12: "Dwadasamsa (D12)" };
const goodDig = (d: string) => d === "exalted" || d === "own";
const chartLord = (c: VedicChart, house: number) => SIGN_RULERS[(RASHI_NAMES.indexOf(c.ascendant) + house - 1) % 12] as BodyName;

/** One divisional chart read the way a professional does: its own lagna and house, the lords of the D1 chart in it, the significator, and whether it confirms D1. */
function vargaSection(view: SkyView, input: TraceInput, use: { chart: string; house: number; purpose: string }): TraceSection | null {
  const chart = (view.sky.charts as unknown as Record<string, VedicChart>)[use.chart.toLowerCase()];
  if (!chart) return null;
  const lagnaLord = lordOf(view, 1) as BodyName;
  const qLord = lordOf(view, input.primaryHouse) as BodyName;
  const at = (n: string) => chart.planets.find((p) => p.name === n);
  const describe = (n: BodyName, role: string) => {
    const p = at(n);
    return p ? `${role} ${n} is in ${p.sign}, the ${ordinal(p.house)} house of ${use.chart}${p.dignity === "neutral" ? "" : ` (${p.dignity})`}.` : "";
  };
  const pts: string[] = [`${VARGA_NAME[use.chart] ?? use.chart} shows ${use.purpose.toLowerCase()}. Its lagna is ${chart.ascendant}.`];
  const hl = chartLord(chart, use.house);
  const hp = at(hl);
  if (hp) pts.push(`The ${ordinal(use.house)} house of ${use.chart} is ruled by ${hl}, which sits in the ${ordinal(hp.house)} house in ${hp.sign}${hp.dignity === "neutral" ? "" : ` (${hp.dignity})`}.`);
  pts.push(describe(lagnaLord, "Your lagna lord"), qLord !== lagnaLord ? describe(qLord, "The lord of the matter") : "");
  const k = input.karakas[0];
  if (k && at(k) && k !== qLord) pts.push(describe(k as BodyName, "The significator"));
  const q1 = view.p[qLord];
  const qv = at(qLord);
  const d1Good = ![6, 8, 12].includes(q1.house) && q1.dignity !== "debilitated";
  if (qv) {
    const vGood = goodDig(qv.dignity) || ([1, 4, 5, 7, 9, 10, 11].includes(qv.house) && qv.dignity !== "debilitated");
    pts.push(
      d1Good && vGood ? `${use.chart} confirms the main chart: the lord of the matter is well placed in both.`
      : d1Good && !vGood ? `${use.chart} does not confirm the main chart: the promise is there but the result may fall short.`
      : !d1Good && vGood ? `${use.chart} gives hope: the main chart is weak but ${use.chart} supports the lord of the matter.`
      : `${use.chart} also shows the lord of the matter under pressure.`,
    );
  }
  if (use.chart === "D9" && view.p[qLord].vargottama) pts.push(`${qLord} is vargottama (same sign in D1 and D9), which greatly strengthens it.`);
  return { title: `${VARGA_NAME[use.chart] ?? use.chart}${use.chart === "D9" ? " (always checked)" : ""}`, points: pts.filter(Boolean) };
}

/** The first check of a Prashna reading. `problems` empty = fit. Only a warning unless the person chose to skip unfit charts. */
export function chartFitness(view: SkyView): { ok: boolean; problems: string[]; fine: string[] } {
  const mp = moonProfile(view);
  const fine: string[] = [];
  const problems: string[] = [];
  if (view.ascDeg < 3) problems.push(`the lagna is only ${view.ascDeg.toFixed(1)}° into its sign (too early: the matter is not ripe)`);
  else if (view.ascDeg > 27) problems.push(`the lagna is at ${view.ascDeg.toFixed(1)}° (too late: the matter is ending or already decided)`);
  else fine.push(`Lagna at ${view.ascDeg.toFixed(1)}° is in the safe middle of its sign.`);
  if (mp.voidOfCourse) problems.push("the Moon makes no contact before leaving its sign (void of course)");
  else fine.push("The Moon still has a contact to make before it leaves its sign.");
  if (mp.rikta) problems.push(`the tithi is rikta (${mp.tithi}), an empty tithi`);
  fine.push(`${mp.waxing ? "Growing" : "Shrinking"} Moon, tithi ${mp.tithi}.`);
  return { ok: problems.length === 0, problems, fine };
}

function antarOf(view: SkyView): BodyName {
  return vimshottariAt(view.p.Moon.lon, view.sky.castAt, view.sky.castAt).antardasha.planet as BodyName;
}

function dashaLords(view: SkyView): { level: string; planet: BodyName; end: string }[] {
  const d = vimshottariAt(view.p.Moon.lon, view.sky.castAt, view.sky.castAt);
  return [
    { level: "Mahadasha", planet: d.mahadasha.planet as BodyName, end: d.mahadasha.endDate },
    { level: "Antardasha", planet: d.antardasha.planet as BodyName, end: d.antardasha.endDate },
    { level: "Pratyantardasha", planet: d.pratyantardasha.planet as BodyName, end: d.pratyantardasha.endDate },
  ];
}

/** What a planet stands for in this question (lagna lord, lord of the matter, 6/8/12 lord, significator). */
function rolesOf(view: SkyView, n: BodyName, input: TraceInput, focus: Set<number>): string[] {
  const r: string[] = [];
  if (lordOf(view, 1) === n) r.push("the lagna lord (you)");
  if (lordOf(view, input.primaryHouse) === n) r.push(`the lord of the ${ordinal(input.primaryHouse)} (the matter)`);
  if (input.karakas.includes(n)) r.push("a natural significator of this matter");
  for (const h of DUSTHANAS) if (lordOf(view, h) === n && !focus.has(h)) r.push(`the lord of the ${ordinal(h)} (hurdles)`);
  return r;
}

function assessPlanet(view: SkyView, n: BodyName, st?: TraceInput["strength"]): { strong: boolean; weak: boolean } {
  const s = view.p[n];
  const sbLevel = st && isGraha(n) ? st.sb[n].level : "adequate";
  const weak = sbLevel === "weak" || s.dignity === "debilitated" || s.combust || inMrityuBhaga(view, n) || [6, 8, 12].includes(s.house);
  const strong = !weak && (sbLevel === "strong" || s.dignity === "exalted" || s.dignity === "own");
  return { strong, weak };
}

export function traceReading(view: SkyView, input: TraceInput): TraceSection[] {
  const { primaryHouse: qh } = input;
  const st = input.strength;
  const out: TraceSection[] = [];
  const lagnaLord = lordOf(view, 1);
  const qLord = lordOf(view, qh);
  const qSign = (view.ascSign + qh - 1) % 12;

  // 1. Is the chart fit to be read? (the first check a Prashna astrologer makes; a warning only, the reading goes on)
  {
    const fit = chartFitness(view);
    out.push({
      title: "Is the chart fit to be read?",
      points: [
        ...fit.fine,
        fit.problems.length
          ? `Warning: ${list(fit.problems)}. The chart is still read in full; you can choose in Settings to skip charts like this.`
          : "No warning sign: the chart can be read normally.",
      ],
    });
  }

  // 2. Lagna
  const lagna: string[] = [
    `${RASHI_NAMES[view.ascSign]} is rising at ${view.ascDeg.toFixed(1)}° (${signNature(view.ascSign)}): ${signTraits(view.ascSign)}.`,
    `Its lord ${lagnaLord} ${whereItGoes(view, lagnaLord, st)}.`,
  ];
  const ll = view.p[lagnaLord].house;
  lagna.push(
    ll === qh ? `The lagna lord goes straight to the house of your question: you are directly involved in this matter.`
    : [6, 8, 12].includes(ll) ? `The lagna lord goes to a difficult house (${ordinal(ll)}): your energy is drained or pulled into trouble.`
    : [1, 4, 5, 7, 9, 10, 11].includes(ll) ? `The lagna lord goes to a supportive house${view.p[lagnaLord].dignity === "debilitated" || view.p[lagnaLord].combust ? ", but it is weak there (" + (view.p[lagnaLord].combust ? "combust" : "in its sign of fall") + "), so the support is partial" : ": your energy is well placed"}.`
    : `The lagna lord goes to a middle-strength house (${ordinal(ll)}).`,
  );
  const lo = occupantsOf(view, 1);
  if (lo.length) lagna.push(`In the lagna itself: ${list(lo)}.`);
  out.push({ title: "Rising sign (Lagna) and where its lord goes", points: lagna });

  // 2. Moon
  const mp = moonProfile(view);
  const moonSignLord = SIGN_RULERS[view.p.Moon.sign] as BodyName;
  const nakLord = mp.nakshatraLord as BodyName;
  const moon: string[] = [
    `Moon is in ${mp.sign}, the ${ordinal(mp.house)} house (${SHORT_MEANING(mp.house)}); nakshatra ${mp.nakshatra}.`,
    `${mp.waxing ? "Growing" : "Shrinking"} Moon, ${mp.dignity === "neutral" ? "in a neutral sign" : `${mp.dignity} sign`}${mp.with.length ? `, with ${list(mp.with)}` : ""}.`,
  ];
  if (moonSignLord !== "Moon") moon.push(`Moon's sign lord ${moonSignLord} ${whereItGoes(view, moonSignLord, st)}.`);
  if (nakLord in view.p && nakLord !== moonSignLord && nakLord !== "Moon") moon.push(`Moon's nakshatra lord ${nakLord} ${whereItGoes(view, nakLord, st)}.`);
  moon.push(mp.voidOfCourse ? "The Moon makes no contact before leaving its sign: the matter may not move." : `Next the Moon ${mp.next[0].aspect === "conjunction" ? "joins" : `makes a ${mp.next[0].aspect} to`} ${mp.next[0].planet} in ${mp.next[0].degrees}°.`);
  out.push({ title: "Moon: the mind and the pulse of the question", points: moon });

  // 3. Concerned house
  const occ = occupantsOf(view, qh);
  const asp = aspectsOnHouse(view, qh);
  const house: string[] = [
    `The ${ordinal(qh)} house (${SHORT_MEANING(qh)}) falls in ${RASHI_NAMES[qSign]} (${signNature(qSign)}): ${signTraits(qSign)}.`,
    occ.length ? `Inside it: ${list(occ.map((o) => `${o}${isBenefic(view, o) ? " (benefic)" : " (malefic)"}`))}.` : `No planet sits in it, so its lord decides the result.`,
    asp.length ? `Looked at by: ${list(asp.map((o) => `${o}${isBenefic(view, o) ? " (benefic)" : " (malefic)"}`))}.` : `No planet looks at it.`,
  ];
  if (qLord === lagnaLord) house.push(`Its lord is also the lagna lord (${qLord}), so you and the matter are one: the result depends on you.`);
  else {
    house.push(`Its lord ${qLord} ${whereItGoes(view, qLord, st)}.`);
    const q = view.p[qLord];
    const l = view.p[lagnaLord];
    house.push(
      exchange(view, lagnaLord, qLord) ? `${lagnaLord} and ${qLord} exchange signs: a strong link between you and the matter.`
      : q.house === l.house ? `${lagnaLord} and ${qLord} are together: you and the matter meet.`
      : q.house === 1 ? `${qLord} goes to your lagna: the matter comes to you.`
      : l.house === qh ? `${lagnaLord} goes to the house of the matter: you go to it.`
      : `${lagnaLord} and ${qLord} are not directly linked by sign, so effort is needed to connect them.`,
    );
  }
  for (const k of input.karakas.slice(0, 1)) if (k in view.p && k !== qLord) house.push(`Natural significator ${k} ${whereItGoes(view, k as BodyName, st)}.`);
  out.push({ title: `The ${ordinal(qh)} house of your question and its lord`, points: house });

  // 4b. The themes of the question, house by house, and the planet + house + sign blend
  if (input.themes && input.themes.length) {
    const bi: BlendInput = { themes: input.themes, coreHouses: input.coreHouses ?? [], primaryHouse: qh, strength: st };
    const readings = readThemes(view, bi);
    out.push({
      title: "What you asked, house by house (the themes of your question)",
      points: readings.flatMap((r) => [`${r.label}: the chart looks ${r.level}.`, ...r.points]),
    });
    out.push({ title: "Planet + house + sign blended for your question", points: blendLines(view, bi, [antarOf(view)]) });
  }

  // 4. 6th, 8th, 12th lords
  const dust: string[] = [];
  const focus = new Set([qh, ...input.supportHouses]);
  for (const h of DUSTHANAS) {
    const lord = lordOf(view, h) as BodyName;
    const lh = view.p[lord].house;
    const note =
      lh === 1 ? "it enters the lagna: trouble or loss touches you directly"
      : lh === qh ? "it enters the house of your question: this can block or spoil the matter"
      : [6, 8, 12].includes(lh) ? "it stays inside the difficult houses: the trouble cancels itself (viparita effect), which helps"
      : lh === view.p[qLord].house ? "it sits with the lord of the matter: hurdles reach that lord"
      : "it stays away from you and the matter: little harm";
    dust.push(`${ordinal(h)} lord ${lord} ${whereItGoes(view, lord, st)}. ${focus.has(h) ? `The ${ordinal(h)} house is part of this question, so it is not counted as harm. ` : `${note[0].toUpperCase()}${note.slice(1)}.`}`.trim());
  }
  out.push({ title: "6th, 8th and 12th lords (hurdles, delay, loss)", points: dust });

  // 6. Divisional charts: D9 always, the others as the question needs
  for (const use of input.vargas ?? []) {
    const sec = vargaSection(view, input, use);
    if (sec) out.push(sec);
  }

  // 7. Lords of the running dasha (Vimshottari of the Prashna chart)
  const dl = dashaLords(view);
  const focusSet = new Set([qh, ...input.supportHouses]);
  const dashaPts: string[] = [];
  for (const d of dl) {
    const roles = rolesOf(view, d.planet, input, focusSet);
    const a = assessPlanet(view, d.planet, st);
    dashaPts.push(
      `${d.level} lord ${d.planet} (until ${d.end})${roles.length ? ` is ${list(roles)}` : " has no direct role in this matter"}; it ${whereItGoes(view, d.planet, st)}. ${a.strong ? "It is strong, so its period supports results." : a.weak ? "It is weak, so its period gives less or brings delay." : "It is of average strength."}`,
    );
  }
  out.push({ title: "Lords of the running dasha (who is in charge now)", points: dashaPts });

  // 6. Friendship now (natural + temporal)
  const rel = (a: BodyName, b: BodyName) => {
    const n = naturalRelation(a, b);
    const t = temporalRelation(view, a, b);
    const c = compoundRelation(view, a, b).relation;
    return `${a} to ${b}: naturally ${n === 1 ? "friend" : n === -1 ? "enemy" : "neutral"}, for now (temporal) ${t === 1 ? "friend" : "enemy"} = ${c}`;
  };
  const antar = dl[1].planet as BodyName;
  const friend: string[] = [];
  if (lagnaLord !== qLord) friend.push(rel(lagnaLord, qLord) + " (you and the matter)");
  if (qLord !== "Moon") friend.push(rel("Moon", qLord) + " (mind and the matter)");
  if (antar !== qLord && antar !== lagnaLord) friend.push(rel(antar, qLord) + " (running period and the matter)");
  if (antar !== lagnaLord && antar !== qLord) friend.push(rel(antar, lagnaLord) + " (running period and you)");
  if (friend.length === 0) friend.push(`The lagna lord, the lord of the matter and the running period are the same planet (${qLord}), so there is no friction between them.`);
  out.push({ title: "How the main planets stand with each other now (friend or enemy)", points: friend });

  // 7. Strength and afflictions
  const keys = [...new Set<BodyName>([lagnaLord, qLord, "Moon", antar, ...(input.karakas.slice(0, 1) as BodyName[])])];
  const flags: string[] = [];
  for (const n of keys) {
    const s = view.p[n];
    const bits: string[] = [];
    if (st && isGraha(n)) bits.push(`shadbala ${st.sb[n].level} (${st.sb[n].ratio})`);
    if (s.retro && isGraha(n)) bits.push("retrograde (delay, second thoughts)");
    if (s.combust) bits.push("combust (burnt by the Sun)");
    if (s.dignity === "debilitated") bits.push("in its sign of fall");
    if (inMrityuBhaga(view, n)) bits.push("in Mrityu Bhaga degree (a sensitive point)");
    flags.push(`${n}: ${bits.length ? bits.join(", ") : "no affliction"}.`);
  }
  if (st) flags.push(`House strength (bhava bala): lagna ${st.bb[1].level}, the ${ordinal(qh)} house ${st.bb[qh].level}.`);
  out.push({ title: "Strength and afflictions (shadbala, bhava bala, retrograde, combust, Mrityu Bhaga)", points: flags });

  // 8. Blend
  const qs = view.p[qLord];
  const verdict =
    qs.dignity === "debilitated" || [6, 8, 12].includes(qs.house) ? "weak: the matter faces trouble or delay"
    : qs.dignity === "exalted" || qs.dignity === "own" || [1, 4, 5, 7, 9, 10, 11].includes(qs.house) ? "supported: the matter has a base"
    : "average: it can move with effort";
  out.push({
    title: "Putting house, sign and planet together",
    points: [
      `House: ${ordinal(qh)} = ${SHORT_MEANING(qh)}.`,
      `Sign: ${RASHI_NAMES[qSign]} = ${signTraits(qSign)}.`,
      `Planet: ${qLord} in the ${ordinal(qs.house)} (${qs.signName})${conditionNotes(view, qLord).length ? `, ${conditionNotes(view, qLord).join(", ")}` : ""}.`,
      `Running period: ${dl[1].planet} ${assessPlanet(view, dl[1].planet, st).strong ? "(strong)" : assessPlanet(view, dl[1].planet, st).weak ? "(weak)" : "(average)"}.`,
      `Together, the matter looks ${verdict}.`,
    ],
  });
  return out.map((t, i) => ({ ...t, title: `Step ${i + 1}: ${t.title}` }));
}

export type TraceEffect = { family: "house" | "relations" | "condition"; label: string; effect: number; detail: string };

/** Score effects from the same chain. Magnitudes are modest and the families can be re-weighed by feedback. */
export function traceFactors(view: SkyView, input: TraceInput): TraceEffect[] {
  const strength = input.strength;
  const fx: TraceEffect[] = [];
  const { primaryHouse: qh } = input;
  const lagnaLord = lordOf(view, 1);
  const qLord = lordOf(view, qh);
  const focus = new Set([qh, ...input.supportHouses]);

  if (qLord !== lagnaLord) {
    if (exchange(view, lagnaLord, qLord)) fx.push({ family: "relations", label: "Querent and the matter", effect: 8, detail: `${lagnaLord} and ${qLord} exchange signs (a strong link between you and the matter)` });
    if (view.p[lagnaLord].house === qh) fx.push({ family: "relations", label: "Querent and the matter", effect: 3, detail: `Lagna lord ${lagnaLord} goes to the house of the matter` });
    if (view.p[qLord].house === 1) fx.push({ family: "relations", label: "Querent and the matter", effect: 3, detail: `${qLord}, lord of the matter, comes to the lagna` });
  }
  for (const h of DUSTHANAS) {
    if (focus.has(h)) continue;
    const lord = lordOf(view, h) as BodyName;
    if (lord === qLord || lord === lagnaLord) continue;
    const lh = view.p[lord].house;
    if (lh === qh) fx.push({ family: "house", label: `${ordinal(h)} lord`, effect: -6, detail: `${ordinal(h)} lord ${lord} enters the house of the question (hurdles, delay or loss)` });
    else if (lh === 1) fx.push({ family: "house", label: `${ordinal(h)} lord`, effect: -4, detail: `${ordinal(h)} lord ${lord} sits in the lagna (trouble touches the querent)` });
    else if ([6, 8, 12].includes(lh)) fx.push({ family: "house", label: `${ordinal(h)} lord`, effect: 2, detail: `${ordinal(h)} lord ${lord} stays inside the difficult houses (its trouble cancels out)` });
    else if (view.p[lord].house === view.p[qLord].house) fx.push({ family: "house", label: `${ordinal(h)} lord`, effect: -3, detail: `${ordinal(h)} lord ${lord} sits with ${qLord}, the lord of the matter` });
  }
  // Mrityu Bhaga weakens the planets that carry the matter.
  const carriers: [BodyName, string, number][] = [[lagnaLord, "lagna lord", -4], [qLord, `lord of the ${ordinal(qh)}`, -4], ["Moon", "Moon", -3]];
  for (const [n, role, pts] of carriers) {
    if (inMrityuBhaga(view, n)) fx.push({ family: "condition", label: "Mrityu Bhaga", effect: pts, detail: `${n} (${role}) stands in its Mrityu Bhaga degree (a sensitive, weakening point)` });
  }
  // The planet of the running period: helps when it stands for the matter and is strong, hurts when weak or a hurdle lord.
  const dl = dashaLords(view);
  const weight = [0.6, 1, 0.4];
  dl.forEach((d, i) => {
    const roles = rolesOf(view, d.planet, input, focus);
    if (roles.length === 0) return;
    const helpful = roles.some((x) => !x.includes("hurdles"));
    const { strong, weak } = assessPlanet(view, d.planet, strength);
    const base = helpful ? (strong ? 4 : weak ? -3 : 1) : weak ? -2 : -3;
    fx.push({ family: "relations", label: `${d.level} lord`, effect: base * weight[i], detail: `${d.level} lord ${d.planet} (${list(roles)}) is ${strong ? "strong" : weak ? "weak" : "of average strength"}${helpful ? "" : " and is a hurdle lord"}: the running period ${helpful ? (strong ? "supports" : weak ? "gives little" : "helps a little") : "brings obstacles"}` });
  });
  return fx;
}
