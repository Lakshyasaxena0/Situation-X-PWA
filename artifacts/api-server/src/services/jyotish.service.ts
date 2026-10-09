// Classical Jyotish calculations used inside the Prashna reading. Nothing here is shown to the person
// as a chart: it feeds the score and the notes handed to the AI.
//
//   relations   natural + temporal (tatkalika) friendship -> the five-fold relation (panchadha maitri)
//   aspects     graha drishti (Mars 4/8, Jupiter 5/9, Saturn 3/10, nodes 5/9, all 7th)
//   conditions  retrograde, combustion / cazimi, dignity, moolatrikona, vargottama
//   shadbala    the six-fold strength, in virupas (SIMPLIFIED, see the note on shadbala())
//   bhava bala  the strength of a house: its lord, occupants, aspects and position
//   hora        the hora lord and weekday lord at the moment of the question
//   moon        the Moon's profile: tithi, nakshatra, aspects, what it meets next (void of course)
//   pairs       how two planets sit from each other (1/7, 2/12, 3/11, 4/10, 5/9, 6/8)

import type { BodyName } from "./ephemeris.service.js";
import { declinationOf } from "./ephemeris.service.js";
import {
  RASHI_NAMES,
  SIGN_RULERS,
  dignityOf,
  getDrekkana,
  getDwadasamsa,
  getHora,
  getNavamsa,
  getSaptamsa,
  getTrimsamsa,
  type Dignity,
  type PrashnaSky,
} from "./vedic.service.js";

export type Graha = "Sun" | "Moon" | "Mars" | "Mercury" | "Jupiter" | "Venus" | "Saturn";
export const GRAHAS: Graha[] = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
export const isGraha = (n: string): n is Graha => (GRAHAS as string[]).includes(n);

const angDist = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
};
const signIdx = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30);
const signOfName = (name: string) => RASHI_NAMES.indexOf(name);
export const ordinal = (n: number) => ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"][n] ?? `${n}th`;

// ---------------------------------------------------------------- the sky as seen from the question

export type PlanetState = {
  name: BodyName;
  lon: number;
  sign: number;
  signName: string;
  /** Degrees within the sign. */
  deg: number;
  /** Whole-sign house from the lagna. */
  house: number;
  retro: boolean;
  speed: number;
  dignity: Dignity;
  moolatrikona: boolean;
  combust: boolean;
  /** Within one degree of the Sun: strengthened, not burnt. */
  cazimi: boolean;
  vargottama: boolean;
};

export type SkyView = {
  sky: PrashnaSky;
  ascSign: number;
  ascDeg: number;
  p: Record<BodyName, PlanetState>;
};

const MOOLATRIKONA: Partial<Record<BodyName, [number, number, number]>> = {
  Sun: [4, 0, 20], Moon: [1, 3, 30], Mars: [0, 0, 12], Mercury: [5, 15, 20], Jupiter: [8, 0, 10], Venus: [6, 0, 15], Saturn: [10, 0, 20],
};

export function viewOf(sky: PrashnaSky): SkyView {
  const ascSign = signIdx(sky.ascendant);
  const names = Object.keys(sky.longitudes) as BodyName[];
  const p = {} as Record<BodyName, PlanetState>;
  for (const name of names) {
    const lon = sky.longitudes[name];
    const sign = signIdx(lon);
    const deg = lon - sign * 30;
    const mt = MOOLATRIKONA[name];
    const sunSep = angDist(lon, sky.longitudes.Sun);
    p[name] = {
      name,
      lon,
      sign,
      signName: RASHI_NAMES[sign],
      deg,
      house: ((sign - ascSign + 12) % 12) + 1,
      retro: sky.speeds[name] < 0,
      speed: sky.speeds[name],
      dignity: dignityOf(name, sign),
      moolatrikona: mt !== undefined && mt[0] === sign && deg >= mt[1] && deg < mt[2],
      combust: sky.combust.includes(name),
      cazimi: name !== "Sun" && name !== "Moon" && name !== "Rahu" && name !== "Ketu" && sunSep < 1,
      vargottama: signOfName(getNavamsa(lon)) === sign,
    };
  }
  return { sky, ascSign, ascDeg: sky.ascendant - ascSign * 30, p };
}

export const lordOf = (view: SkyView, house: number): Graha => SIGN_RULERS[(view.ascSign + house - 1) % 12] as Graha;

