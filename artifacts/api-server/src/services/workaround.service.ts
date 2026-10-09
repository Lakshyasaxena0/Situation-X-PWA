// AJIT's "indirect route": when the straight road looks closed, a clever but ethical way round it.
//
// AJIT spots words that say the direct way is blocked ("they won't allow it", "nahi ho sakta",
// "I can't afford it", "rejected"). Then it offers a different ROUTE to the same goal: a different
// person to ask, a smaller first step, an official channel, a trial, a way to remove the blocker.
//
// The route must stay honest and fair: no lying, no pressure or manipulation, no breaking rules or
// laws, and nothing that harms or tricks another person. The AI writes the route for the person's own
// facts (see synthesis.service.ts); the ethical filter checks what it wrote. Without the AI, AJIT gives
// a general route for the topic.

import type { IntentType } from "./ajit.service.js";

export type IndirectRoute = {
  /** What seems to be in the way, in the person's terms. */
  blocker: string;
  /** The words that made AJIT think the direct way is closed. */
  cues: string[];
  /** The idea in one or two sentences: how to reach the same goal another way. */
  idea: string;
  /** Concrete steps, in order. */
  steps: string[];
  /** Why this route is fair to everyone involved. */
  fairness: string;
  source: "rules" | "ai";
};

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");

