// What a question is really about, in the language of the houses.
//
// A house, a planet and a sign each stand for many things (the 10th is work, status AND the father;
// Venus is love, comfort AND vehicles). A question seldom needs all of them. The approach is a
// Venn diagram: find the themes the question touches, list the houses and planets of each theme,
// and give most weight to what the themes SHARE; significations that do not belong to the question
// are left out. The diagram itself is never shown to the person: it only decides what the reading
// weighs, and the AI is given the same tables to do the same refinement on the whole text.

import type { IntentType } from "./ajit.service.js";

export type DivisionalUse = { chart: "D3" | "D4" | "D7" | "D9" | "D10" | "D12"; house: number; purpose: string };

export type Subtopic = {
  id: string;
  label: string;
  /** Matches the words of the question (English, Hinglish, Hindi). */
  keywords: RegExp;
  /** Houses that carry this theme, most important first. */
  houses: number[];
  /** Natural significators (karakas) of the theme. */
  karakas: string[];
  /** The divisional chart that shows the result of this theme, and the house to read in it. */
  varga?: DivisionalUse;
  /** The kind of question this theme usually belongs to, used to break ties. */
  intent?: IntentType;
};

const w = (words: string) => new RegExp(`\\b(?:${words})\\b`, "i");

export const SUBTOPICS: Subtopic[] = [
  { id: "marriage", label: "marriage", keywords: w("marry|marriage|married|shaadi|shadi|vivah|wedding|engagement|engaged|spouse|husband|wife|rishta|proposal|विवाह|शादी"), houses: [7, 2, 11], karakas: ["Venus", "Jupiter"], varga: { chart: "D9", house: 7, purpose: "Marriage & partnership" }, intent: "relationship" },
  { id: "love", label: "love", keywords: w("love|pyaar|pyar|girlfriend|boyfriend|crush|dating|breakup|break up|romance|ex|प्यार"), houses: [5, 7, 11], karakas: ["Venus"], varga: { chart: "D9", house: 7, purpose: "Love & partnership" }, intent: "relationship" },
  { id: "children", label: "children", keywords: w("child|children|baby|pregnan\\w*|conceive|conception|son|daughter|beta|beti|santan|bachcha|bachche|संतान"), houses: [5, 9, 2], karakas: ["Jupiter"], varga: { chart: "D7", house: 5, purpose: "Children" } },
  { id: "property", label: "property & home", keywords: w("property|house|flat|apartment|home|land|plot|ghar|makan|zameen|real estate|construction|vehicle|car|gaadi|gadi|bike|scooter|घर|जमीन"), houses: [4, 11, 2], karakas: ["Mars", "Venus", "Saturn"], varga: { chart: "D4", house: 4, purpose: "Property, home & vehicles" } },
  { id: "mother", label: "mother", keywords: w("mother|mom|maa|mummy|mata|माँ|मां"), houses: [4], karakas: ["Moon"], varga: { chart: "D12", house: 4, purpose: "Mother" } },
  { id: "father", label: "father", keywords: w("father|dad|papa|pitaji|baap|पिता"), houses: [9, 10], karakas: ["Sun"], varga: { chart: "D12", house: 9, purpose: "Father" } },
  { id: "siblings", label: "siblings & courage", keywords: w("brother|sister|sibling|bhai|behen|bhaiya|didi|courage|competition|effort|himmat"), houses: [3, 11], karakas: ["Mars"], varga: { chart: "D3", house: 3, purpose: "Siblings, courage & effort" } },
  { id: "job", label: "job & career", keywords: w("job|career|promotion|boss|office|naukri|interview|resume|appraisal|transfer|resign\\w*|salary hike|workplace|नौकरी"), houses: [10, 6, 11, 2], karakas: ["Saturn", "Sun", "Mercury"], varga: { chart: "D10", house: 10, purpose: "Profession & status" }, intent: "career" },
  { id: "business", label: "business", keywords: w("business|startup|start up|shop|dukaan|vyapar|vyapaar|partnership|client|customer|franchise|trade|व्यापार"), houses: [7, 10, 11], karakas: ["Mercury", "Jupiter"], varga: { chart: "D10", house: 10, purpose: "Business & status" }, intent: "career" },
  { id: "money", label: "money", keywords: w("money|income|profit|invest\\w*|paisa|paise|dhan|wealth|lottery|stock|stocks|shares|savings|earn\\w*|धन"), houses: [2, 11, 5, 9], karakas: ["Jupiter", "Venus"] },
  { id: "debt", label: "loan & debt", keywords: w("loan|debt|emi|borrow\\w*|karz|karza|udhaar|udhar|credit card|दैन"), houses: [6, 8, 12], karakas: ["Saturn"] },
  { id: "education", label: "education", keywords: w("exam|study|studies|college|degree|university|admission|padhai|result|course|school|scholarship|neet|jee|upsc|परीक्षा|पढ़ाई"), houses: [4, 5, 9], karakas: ["Mercury", "Jupiter"], varga: { chart: "D9", house: 5, purpose: "Learning & results" }, intent: "career" },
  { id: "health", label: "health", keywords: w("disease|illness|bimari|bimar|health|sehat|hospital|treatment|surgery|operation|injury|fever|pain|dard|symptom\\w*|बीमारी|सेहत"), houses: [1, 6, 8], karakas: ["Sun", "Moon", "Mars"], intent: "health" },
  { id: "foreign", label: "foreign & travel", keywords: w("abroad|foreign|videsh|visa|travel|immigrat\\w*|relocat\\w*|settle abroad|overseas|pardes|विदेश"), houses: [12, 9, 3], karakas: ["Rahu", "Saturn", "Moon"] },
  { id: "legal", label: "legal & disputes", keywords: w("lawsuit|court|case|police|legal|dispute|fight|enemy|rival|litigation|vakil|advocate|jhagda|ladhai|मुकदमा|झगड़ा"), houses: [6, 7, 8, 12], karakas: ["Saturn", "Mars"], varga: { chart: "D3", house: 3, purpose: "Courage & allies" }, intent: "conflict" },
  { id: "spiritual", label: "spiritual life", keywords: w("spiritual\\w*|meditation|guru|moksha|dharma|pooja|puja|temple|sadhana|ashram|आध्यात्म"), houses: [9, 12, 5], karakas: ["Ketu", "Jupiter"] },
  { id: "fame", label: "fame & creativity", keywords: w("fame|famous|artist|actor|acting|singer|creator|youtube|followers|influencer|writer|author|music|film"), houses: [5, 10, 11], karakas: ["Sun", "Venus"], varga: { chart: "D10", house: 10, purpose: "Recognition & achievement" } },
];

