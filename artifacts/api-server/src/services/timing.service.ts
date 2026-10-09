// Timing for time-based questions ("when will...", "kab tak..."): which dasha periods are running
// and whether they activate the house the question is about.

import type { IntentType } from "./ajit.service.js";
import { SIGN_RULERS, RASHI_NAMES } from "./vedic.service.js";
import { houseProfile } from "./prashna.service.js";
import { charaDashaAt, signAspects, vimshottariAt, type CharaDasha, type VimshottariDasha } from "./dasha.service.js";
import { julianDayFromDate, lahiriAyanamsa, normalizeDegrees, siderealLongitudes, tropicalAscendant } from "./ephemeris.service.js";

export type TimingResult = {
  /** Always true: the dashas are only worked out for questions that ask "when" / "how long". */
  timeBased: true;
  /** The dashas are those of the Prashna chart (the moment of the question). */
  basis: "question";
  vimshottari: VimshottariDasha;
  chara: CharaDasha | null;
  house: number;
  houseSign: string;
  houseLord: string;
  /** Plain-language findings: which running periods touch the question's house. */
  activations: string[];
  summary: string;
};

const TIME_PATTERN =
  /\b(when|how long|how soon|by when|until when|timeline|deadline|kab|kab tak|kitne din|kitna time|kitni der|kitne mahine|kitne saal|jaldi|date|time)\b|\bwill (?:i|it|we) (?:get|happen|be)\b/i;

/** Does the question ask about timing? */
export function isTimeBased(text: string): boolean {
  return TIME_PATTERN.test(text);
}

function chartAt(at: Date, latitude: number, longitude: number) {
  const jd = julianDayFromDate(at);
  const sid = siderealLongitudes(jd);
  const lagna = normalizeDegrees(tropicalAscendant(jd, latitude, longitude) - lahiriAyanamsa(jd));
  return { sid, lagna };
}

export function analyzeTiming(
  intent: IntentType,
  question: { at: Date; latitude: number; longitude: number },
): TimingResult {
  const { sid, lagna } = chartAt(question.at, question.latitude, question.longitude);

  const vim = vimshottariAt(sid.Moon, question.at, question.at);
  const chara = charaDashaAt({ longitudes: sid as unknown as Record<string, number>, lagnaLongitude: lagna }, question.at, question.at);

  const profile = houseProfile(intent);
  const lagnaIdx = Math.floor(lagna / 30);
  const houseIdx = (lagnaIdx + profile.primaryHouse - 1) % 12;
  const houseLord = SIGN_RULERS[houseIdx];
  const occupants = Object.entries(sid).filter(([, lon]) => Math.floor(lon / 30) === houseIdx).map(([p]) => p);

  const activations: string[] = [];
  const periods: [string, string][] = [
    ["Mahadasha", vim.mahadasha.planet],
    ["Antardasha", vim.antardasha.planet],
    ["Pratyantardasha", vim.pratyantardasha.planet],
  ];
  for (const [label, planet] of periods) {
    const why: string[] = [];
    if (planet === houseLord) why.push(`rules house ${profile.primaryHouse}`);
    if (occupants.includes(planet)) why.push(`sits in house ${profile.primaryHouse}`);
    if (profile.karakas.includes(planet)) why.push(`is a natural significator for ${profile.topic.toLowerCase()}`);
    if (why.length) activations.push(`Vimshottari ${label} (${planet}) ${why.join(" and ")}: supports results on this matter now.`);
  }
  if (chara) {
    const lordIdx = Math.floor(sid[houseLord as keyof typeof sid] / 30);
    for (const [label, p] of [["Mahadasha", chara.mahadasha], ["Antardasha", chara.antardasha]] as const) {
      const why: string[] = [];
      if (p.signIndex === houseIdx) why.push(`is the house-${profile.primaryHouse} sign itself`);
      if (p.signIndex === lordIdx) why.push(`holds the lord of house ${profile.primaryHouse}`);
      if (signAspects(p.signIndex, houseIdx)) why.push(`aspects house ${profile.primaryHouse}`);
      if (why.length) activations.push(`Chara ${label} (${p.sign}) ${why.join(" and ")}.`);
    }
  }

  const summary =
    `Dashas of the Prashna chart (the moment of the question). Vimshottari now: ${vim.mahadasha.planet} / ${vim.antardasha.planet} / ${vim.pratyantardasha.planet}` +
    (chara ? `; Chara: ${chara.mahadasha.sign} / ${chara.antardasha.sign}.` : ".") +
    (activations.length ? ` ${activations.length} of them touch the ${RASHI_NAMES[houseIdx]} house of this question.` : " None of the running periods directly touches the house of this question.");

  return { timeBased: true, basis: "question", vimshottari: vim, chara, house: profile.primaryHouse, houseSign: RASHI_NAMES[houseIdx], houseLord, activations, summary };
}