// ---------------------------------------------------------------- friendship

const NATURAL: Record<Graha, { friends: string[]; enemies: string[] }> = {
  Sun: { friends: ["Moon", "Mars", "Jupiter"], enemies: ["Venus", "Saturn"] },
  Moon: { friends: ["Sun", "Mercury"], enemies: [] },
  Mars: { friends: ["Sun", "Moon", "Jupiter"], enemies: ["Mercury"] },
  Mercury: { friends: ["Sun", "Venus"], enemies: ["Moon"] },
  Jupiter: { friends: ["Sun", "Moon", "Mars"], enemies: ["Mercury", "Venus"] },
  Venus: { friends: ["Mercury", "Saturn"], enemies: ["Sun", "Moon"] },
  Saturn: { friends: ["Mercury", "Venus"], enemies: ["Sun", "Moon", "Mars"] },
};
// The nodes are read like the planet they behave as (Rahu like Saturn, Ketu like Mars).
const NODE_AS: Record<string, Graha> = { Rahu: "Saturn", Ketu: "Mars" };
const asGraha = (n: string): Graha => (isGraha(n) ? n : NODE_AS[n] ?? "Saturn");

export function naturalRelation(a: string, b: string): 1 | 0 | -1 {
  const ga = asGraha(a);
  if (NATURAL[ga].friends.includes(b) || (!isGraha(b) && NATURAL[ga].friends.includes(asGraha(b)))) return 1;
  if (NATURAL[ga].enemies.includes(b) || (!isGraha(b) && NATURAL[ga].enemies.includes(asGraha(b)))) return -1;
  return 0;
}

/** Temporal friendship: planets in the 2nd, 3rd, 4th, 10th, 11th, 12th sign from a planet are its friends for now. */
export function temporalRelation(view: SkyView, a: BodyName, b: BodyName): 1 | -1 {
  const d = (view.p[b].sign - view.p[a].sign + 12) % 12;
  return [1, 2, 3, 9, 10, 11].includes(d) ? 1 : -1;
}

export type Relation = "adhi mitra" | "mitra" | "sama" | "shatru" | "adhi shatru";
const RELATION_SCORE: Record<Relation, number> = { "adhi mitra": 2, mitra: 1, sama: 0, shatru: -1, "adhi shatru": -2 };

/** Natural + temporal = the five-fold relation of `a` towards `b`. */
export function compoundRelation(view: SkyView, a: BodyName, b: BodyName): { relation: Relation; score: number } {
  if (a === b) return { relation: "mitra", score: 1 };
  const total = naturalRelation(a, b) * 1 + temporalRelation(view, a, b) * 1;
  // friend+friend 2, friend+enemy 0, neutral+friend 1, neutral+enemy -1, enemy+friend 0, enemy+enemy -2
  const relation: Relation = total >= 2 ? "adhi mitra" : total === 1 ? "mitra" : total === 0 ? "sama" : total === -1 ? "shatru" : "adhi shatru";
  return { relation, score: RELATION_SCORE[relation] };
}

// ---------------------------------------------------------------- aspects

const ASPECT_HOUSES: Record<BodyName, number[]> = {
  Sun: [7], Moon: [7], Mercury: [7], Venus: [7], Mars: [4, 7, 8], Jupiter: [5, 7, 9], Saturn: [3, 7, 10], Rahu: [5, 7, 9], Ketu: [5, 7, 9],
};

export const isBenefic = (view: SkyView, n: BodyName) =>
  n === "Jupiter" || n === "Venus" || n === "Mercury" || (n === "Moon" && view.sky.moonWaxing);
export const isMalefic = (view: SkyView, n: BodyName) => !isBenefic(view, n);

/** Planets whose graha drishti falls on `house` (planets sitting in it are not counted). */
export function aspectsOnHouse(view: SkyView, house: number): BodyName[] {
  return (Object.keys(view.p) as BodyName[]).filter((n) => {
    const from = view.p[n].house;
    return ASPECT_HOUSES[n].some((k) => ((from - 1 + k - 1) % 12) + 1 === house);
  });
}

export const occupantsOf = (view: SkyView, house: number): BodyName[] => (Object.keys(view.p) as BodyName[]).filter((n) => view.p[n].house === house);

// ---------------------------------------------------------------- Shadbala