/** Phrases that say the straight way is closed. English, Hinglish and Hindi. */
const BLOCK_CUES: RegExp[] = [
  /\b(?:can'?t|cannot|cant|couldn'?t|unable to)\s+(?:get|do|afford|go|meet|talk|convince|make|find|leave|take|have|join|apply|pay|reach|enter|travel|buy|book|continue|manage|persuade|change)\b/,
  /\b(?:not|never|won'?t|wont|doesn'?t|don'?t|dont)\s+(?:allowed?|permit(?:ted)?|let(?:ting)?\s+me|agree(?:ing)?|approve[sd]?|accept(?:ing)?|giv(?:e|ing)\s+(?:me\s+)?permission)\b/,
  /\bno\s+(?:permission|approval|way|option|money|budget|seat|vacancy|chance|scope|time|support|access|route|leave)\b/,
  /\b(?:reject(?:ed|s|ion)?|denied|declined|refus(?:e|ed|es|ing|al)|turned\s+down|said\s+no|not\s+possible|impossible|not\s+approved|stuck|blocked|no\s+use)\b/,
  /\bnahi\s+ho\s+(?:sakta|sakti|payega|payegi|paa?ta|pati)\b/, /\bnhi\s+ho\s+(?:sakta|sakti|paa?ta|pati)\b/,
  /\b(?:mana|manaa)\s+(?:kar|kr|kiya|karte|karti|kar\s+diya)\b/, /\b(?:allow|ijazat|permission|ijaazat)\s+(?:nahi|nhi)\b/, /\b(?:manjoori|manzoori)\s+(?:nahi|nhi)\b/,
  /\b(?:paise|paisa|budget|time|samay)\s+(?:nahi|nhi)\b/, /\bkoi\s+(?:raasta|rasta|option|tarika|chance)\s+(?:nahi|nhi)\b/, /\braasta\s+(?:nahi|nhi|band)\b/,
  /\bnahi\s+(?:maan|man)(?:te|ti|ta)?\b/, /\bnahi\s+mil\s+(?:raha|rahi|rahi|paya|payi|sakta)\b/, /\bnahi\s+(?:milega|milegi)\b/, /\bnaa?\s+bol\s+diya\b/,
  /\bmushkil\s+hai\b/, /\bpossible\s+nahi\b/, /\bsambhav\s+nahi\b/, /\breject\s+(?:kar|ho)\b/, /\b(?:atak|atka|atki|fas)\s+(?:gaya|gayi|gaye|raha|rahi)\b/,
  /नहीं\s+हो\s+सकता|मना\s+कर|इजाज़त\s+नहीं|इजाजत\s+नहीं|परमिशन\s+नहीं|रास्ता\s+नहीं|पैसे\s+नहीं|मंज़ूरी\s+नहीं|अटक/,
];

/** The words that show the direct way is closed, or null when nothing in the question says so. */
export function detectObstacle(input: string): string[] | null {
  const text = norm(input);
  const cues: string[] = [];
  for (const re of BLOCK_CUES) {
    const g = new RegExp(re.source, "gu");
    for (const m of text.matchAll(g)) {
      const c = m[0].trim();
      if (c && !cues.includes(c)) cues.push(c);
      if (cues.length >= 6) return cues;
    }
  }
  return cues.length ? cues : null;
}

type Template = { idea: string; steps: string[] };

const TEMPLATES: Record<IntentType, Template> = {
  relationship: {
    idea: "Do not push the closed door. Change who asks, when and how: a calm talk at a better moment, or through someone they trust, so they can say yes without losing face.",
    steps: [
      "Find out the real reason behind the no: ask what worries them, then listen without arguing.",
      "Answer that worry with facts or a small, time-limited trial instead of a promise.",
      "Ask someone they respect, such as an elder or a common friend, to help the talk, openly and with your knowledge.",
      "Give it time. A relaxed second conversation often goes better than a pushed first one.",
    ],
  },
  conflict: {
    idea: "If a direct talk or a fight cannot work, move the matter to a fair third place: a mediator, an official complaint route, or a written record, and keep your own side calm.",
    steps: [
      "Write down the facts with dates and keep any messages that are yours to keep.",
      "Ask a neutral person, such as an elder, a manager, HR or a counsellor, to sit with both of you.",
      "If rights or safety are involved, use the proper channel (a written complaint, a lawyer's notice, the police) instead of a private confrontation.",
      "Say what you want to happen next in one calm sentence, not what you want the other person to feel.",
    ],
  },
  career: {
    idea: "When the front door is closed, look for the side door that still leads to the same room: a nearby role, an internal move, a referral, a skill-proof, or a smaller first step toward the goal.",
    steps: [
      "Name what the closed door was really for (money, growth, learning, security) and list other ways to get that same thing.",
      "Ask someone already inside, such as a colleague, senior or alumnus, how people actually got in or got approved.",
      "Build one visible proof of ability (a small project, a certificate, a trial task) so the next yes is easier.",
      "Apply to two or three nearby options in parallel so one refusal does not stop you.",
    ],
  },
  health: {
    idea: "If one route to care or a habit is blocked, find another honest one: a different doctor or clinic, a government or low-cost scheme, a smaller daily step, or a family helper.",
    steps: [
      "Ask the clinic or hospital about payment plans, government schemes or a lower-cost option before dropping treatment.",
      "Take a second opinion or a tele-consultation if a visit is hard.",
      "Break the plan into a very small step you can do today, then build up.",
      "If symptoms are severe or sudden, do not wait for the better route: go for urgent care.",
    ],
  },
  decision: {
    idea: "If the option you wanted is not possible, do not choose between yes and no only. Look for a third option: a smaller version, a delay with a date, a trial, or a different way to reach the same aim.",
    steps: [
      "Write the goal behind the blocked option in one line.",
      "List three other ways to get closer to that goal, even partly.",
      "Pick the one you can test cheaply and reverse easily, and try it for a short, fixed time.",
      "Ask the person who decides what would make them say yes, then work on exactly that.",
    ],
  },
  unclear: {
    idea: "When the straight road is closed, first find out what exactly is closing it, then look for another honest way to the same goal: a different person, a smaller step, or a fair trial.",
    steps: [
      "Say in one line what you want and what is stopping it.",
      "Ask the person or office that decides what they would need to say yes.",
      "List two or three other ways to reach the same result, and try the cheapest first.",
    ],
  },
};

const FAIRNESS = "This route works in the open: no lying, no pressure, no rule-breaking, and nobody is tricked or harmed.";

/** A general route for the topic, used when the AI is off or unavailable. */
export function ruleRoute(intent: IntentType, cues: string[]): IndirectRoute {
  const t = TEMPLATES[intent] ?? TEMPLATES.unclear;
  return { blocker: `The direct way looks closed ("${cues[0]}").`, cues, idea: t.idea, steps: [...t.steps], fairness: FAIRNESS, source: "rules" };
}

const clean = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Merges the AI's route into the rules' one. Anything unusable leaves the rules' route unchanged. */
export function mergeRoute(base: IndirectRoute, raw: unknown): IndirectRoute {
  if (!raw || typeof raw !== "object") return base;
  const o = raw as { blocker?: unknown; idea?: unknown; steps?: unknown; fairness?: unknown };
  const idea = clean(o.idea, 500);
  const steps = Array.isArray(o.steps) ? o.steps.map((s) => clean(s, 300)).filter((s): s is string => s !== null).slice(0, 5) : [];
  if (!idea || steps.length < 2) return base;
  return {
    ...base,
    blocker: clean(o.blocker, 300) ?? base.blocker,
    idea,
    steps,
    fairness: clean(o.fairness, 300) ?? base.fairness,
    source: "ai",
  };
}

/** All the text of a route, for the output safety check. */
export function routeTexts(r: IndirectRoute): string[] {
  return [r.blocker, r.idea, ...r.steps, r.fairness];
}

export function describeRoute(r: IndirectRoute): string {
  return `The direct way looks closed (${r.cues.map((c) => `"${c}"`).join(", ")}).`;
}
