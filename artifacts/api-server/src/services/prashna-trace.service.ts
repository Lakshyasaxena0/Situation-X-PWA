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

import { RASHI_NAMES, SIGN_RULERS } from "./vedic.service.js";
import type { BodyName } from "./ephemeris.service.js";
import {
  aspectsOnHouse,
  conditionNotes,
  isBenefic,
  lordOf,
  moonProfile,
  nakshatraOf,
  occupantsOf,
  ordinal,
  naturalRelation,
  type Graha,
  type SkyView,
} from "./jyotish.service.js";
import { HOUSE_SIGNIFICATIONS, SIGN_KARAKATVA } from "./significations.js";

export type TraceSection = { title: string; points: string[] };
export type TraceInput = { primaryHouse: number; supportHouses: number[]; topic: string; karakas: string[] };

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
function whereItGoes(view: SkyView, n: BodyName): string {
  const s = view.p[n];
  const owner = SIGN_RULERS[s.sign];
  const rel = s.dignity === "own" ? "its own sign" : s.dignity === "exalted" ? "its sign of exaltation" : s.dignity === "debilitated" ? "its sign of fall" : owner === n ? "its own sign" : naturalRelation(n, owner) === 1 ? `a friend's sign (${owner})` : naturalRelation(n, owner) === -1 ? `an enemy's sign (${owner})` : `a neutral sign (${owner})`;
  const c = company(view, n);
  const cond = conditionNotes(view, n).filter((x) => !["exalted", "debilitated", "in its own sign"].includes(x));
  return (
    `goes to the ${ordinal(s.house)} house (${SHORT_MEANING(s.house)}) in ${s.signName}, ${rel}` +
    (cond.length ? `; it is ${cond.join(", ")}` : "") +
    (c.with.length ? `; with ${list(c.with)}` : "") +
    (c.seenBy.length ? `; seen by ${c.seenBy.map((x) => `${x}${isBenefic(view, x) ? " (benefic)" : " (malefic)"}`).join(", ")}` : "")
  );
}

const exchange = (view: SkyView, a: BodyName, b: BodyName) => a !== b && SIGN_RULERS[view.p[a].sign] === b && SIGN_RULERS[view.p[b].sign] === a;

export function traceReading(view: SkyView, input: TraceInput): TraceSection[] {
  const { primaryHouse: qh } = input;
  const out: TraceSection[] = [];
  const lagnaLord = lordOf(view, 1);
  const qLord = lordOf(view, qh);
  const qSign = (view.ascSign + qh - 1) % 12;

  // 1. Lagna
  const lagna: string[] = [
    `${RASHI_NAMES[view.ascSign]} is rising at ${view.ascDeg.toFixed(1)}° (${signNature(view.ascSign)}): ${signTraits(view.ascSign)}.`,
    `Its lord ${lagnaLord} ${whereItGoes(view, lagnaLord)}.`,
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
  if (moonSignLord !== "Moon") moon.push(`Moon's sign lord ${moonSignLord} ${whereItGoes(view, moonSignLord)}.`);
  if (nakLord in view.p && nakLord !== moonSignLord && nakLord !== "Moon") moon.push(`Moon's nakshatra lord ${nakLord} ${whereItGoes(view, nakLord)}.`);
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
    house.push(`Its lord ${qLord} ${whereItGoes(view, qLord)}.`);
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
  for (const k of input.karakas.slice(0, 1)) if (k in view.p && k !== qLord) house.push(`Natural significator ${k} ${whereItGoes(view, k as BodyName)}.`);
  out.push({ title: `The ${ordinal(qh)} house of your question and its lord`, points: house });

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
    dust.push(`${ordinal(h)} lord ${lord} ${whereItGoes(view, lord)}. ${focus.has(h) ? `The ${ordinal(h)} house is part of this question, so it is not counted as harm. ` : `${note[0].toUpperCase()}${note.slice(1)}.`}`.trim());
  }
  out.push({ title: "6th, 8th and 12th lords (hurdles, delay, loss)", points: dust });

  // 5. Blend
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
      `Together, the matter looks ${verdict}.`,
    ],
  });
  return out;
}

export type TraceEffect = { family: "house" | "relations"; label: string; effect: number; detail: string };

/** Score effects from the same chain. Magnitudes are modest and the families can be re-weighed by feedback. */
export function traceFactors(view: SkyView, input: TraceInput): TraceEffect[] {
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
  return fx;
}