export type Focus = {
  /** The themes found in the text (their ids and labels), strongest first. */
  themes: { id: string; label: string }[];
  primaryHouse: number | null;
  /** Houses shared by two or more themes: the "overlap" of the Venn diagram. */
  coreHouses: number[];
  /** All houses of the matched themes, most shared first. */
  houses: number[];
  karakas: string[];
  vargas: DivisionalUse[];
};

/** Which themes does the text touch, and where do they overlap? */
export function detectFocus(text: string, intent: IntentType): Focus {
  const hits = SUBTOPICS.map((s, order) => {
    const m = text.match(new RegExp(s.keywords.source, "gi"));
    return { s, order, n: m ? new Set(m.map((x) => x.toLowerCase())).size : 0 };
  })
    .filter((h) => h.n > 0)
    // More distinct words first; on a tie prefer the theme that fits the kind of question.
    .sort((a, b) => b.n - a.n || Number(b.s.intent === intent) - Number(a.s.intent === intent) || a.order - b.order)
    .slice(0, 3);

  if (hits.length === 0) return { themes: [], primaryHouse: null, coreHouses: [], houses: [], karakas: [], vargas: [] };

  const count = new Map<number, number>();
  hits.forEach((h, rank) => h.s.houses.forEach((house, i) => count.set(house, (count.get(house) ?? 0) + (i === 0 ? 1.2 : 1) * (rank === 0 ? 1.2 : 1))));
  const sharedBy = new Map<number, number>();
  hits.forEach((h) => h.s.houses.forEach((house) => sharedBy.set(house, (sharedBy.get(house) ?? 0) + 1)));
  const coreHouses = [...sharedBy.entries()].filter(([, n]) => n >= 2).map(([h]) => h);
  const houses = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);

  const top = hits[0].s;
  // The leading theme's own first house, unless the overlap of the themes points somewhere more specific.
  const primaryHouse = coreHouses.length > 0 ? coreHouses.sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0))[0] : top.houses[0];
  const karakas = [...new Set(hits.flatMap((h) => h.s.karakas))].slice(0, 4);
  const vargas = hits.map((h) => h.s.varga).filter((v): v is DivisionalUse => v !== undefined);
  return { themes: hits.map((h) => ({ id: h.s.id, label: h.s.label })), primaryHouse, coreHouses, houses, karakas, vargas };
}

