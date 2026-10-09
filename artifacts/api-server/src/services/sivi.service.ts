import type { IntentResult, IntentType } from "./ajit.service.js";
import type { EmotionResult } from "./manu.service.js";

/**
 * SIVI - Simulated Intelligent & Variable Intentions.
 *
 * SIVI compares the choices open to a person in a situation, in a structured way. It does NOT
 * predict the future. For every path it lists benefits, downsides and what is still uncertain,
 * then explains why one path may be better than another.
 *
 * Two ways to build the comparison:
 *   - the AI (preferred): it reads the whole situation, so the paths are specific to this person.
 *     `parseAiSimulation` validates what it returns;
 *   - the rule-based fallback below, used when the AI is off or unavailable. It only knows the
 *     intent (AJIT) and the emotion (MANU) plus a few sentences it can pull out of the text, so it
 *     returns sensible general paths for that kind of situation, not a deep simulation. The result
 *     says which one produced it (`source`).
 */

export type Level = "low" | "medium" | "high";

export type SituationContext = {
  /** What the person wants to happen. */
  desiredOutcome: string;
  /** True when the person did not say it and it was guessed from the kind of question. */
  inferred: boolean;
  /** Facts the person stated. */
  knownFacts: string[];
  /** Limits on what the person can do (money, time, people, rules). */
  constraints: string[];
};

export type PathOption = {
  action: string;
  risk: Level;
  stability: Level;
  outcome: "positive" | "negative" | "mixed";
  benefits: string[];
  downsides: string[];
  uncertainties: string[];
  /** Whether the person could undo this path if it turns out wrong. */
  reversible: boolean;
};

export type SimulationResult = {
  context: SituationContext;
  bestPath: PathOption;
  alternatives: PathOption[];
  /** Why the best path may be better than the others, and when another could be. */
  comparison: string;
  source: "rules" | "ai";
};

const ORDER: Record<Level, number> = { low: 1, medium: 2, high: 3 };
const toLevel = (n: number): Level => (n >= 3 ? "high" : n === 2 ? "medium" : "low");
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function evaluateOutcome(risk: number, stability: number): PathOption["outcome"] {
  if (risk <= 1 && stability >= 2) return "positive";
  if (risk >= 3 && stability <= 1) return "negative";
  return "mixed";
}

/** Higher is better: steady and low-risk paths, and ones that can be undone, rank first. */
function pathScore(p: PathOption): number {
  return ORDER[p.stability] - ORDER[p.risk] + (p.reversible ? 0.5 : 0);
}

function pickBest(paths: PathOption[]): number {
  let best = 0;
  paths.forEach((p, i) => {
    if (pathScore(p) > pathScore(paths[best])) best = i;
  });
  return best;
}

// ---------------------------------------------------------------- situation context (rules)