export type ShadbalaRow = {
  planet: Graha;
  sthana: number;
  dig: number;
  kala: number;
  chesta: number;
  naisargika: number;
  drik: number;
  total: number;
  rupas: number;
  required: number;
  ratio: number;
  level: "weak" | "adequate" | "strong";
};

const EXALT_POINT: Record<Graha, number> = { Sun: 10, Moon: 33, Mars: 298, Mercury: 165, Jupiter: 95, Venus: 357, Saturn: 200 };
const REQUIRED_VIRUPA: Record<Graha, number> = { Sun: 390, Moon: 360, Mars: 300, Mercury: 420, Jupiter: 390, Venus: 330, Saturn: 300 };
const NAISARGIKA: Record<Graha, number> = { Sun: 60, Moon: 51.43, Venus: 42.86, Jupiter: 34.29, Mercury: 25.71, Mars: 17.14, Saturn: 8.57 };
const DIG_HOUSE: Record<Graha, number> = { Jupiter: 1, Mercury: 1, Sun: 10, Mars: 10, Saturn: 7, Moon: 4, Venus: 4 };
const MEAN_SPEED: Record<string, number> = { Mercury: 1.38, Venus: 1.2, Mars: 0.52, Jupiter: 0.083, Saturn: 0.034 };
const CHALDEAN: Graha[] = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"];
const WEEKDAY_LORD: Graha[] = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];

const VARGA_POINTS: Record<Relation | "own" | "moolatrikona", number> = {
  moolatrikona: 45, own: 30, "adhi mitra": 22.5, mitra: 15, sama: 7.5, shatru: 3.75, "adhi shatru": 1.875,
};

/** Value of the sign `signName` for planet `n` in one division (by its relation to that sign's lord). */
function vargaValue(view: SkyView, n: Graha, signName: string, d1Sign: boolean): number {
  const lord = SIGN_RULERS[signOfName(signName)] as BodyName;
  if (lord === n) return d1Sign && view.p[n].moolatrikona ? VARGA_POINTS.moolatrikona : VARGA_POINTS.own;
  return VARGA_POINTS[compoundRelation(view, n, lord).relation];
}

export type HoraInfo = {
  weekdayLord: Graha;
  horaLord: Graha;
  isDay: boolean;
  /** 1-24, counted from sunrise. */
  horaNumber: number;
  sunrise: string;
  sunset: string;
};

export function horaOf(sky: PrashnaSky): HoraInfo {
  const t = sky.sunTimes;
  const weekdayLord = WEEKDAY_LORD[t.weekday];
  const n = Math.min(23, Math.max(0, Math.floor((sky.jd - t.sunrise) * 24)));
  const horaLord = CHALDEAN[(CHALDEAN.indexOf(weekdayLord) + n) % 7];
  const toDate = (jd: number) => new Date((jd - 2440587.5) * 86400000).toISOString();
  return { weekdayLord, horaLord, isDay: sky.jd >= t.sunrise && sky.jd < t.sunset, horaNumber: n + 1, sunrise: toDate(t.sunrise), sunset: toDate(t.sunset) };
}

/**
 * Shadbala (the six-fold strength) in virupas. This is a SIMPLIFIED version of the classical method:
 *  - Sthana (position): uccha, the seven-fold dignity (D1, D2, D3, D7, D9, D12, D30), odd/even, kendradi, drekkana: as classical.
 *  - Dig: classical, from the equal-house cusps of the Prashna lagna.
 *  - Kala: nathonnata (from the Sun's place), paksha, tribhaga, vara, hora and ayana are included;
 *    abda, masa and yuddha are left out.
 *  - Chesta: from the planet's daily speed against its mean speed (the classical method needs the
 *    true-to-mean difference); the Sun uses ayana bala and the Moon paksha bala.
 *  - Drik: a flat quarter-strength for each benefic (+) or malefic (-) graha drishti on the planet.
 * It is used to rank planets as weak / adequate / strong, not to quote rupas as exact.
 */