/** What each house stands for (given to the AI, never shown). */
export const HOUSE_SIGNIFICATIONS: Record<number, string> = {
  1: "self, body, vitality, the querent, beginnings",
  2: "money, savings, family, speech, food",
  3: "courage, effort, siblings, short travel, communication, skills",
  4: "home, mother, property, vehicles, inner peace, education",
  5: "children, creativity, intelligence, romance, speculation, merit",
  6: "enemies, disputes, debts, illness, service, daily work, competition",
  7: "marriage, partners, business partners, open opponents, trade",
  8: "obstacles, sudden events, inheritance, secrets, longevity, research",
  9: "fortune, father, teachers, higher learning, dharma, long journeys",
  10: "career, status, authority, public life, action",
  11: "gains, income, fulfilment of desires, friends, elder siblings, networks",
  12: "loss, expenses, foreign lands, isolation, sleep, spirituality, hospitals",
};

export const PLANET_KARAKATVA: Record<string, string> = {
  Sun: "soul, authority, government, father, vitality, confidence, ego",
  Moon: "mind, emotions, mother, public, nourishment, travel, fluctuation",
  Mars: "energy, courage, land, siblings, conflict, surgery, drive",
  Mercury: "intellect, speech, trade, communication, skills, analysis",
  Jupiter: "wisdom, children, wealth, teachers, faith, expansion, guidance",
  Venus: "love, marriage, comfort, arts, vehicles, luxury, partnership",
  Saturn: "discipline, delay, work, service, longevity, karma, hardship",
  Rahu: "foreign, ambition, obsession, technology, illusion, sudden rise",
  Ketu: "detachment, spirituality, past karma, loss, insight",
};

export const SIGN_KARAKATVA: string[] = [
  "Aries: initiative, head, leadership, speed, impatience",
  "Taurus: resources, face and throat, stability, comfort, stubbornness",
  "Gemini: communication, arms and lungs, curiosity, duality, trade",
  "Cancer: home, chest, care, emotion, mother, moodiness",
  "Leo: authority, heart, pride, recognition, generosity",
  "Virgo: service, digestion, detail, analysis, criticism",
  "Libra: balance, kidneys, partnership, negotiation, indecision",
  "Scorpio: depth, secrets, reproductive organs, transformation, intensity",
  "Sagittarius: belief, thighs, travel, teachers, optimism, overreach",
  "Capricorn: ambition, knees and bones, structure, patience, caution",
  "Aquarius: networks, calves, innovation, detachment, groups",
  "Pisces: imagination, feet, compassion, escape, spirituality",
];