const WISH = /\b(want|wanna|wish|hope|aim|goal|looking to|trying to|would like|chahta|chahti|chahte|chahiye|chaahta|chaahti)\b|चाहता|चाहती|चाहिए|चाहते/i;
const CONSTRAINT =
  /\b(can't|cannot|can not|unable|must|have to|has to|need to|deadline|notice period|budget|loan|emi|debt|savings|visa|limited|only \w+ (left|more)|by (next|the end)|majboor|majboori|zaroori|nahi kar sakta|nahi kar sakti|nahi ho sakta|no money|paise nahi|pressure)\b|मजबूर|ज़रूरी|जरूरी|नहीं कर सकता|नहीं कर सकती/i;
const QUESTION_START = /^(should|shall|can|could|would|will|is|are|do|does|what|when|which|how|why|kya|kab|kaise|kyun|kyu|kaun|kya main)\b/i;

const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const snippet = (s: string, max = 140): string => {
  const t = s.replace(/\s+/g, " ").replace(/[.!?।]+$/, "").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

const isQuestion = (s: string) => /\?$/.test(s) || QUESTION_START.test(s);

const DEFAULT_OUTCOME: Record<IntentType, string> = {
  decision: "A choice you can stand behind, made with enough information",
  relationship: "A healthier, clearer relationship, or a calm and respectful ending",
  conflict: "The disagreement settled without making it worse",
  career: "A career step that improves your situation without needless risk",
  health: "Your health looked after properly, without panic or neglect",
  unclear: "Clarity about what to do next",
};

export function extractContext(text: string, intent: IntentType): SituationContext {
  const sentences = sentencesOf(text);
  const wish = sentences.find((s) => !s.endsWith("?") && WISH.test(s));
  const should = text.match(/\bshould i ([^?.!]{3,90})/i);

  let desiredOutcome = DEFAULT_OUTCOME[intent];
  let inferred = true;
  if (wish) {
    desiredOutcome = snippet(wish);
    inferred = false;
  } else if (should) {
    desiredOutcome = `To know whether to ${snippet(should[1], 90)}, and to do what is best for you`;
    inferred = false;
  }

  const constraints: string[] = [];
  const knownFacts: string[] = [];
  for (const s of sentences) {
    if (s === wish) continue;
    if (CONSTRAINT.test(s)) {
      if (constraints.length < 3) constraints.push(snippet(s));
    } else if (!isQuestion(s) && s.split(/\s+/).length >= 4 && knownFacts.length < 3) {
      knownFacts.push(snippet(s));
    }
  }
  return { desiredOutcome, inferred, knownFacts, constraints };
}

// ---------------------------------------------------------------- general paths (rules)

type Template = {
  action: string;
  benefits: string[];
  downsides: string[];
  uncertainties: string[];
  baseRisk: number;
  baseStability: number;
  reversible: boolean;
  tags?: ("confront" | "bold")[];
};

const TEMPLATES: Record<IntentType, Template[]> = {
  relationship: [
    {
      action: "Talk calmly and clear up the misunderstanding",
      benefits: ["Problems get named instead of building up", "Keeps the relationship open if both want it"],
      downsides: ["May feel uncomfortable or reopen sore points"],
      uncertainties: ["Whether the other person is ready to listen"],
      baseRisk: 1, baseStability: 3, reversible: true,
    },
    {
      action: "Take some space and reflect before deciding",
      benefits: ["Lets strong feelings settle", "Gives you time to see what you really want"],
      downsides: ["Silence can be read as distance or lack of care"],
      uncertainties: ["How long the space should last"],
      baseRisk: 2, baseStability: 2, reversible: true,
    },
    {
      action: "End the relationship respectfully",
      benefits: ["Ends an unhappy situation", "Frees you to move on"],
      downsides: ["Hard to undo", "Likely to hurt, for you and for them"],
      uncertainties: ["Whether the problems could have been solved by talking"],
      baseRisk: 3, baseStability: 1, reversible: false,
    },
  ],
  conflict: [
    {
      action: "Address the issue directly, with facts and a calm tone",
      benefits: ["Settles the real point", "Shows you are serious but fair"],
      downsides: ["Can flare up if the other side is not ready"],
      uncertainties: ["How the other person will react"],
      baseRisk: 2, baseStability: 3, reversible: true, tags: ["confront"],
    },
    {
      action: "Let it rest for now and watch how things go",
      benefits: ["Avoids a fight while emotions are high", "Costs nothing"],
      downsides: ["The problem may keep growing", "You may feel unheard"],
      uncertainties: ["Whether it fades or gets worse"],
      baseRisk: 1, baseStability: 2, reversible: true,
    },
    {
      action: "Take it to someone with authority (manager, elder, mediator)",
      benefits: ["A neutral person can decide", "Creates a record if needed"],
      downsides: ["Hard to take back once started", "Can damage trust with the other side"],
      uncertainties: ["Whether that person will be fair and will act"],
      baseRisk: 3, baseStability: 2, reversible: false, tags: ["confront"],
    },
  ],
  decision: [
    {
      action: "Collect the missing information before deciding",
      benefits: ["Fewer surprises", "A decision you can explain later"],
      downsides: ["Takes time, and some doubt will always remain"],
      uncertainties: ["Whether the extra information will change anything"],
      baseRisk: 1, baseStability: 3, reversible: true,
    },
    {
      action: "Take a calculated risk and act now",
      benefits: ["Momentum, and a chance that may not return"],
      downsides: ["Mistakes are costlier if the facts are thin"],
      uncertainties: ["Things you cannot know yet"],
      baseRisk: 2, baseStability: 2, reversible: false, tags: ["bold"],
    },
    {
      action: "Postpone the decision",
      benefits: ["Removes pressure for the moment"],
      downsides: ["The option may disappear", "Worry continues"],
      uncertainties: ["Whether time will make it clearer or only later"],
      baseRisk: 2, baseStability: 1, reversible: true,
    },
  ],
  career: [
    {
      action: "Prepare first (skills, savings, options), then make the move",
      benefits: ["A safer landing", "Stronger position when you move"],
      downsides: ["Slower", "The chance may pass"],
      uncertainties: ["How long the preparation really needs"],
      baseRisk: 1, baseStability: 3, reversible: true,
    },
    {
      action: "Switch or quit right away",
      benefits: ["Fast change", "Ends a situation you are unhappy with"],
      downsides: ["Income and security at risk", "Hard to reverse"],
      uncertainties: ["What the new situation will really be like"],
      baseRisk: 3, baseStability: 1, reversible: false, tags: ["bold"],
    },
    {
      action: "Stay and strengthen your current position",
      benefits: ["Keeps income steady", "Time to look around"],
      downsides: ["The cause of your unhappiness may remain"],
      uncertainties: ["Whether things there can really improve"],
      baseRisk: 1, baseStability: 2, reversible: true,
    },
  ],
  health: [
    {
      action: "See a qualified professional",
      benefits: ["A proper diagnosis and advice", "Peace of mind"],
      downsides: ["Costs time and money"],
      uncertainties: ["What the tests will show"],
      baseRisk: 1, baseStability: 3, reversible: true,
    },
    {
      action: "Manage it yourself with routine changes (sleep, food, rest)",
      benefits: ["Cheap and quick to start", "Helps with mild problems"],
      downsides: ["May miss something that needs treatment"],
      uncertainties: ["Whether it is really mild"],
      baseRisk: 2, baseStability: 2, reversible: true,
    },
    {
      action: "Ignore the symptoms for now",
      benefits: ["No effort today"],
      downsides: ["A treatable problem may get worse"],
      uncertainties: ["Whether it will pass by itself"],
      baseRisk: 3, baseStability: 1, reversible: true,
    },
  ],
  unclear: [
    {
      action: "Wait and observe",
      benefits: ["Costs nothing", "More becomes clear with time"],
      downsides: ["Nothing moves forward"],
      uncertainties: ["How long to wait"],
      baseRisk: 1, baseStability: 2, reversible: true,
    },
    {
      action: "Find clarity first: write down what you want and what you know",
      benefits: ["Turns a vague worry into a concrete question"],
      downsides: ["Needs some effort and honesty with yourself"],
      uncertainties: ["Whether you already have the answers"],
      baseRisk: 1, baseStability: 3, reversible: true,
    },
    {
      action: "Take one small, low-cost step",
      benefits: ["Makes progress with little risk", "Gives new information"],
      downsides: ["May be a step in a direction you later drop"],
      uncertainties: ["Which step helps most"],
      baseRisk: 2, baseStability: 2, reversible: true,
    },
  ],
};

function why(best: PathOption, alt: PathOption): string {
  const bits: string[] = [];
  if (ORDER[best.risk] < ORDER[alt.risk]) bits.push("carries less risk");
  if (ORDER[best.stability] > ORDER[alt.stability]) bits.push("is steadier");
  if (best.reversible && !alt.reversible) bits.push("can still be changed if it goes wrong, which the other cannot");
  if (bits.length === 0) return `"${alt.action}" is close behind; the difference is small, so personal preference can decide`;
  return `compared with "${alt.action}", it ${bits.join(" and ")}`;
}

/** Rule-based explanation, used when the AI did not give one. */
export function compareText(best: PathOption, alternatives: PathOption[], note?: string): string {
  const parts = alternatives.map((a) => why(best, a));
  const lead = `"${best.action}" ranks first`;
  const body = parts.length ? `: ${parts.join("; ")}.` : ".";
  return `${lead}${body}${note ? ` ${note}` : ""} This is a comparison of paths, not a prediction.`;
}

export function simulatePaths(intent: IntentResult, emotion: EmotionResult, text = ""): SimulationResult {
  const context = extractContext(text, intent.intent);
  const strained = emotion.emotion !== "calm" && emotion.intensity !== "low";
  const heated = emotion.emotion === "angry" || (strained && emotion.intensity === "high");
  const avoiding = intent.stance === "avoid";

  const paths: PathOption[] = TEMPLATES[intent.intent].map((t) => {
    let risk = t.baseRisk;
    if (!t.reversible && (heated || strained)) risk += 1;
    if (t.tags?.includes("confront") && (avoiding || emotion.emotion === "angry")) risk += 1;
    if (t.tags?.includes("bold") && context.constraints.length >= 2) risk += 1;
    risk = clamp(risk, 1, 3);
    const stability = clamp(t.baseStability, 1, 3);
    return {
      action: t.action,
      risk: toLevel(risk),
      stability: toLevel(stability),
      outcome: evaluateOutcome(risk, stability),
      benefits: t.benefits,
      downsides: t.downsides,
      uncertainties: t.uncertainties,
      reversible: t.reversible,
    };
  });

  const bestIdx = pickBest(paths);
  const bestPath = paths[bestIdx];
  const alternatives = paths.filter((_, i) => i !== bestIdx);
  const notes: string[] = [];
  if (heated || strained) notes.push(`Because your words sound ${emotion.emotion} (${emotion.intensity}), moves that cannot be undone are rated riskier.`);
  if (avoiding) notes.push("You seem to want to avoid confrontation, so confrontational paths are rated riskier.");
  if (context.constraints.length >= 2) notes.push("You named several limits, so bold moves are rated riskier.");
  if (context.knownFacts.length === 0) notes.push("Few concrete facts were given, so these are general paths for this kind of situation.");
  return { context, bestPath, alternatives, comparison: compareText(bestPath, alternatives, notes.join(" ")), source: "rules" };
}

// ---------------------------------------------------------------- the AI's version

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const list = (v: unknown, n: number, max: number): string[] =>
  Array.isArray(v) ? v.map((x) => text(x, max)).filter((x): x is string => x !== null).slice(0, n) : [];
const level = (v: unknown): Level => (v === "low" || v === "medium" || v === "high" ? v : "medium");

/**
 * Validates the paths the AI returned (the object holds `situationContext`, `paths`, `bestPath`
 * and `pathComparison`). Returns null when there are fewer than two usable paths.
 */
export function parseAiSimulation(o: Record<string, unknown>): SimulationResult | null {
  if (!Array.isArray(o.paths)) return null;
  const paths: PathOption[] = [];
  for (const raw of o.paths.slice(0, 4)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const action = text(r.action, 220);
    if (!action) continue;
    const risk = level(r.risk);
    const stability = level(r.stability);
    paths.push({
      action,
      risk,
      stability,
      outcome: evaluateOutcome(ORDER[risk], ORDER[stability]),
      benefits: list(r.benefits, 3, 220),
      downsides: list(r.downsides, 3, 220),
      uncertainties: list(r.uncertainties, 2, 220),
      reversible: r.reversible === true,
    });
  }
  if (paths.length < 2) return null;

  // The AI names its pick; if that is missing or out of range, the same scoring as the rules decides.
  const named = typeof o.bestPath === "number" && Number.isInteger(o.bestPath) && o.bestPath >= 0 && o.bestPath < paths.length ? o.bestPath : null;
  const bestIdx = named ?? pickBest(paths);
  const bestPath = paths[bestIdx];
  const alternatives = paths.filter((_, i) => i !== bestIdx);

  const c = (o.situationContext && typeof o.situationContext === "object" ? o.situationContext : {}) as Record<string, unknown>;
  const desired = text(c.desiredOutcome, 300);
  return {
    context: {
      desiredOutcome: desired ?? "",
      inferred: desired === null,
      knownFacts: list(c.knownFacts, 4, 220),
      constraints: list(c.constraints, 4, 220),
    },
    bestPath,
    alternatives,
    comparison: text(o.pathComparison, 900) ?? compareText(bestPath, alternatives),
    source: "ai",
  };
}

/** Fills gaps in the AI's context from the rule-based one (e.g. when it left the desired outcome empty). */
export function mergeContext(ai: SimulationResult, rules: SimulationResult): SimulationResult {
  const c = ai.context;
  if (c.desiredOutcome) return ai;
  return { ...ai, context: { ...c, desiredOutcome: rules.context.desiredOutcome, inferred: true } };
}