export function shadbala(view: SkyView): Record<Graha, ShadbalaRow> {
  const { sky } = view;
  const hora = horaOf(sky);
  const t = sky.sunTimes;
  const ayanamsa = sky.charts.d1.ayanamsa;
  const sunLon = view.p.Sun.lon;
  const moonSunGap = angDist(view.p.Moon.lon, sunLon);
  const icPoint = view.ascSign * 30 + view.ascDeg + 90;
  const dayFraction = angDist(sunLon, icPoint) / 180;
  const frac = hora.isDay ? (sky.jd - t.sunrise) / Math.max(1e-6, t.sunset - t.sunrise) : (sky.jd - t.sunset) / Math.max(1e-6, t.nextSunrise - t.sunset);
  const third = Math.min(2, Math.max(0, Math.floor(frac * 3)));
  const tribhagaLord: Graha = hora.isDay ? (["Mercury", "Sun", "Saturn"] as Graha[])[third] : (["Moon", "Venus", "Mars"] as Graha[])[third];
  const out = {} as Record<Graha, ShadbalaRow>;

  for (const n of GRAHAS) {
    const s = view.p[n];
    // ---- sthana
    const uccha = angDist(s.lon, (EXALT_POINT[n] + 180) % 360) / 3;
    const vargas = [
      vargaValue(view, n, s.signName, true),
      vargaValue(view, n, getHora(s.lon), false),
      vargaValue(view, n, getDrekkana(s.lon), false),
      vargaValue(view, n, getSaptamsa(s.lon), false),
      vargaValue(view, n, getNavamsa(s.lon), false),
      vargaValue(view, n, getDwadasamsa(s.lon), false),
      vargaValue(view, n, getTrimsamsa(s.lon), false),
    ];
    const saptavargaja = vargas.reduce((a, b) => a + b, 0);
    const evenLover = n === "Moon" || n === "Venus";
    const oddSign = s.sign % 2 === 0;
    const navOdd = signOfName(getNavamsa(s.lon)) % 2 === 0;
    const ojhaRasi = evenLover ? (oddSign ? 0 : 15) : oddSign ? 15 : 0;
    const ojhaNavamsa = evenLover ? (navOdd ? 0 : 15) : navOdd ? 15 : 0;
    const kendradi = [1, 4, 7, 10].includes(s.house) ? 60 : [2, 5, 8, 11].includes(s.house) ? 30 : 15;
    const part = Math.min(2, Math.floor(s.deg / 10));
    const wantPart = n === "Sun" || n === "Mars" || n === "Jupiter" ? 0 : n === "Mercury" || n === "Saturn" ? 1 : 2;
    const drekkana = part === wantPart ? 15 : 0;
    const sthana = uccha + saptavargaja + ojhaRasi + ojhaNavamsa + kendradi + drekkana;

    // ---- dig
    const strongPoint = view.ascSign * 30 + view.ascDeg + (DIG_HOUSE[n] - 1) * 30;
    const dig = angDist(s.lon, (strongPoint + 180) % 360) / 3;

    // ---- kala
    const nathonnata = n === "Mercury" ? 60 : n === "Sun" || n === "Jupiter" || n === "Venus" ? 60 * dayFraction : 60 * (1 - dayFraction);
    const benefic = n === "Jupiter" || n === "Venus" || n === "Moon" || n === "Mercury";
    const paksha = benefic ? moonSunGap / 3 : 60 - moonSunGap / 3;
    const tribhaga = n === "Jupiter" || n === tribhagaLord ? 60 : 0;
    const vara = n === hora.weekdayLord ? 45 : 0;
    const horaBala = n === hora.horaLord ? 60 : 0;
    const decl = declinationOf(sky.longitudes[n] + ayanamsa);
    let ayana = n === "Mercury" ? 30 : n === "Moon" || n === "Saturn" ? ((24 - decl) / 48) * 60 : ((24 + decl) / 48) * 60;
    ayana = Math.min(60, Math.max(0, ayana));
    if (n === "Sun") ayana = Math.min(120, ayana * 2);
    const kala = nathonnata + paksha + tribhaga + vara + horaBala + ayana;

    // ---- chesta
    let chesta: number;
    if (n === "Sun") chesta = ayana;
    else if (n === "Moon") chesta = paksha;
    else if (s.retro) chesta = 60;
    else chesta = Math.min(60, Math.max(0, 60 * (1 - s.speed / (1.4 * MEAN_SPEED[n]))));

    // ---- drik
    let drik = 0;
    for (const a of aspectsOnHouse(view, s.house)) if (a !== n) drik += isBenefic(view, a) ? 15 : -15;

    const total = sthana + dig + kala + chesta + NAISARGIKA[n] + drik;
    const ratio = total / REQUIRED_VIRUPA[n];
    out[n] = {
      planet: n,
      sthana: Math.round(sthana),
      dig: Math.round(dig),
      kala: Math.round(kala),
      chesta: Math.round(chesta),
      naisargika: Math.round(NAISARGIKA[n]),
      drik: Math.round(drik),
      total: Math.round(total),
      rupas: Math.round((total / 60) * 100) / 100,
      required: REQUIRED_VIRUPA[n],
      ratio: Math.round(ratio * 100) / 100,
      level: ratio >= 1.1 ? "strong" : ratio >= 0.85 ? "adequate" : "weak",
    };
  }
  return out;
}

