// The built-in reasoner. When the online AI cannot answer (busy, limit reached, no key), this writes the
// same kind of answer from everything the modules found, so the person always gets a full answer:
// reasoning in points, risks, what is unknown, next steps and a time frame. It is rule-based and says
// so; it never pretends to be the online AI.

import type { EngineResponse } from "./engine.service.js";
import type { AiAnswer } from "./synthesis.service.js";
import type { PathOption } from "./sivi.service.js";

const uniq = (items: string[]): string[] => [...new Set(items.map((s) => s.trim()).filter(Boolean))];
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + ".");

const INTENT_WORDS: Record<string, string> = {
  career: "work and career",
  relationship: "a relationship",
  decision: "a decision",
  conflict: "a conflict",
  health: "health and wellbeing",
  money: "money and finances",
  education: "studies and exams",
  travel: "travel, visa or moving abroad",
  family: "family and home life",
  legal: "a legal matter",
  business: "your business",
  mind: "peace of mind",
  property: "property or a vehicle",
  lost: "something or someone lost",
  unclear: "your situation",
};

const EMOTION_NOTE: Record<string, string> = {
  stressed: "Stress can make problems look bigger than they are. Decide after a short rest, not in the middle of the pressure.",
  anxious: "Worry can make every option look risky. Check what is a fact and what is only a fear.",
  angry: "Anger pushes towards quick, hard actions that are difficult to undo. Wait before you act on it.",
  sad: "A low mood can make good options look pointless. Be kind to yourself and take small steps.",
  confused: "Confusion is a sign that one important fact is missing. Find that fact first.",
};

function timeframeFrom(engine: EngineResponse): number {
  const t = engine.astro.outlook?.timing;
  if (t) {
    const mid = (Date.parse(t.from) + Date.parse(t.to)) / 2;
    const days = Math.round((mid - Date.parse(engine.astro.calculatedAt)) / 86400000);
    if (Number.isFinite(days)) return Math.min(90, Math.max(3, days));
  }
  return 14;
}

export function localAnswer(engine: EngineResponse, score: number): AiAnswer {
  const sim = engine.simulation;
  const best = sim.bestPath;
  const others: PathOption[] = sim.alternatives;
  const topic = INTENT_WORDS[engine.intent.intent] ?? "your situation";

  const points: string[] = [];
  points.push(`This is mostly about ${topic}.`);
  if (sim.context.desiredOutcome) points.push(`${sim.context.inferred ? "What you probably want" : "What you want"}: ${sentence(sim.context.desiredOutcome)}`);
  if (sim.context.knownFacts.length) points.push(`Facts you gave: ${sim.context.knownFacts.slice(0, 3).join("; ")}.`);
  if (sim.context.constraints.length) points.push(`Limits you mentioned: ${sim.context.constraints.slice(0, 3).join("; ")}.`);
  points.push(`The safest useful path looks like: ${sentence(best.action)} (risk ${best.risk}, steadiness ${best.stability}${best.reversible ? ", can be undone" : ", hard to undo"}).`);
  if (others.length) points.push(`Other options: ${others.slice(0, 2).map((o) => o.action).join(" / ")}.`);
  const emo = EMOTION_NOTE[engine.emotion.emotion];
  if (emo && engine.emotion.intensity !== "low") points.push(emo);
  if (engine.silence) points.push("You mention a silence. It can mean many things, so check before you assume.");
  if (engine.route) points.push(`The direct way looks closed, so an indirect, fair route is suggested: ${sentence(engine.route.idea)}`);

  const risks = uniq([...best.downsides, ...others.flatMap((o) => o.downsides.slice(0, 1)), ...(emo && engine.emotion.intensity === "high" ? [cap(emo, 120)] : [])]).slice(0, 3).map((r) => cap(r, 280));
  const keyUnknowns = uniq([...best.uncertainties, ...(engine.silence?.unknowns ?? [])]).slice(0, 3).map((r) => cap(r, 280));

  const steps: string[] = [];
  if (engine.route && engine.route.steps.length) steps.push(...engine.route.steps.slice(0, 3));
  else {
    if (sim.context.inferred) steps.push("Write down in one line what you really want.");
    steps.push(`Go with this path: ${best.action}`);
    if (best.uncertainties[0]) steps.push(`Find out: ${best.uncertainties[0]}`);
  }
  const wait = others.find((o) => o.reversible) ?? others[0];
  if (wait) steps.push(`If things do not improve, switch to: ${wait.action}`);
  steps.push("Come back after the time frame and note what really happened.");

  const verdictWord = score >= 70 ? "looks good" : score >= 45 ? "can work if you are careful" : "needs caution";
  const summary = cap(`${sentence(`Overall it ${verdictWord}`)} ${sentence(best.action)}`.trim(), 600);

  return {
    logicScore: score,
    finalScore: null,
    reasoning: points.map((p) => `• ${p}`).join("\n"),
    astrologyAssessment: null,
    summary,
    advice: cap(best.action, 400),
    risks,
    keyUnknowns,
    nextSteps: steps.slice(0, 4).map((s) => cap(s, 280)),
    timeframeDays: timeframeFrom(engine),
    simulation: null,
    silence: null,
    indirectRoute: null,
  };
}