// ---------------------------------------------------------------- Bhava bala

export type BhavaBala = {
  house: number;
  lord: Graha;
  lordRatio: number;
  score: number;
  level: "weak" | "average" | "strong";
  notes: string[];
};

const UPACHAYA = new Set([3, 6, 10, 11]);

/**
 * Strength of a house from its lord's shadbala, the planets in it, the planets aspecting it and
 * its place (kendra / trikona / dusthana). A transparent composite, not the classical rupa figure.
 */
export function bhavaBala(view: SkyView, sb: Record<Graha, ShadbalaRow>, house: number): BhavaBala {
  const lord = lordOf(view, house);
  const ratio = sb[lord].ratio;
  const notes: string[] = [];
  let score = Math.max(-10, Math.min(10, (ratio - 1) * 20));
  notes.push(`${lord} (lord) has ${sb[lord].level} shadbala (${sb[lord].ratio})`);

  for (const o of occupantsOf(view, house)) {
    if (o === lord) continue;
    if (isBenefic(view, o)) { score += 4; notes.push(`${o} (benefic) sits in it`); }
    else if (UPACHAYA.has(house)) { score += 2; notes.push(`${o} (malefic) sits in it, which helps in a growth house`); }
    else { score -= 4; notes.push(`${o} (malefic) sits in it`); }
  }
  for (const a of aspectsOnHouse(view, house)) {
    if (isBenefic(view, a)) { score += 3; notes.push(`${a} (benefic) aspects it`); }
    else if (UPACHAYA.has(house) && (a === "Mars" || a === "Saturn")) { score += 1; }
    else { score -= 3; notes.push(`${a} (malefic) aspects it`); }
  }
  score += [1, 4, 7, 10].includes(house) ? 4 : [5, 9].includes(house) ? 4 : [6, 8, 12].includes(house) ? -4 : 0;
  return { house, lord, lordRatio: ratio, score: Math.round(score * 10) / 10, level: score >= 8 ? "strong" : score <= -6 ? "weak" : "average", notes };
}

// ---------------------------------------------------------------- pairs of planets

export type PairRelation = { key: "conjunct" | "1/7" | "2/12" | "3/11" | "4/10" | "5/9" | "6/8"; effect: number; meaning: string };

const PAIR_TABLE: Record<number, PairRelation> = {
  1: { key: "conjunct", effect: 5, meaning: "together in one sign (joined, they share results)" },
  2: { key: "2/12", effect: -4, meaning: "2/12 from each other (drain, loss of support)" },
  3: { key: "3/11", effect: 3, meaning: "3/11 from each other (effort that gains)" },
  4: { key: "4/10", effect: 4, meaning: "4/10 from each other (angular: work and result support each other)" },
  5: { key: "5/9", effect: 6, meaning: "5/9 from each other (trine: natural support and luck)" },
  6: { key: "6/8", effect: -7, meaning: "6/8 from each other (friction, obstacles, hidden trouble)" },
  7: { key: "1/7", effect: -1, meaning: "1/7 from each other (opposite: tension but mutual aspect)" },
};

export function pairRelation(view: SkyView, a: BodyName, b: BodyName): PairRelation {
  const d = ((view.p[b].sign - view.p[a].sign + 12) % 12) + 1;
  return PAIR_TABLE[d <= 7 ? d : 14 - d];
}

// ---------------------------------------------------------------- the Moon

const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta",
  "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishtha", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];
const NAK_LORDS = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
export const nakshatraOf = (lon: number) => NAKSHATRAS[Math.floor(lon / (360 / 27)) % 27];

export type MoonContact = { planet: BodyName; aspect: "conjunction" | "sextile" | "square" | "trine" | "opposition"; degrees: number };

export type MoonProfile = {
  sign: string;
  house: number;
  nakshatra: string;
  nakshatraLord: string;
  tithi: number;
  waxing: boolean;
  /** 4, 9, 14 (rikta) are considered empty tithis. */
  rikta: boolean;
  dignity: Dignity;
  with: BodyName[];
  beneficAspects: BodyName[];
  maleficAspects: BodyName[];
  /** What the Moon will meet before it leaves its sign, nearest first. */
  next: MoonContact[];
  voidOfCourse: boolean;
  pace: "fast" | "average" | "slow";
};

const ASPECT_NAMES: [number, MoonContact["aspect"]][] = [[0, "conjunction"], [60, "sextile"], [90, "square"], [120, "trine"], [180, "opposition"], [240, "trine"], [270, "square"], [300, "sextile"]];

export function moonProfile(view: SkyView): MoonProfile {
  const m = view.p.Moon;
  const gap = ((view.p.Moon.lon - view.p.Sun.lon) % 360 + 360) % 360;
  const tithi = Math.floor(gap / 12) + 1;
  const left = 30 - m.deg;
  const next: MoonContact[] = [];
  for (const n of Object.keys(view.p) as BodyName[]) {
    if (n === "Moon") continue;
    for (const [a, name] of ASPECT_NAMES) {
      const x = ((((view.p[n].lon - m.lon) % 360) + 360) % 360 - a + 360) % 360;
      if (x > 0 && x <= left) next.push({ planet: n, aspect: name, degrees: Math.round(x * 10) / 10 });
    }
  }
  next.sort((a, b) => a.degrees - b.degrees);
  const asp = aspectsOnHouse(view, m.house);
  return {
    sign: m.signName,
    house: m.house,
    nakshatra: nakshatraOf(m.lon),
    nakshatraLord: NAK_LORDS[Math.floor(m.lon / (360 / 27)) % 9],
    tithi: tithi > 15 ? tithi - 15 : tithi,
    waxing: view.sky.moonWaxing,
    rikta: [4, 9, 14].includes(tithi > 15 ? tithi - 15 : tithi),
    dignity: m.dignity,
    with: occupantsOf(view, m.house).filter((n) => n !== "Moon"),
    beneficAspects: asp.filter((n) => isBenefic(view, n)),
    maleficAspects: asp.filter((n) => !isBenefic(view, n)),
    next: next.slice(0, 4),
    voidOfCourse: next.length === 0,
    pace: m.speed >= 13.6 ? "fast" : m.speed <= 12.2 ? "slow" : "average",
  };
}

// ---------------------------------------------------------------- the lagna

export type LagnaProfile = {
  sign: string;
  degree: number;
  modality: "movable" | "fixed" | "dual";
  element: "fire" | "earth" | "air" | "water";
  lord: Graha;
  timing: "early" | "ripe" | "late";
  note: string;
};

export function lagnaProfile(view: SkyView): LagnaProfile {
  const modality = (["movable", "fixed", "dual"] as const)[view.ascSign % 3];
  const element = (["fire", "earth", "air", "water"] as const)[view.ascSign % 4];
  const timing = view.ascDeg < 1 ? "early" : view.ascDeg >= 29 ? "late" : "ripe";
  const modalityNote =
    modality === "movable" ? "a movable lagna: things change quickly, results can come soon" :
    modality === "fixed" ? "a fixed lagna: things are steady and slow to move, results take longer but last" :
    "a dual lagna: mixed, two minds or two outcomes, changes of plan";
  const timingNote = timing === "early" ? "; the lagna is in its first degree (the matter is not yet ripe)" : timing === "late" ? "; the lagna is in its last degree (the matter is ending or already decided)" : "";
  return { sign: RASHI_NAMES[view.ascSign], degree: Math.round(view.ascDeg * 100) / 100, modality, element, lord: lordOf(view, 1), timing, note: modalityNote + timingNote };
}

// ---------------------------------------------------------------- planet condition

export function conditionNotes(view: SkyView, n: BodyName): string[] {
  const s = view.p[n];
  const out: string[] = [];
  if (s.dignity === "exalted") out.push("exalted");
  else if (s.dignity === "debilitated") out.push("debilitated");
  else if (s.dignity === "own") out.push("in its own sign");
  if (s.moolatrikona) out.push("in moolatrikona");
  if (s.vargottama) out.push("vargottama");
  if (s.retro && (n !== "Rahu" && n !== "Ketu")) out.push("retrograde");
  if (s.combust) out.push("combust");
  if (s.cazimi) out.push("cazimi (in the heart of the Sun)");
  return out;
}
