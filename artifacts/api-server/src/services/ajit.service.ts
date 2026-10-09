// AJIT: reads the question and decides what it is about (its intent).
//
// It uses the vocabulary in shared/constants/vocabulary.ts and the context-aware matcher in
// shared/utils/vocabularyMatcher.ts, so it understands negation ("I don't want to fight",
// "dard nahi hai"), intensity ("bahut"), clauses and questions, in English, Hinglish and Hindi.
// It is still word based: the AI re-reads the whole text for meaning. The evidence it returns
// lists every word that counted, so the decision can always be checked.

import { INTENT_VOCABULARY } from "../shared/constants/vocabulary.js";
import { matchVocabulary, type KeyScore } from "../shared/utils/vocabularyMatcher.js";

export type IntentType =
  | "decision"
  | "relationship"
  | "conflict"
  | "career"
  | "health"
  | "unclear";

export type IntentResult = {
  intent: IntentType;
  confidence: "low" | "medium" | "high";
  /** Weighted evidence for the chosen intent (not a plain word count). */
  score: number;
  /** A second topic the question clearly touches, e.g. a career question asked as a decision. */
  secondary?: IntentType;
  /** "avoid" when the person says they do NOT want what they name ("I don't want to fight"). */
  stance?: "avoid";
};

export type IntentAnalysis = {
  result: IntentResult;
  /** Every intent that had evidence, strongest first, with the words that counted. */
  ranking: KeyScore[];
};

const DOMAIN: IntentType[] = ["relationship", "conflict", "career", "health"];
const round1 = (n: number) => Math.round(n * 10) / 10;

/** "decision" describes the FORM of a question ("should I..."); a real topic, when present, wins. */
function pickIntent(ranking: KeyScore[]): { intent: IntentType; secondary?: IntentType; score: number; margin: number } {
  const byKey = new Map(ranking.map((r) => [r.key as IntentType, r]));
  const decision = byKey.get("decision")?.score ?? 0;
  const domain = ranking.filter((r) => DOMAIN.includes(r.key as IntentType));
  const topDomain = domain[0];

  if (topDomain && topDomain.score >= 1 && decision < topDomain.score + 2) {
    const runnerUp = domain[1] && domain[1].score >= topDomain.score * 0.6 ? (domain[1].key as IntentType) : undefined;
    const secondary = decision >= 1 ? ("decision" as IntentType) : runnerUp;
    const others = ranking.filter((r) => r.key !== topDomain.key && r.key !== "decision").map((r) => r.score);
    return { intent: topDomain.key as IntentType, secondary, score: topDomain.score, margin: topDomain.score - Math.max(0, ...others) };
  }
  const top = ranking[0];
  if (!top || top.score < 1) return { intent: "unclear", score: 0, margin: 0 };
  const next = ranking[1]?.score ?? 0;
  const secondary = ranking[1] && ranking[1].score >= top.score * 0.6 ? (ranking[1].key as IntentType) : undefined;
  return { intent: top.key as IntentType, secondary, score: top.score, margin: top.score - next };
}

function confidenceOf(score: number, margin: number): IntentResult["confidence"] {
  let level = score >= 4 || (score >= 3 && margin >= 2) ? 2 : score >= 2 ? 1 : 0;
  if (margin < 0.5 && level > 0) level -= 1; // two topics nearly tied: less sure
  return level >= 2 ? "high" : level === 1 ? "medium" : "low";
}

export function detectIntent(input: string): IntentAnalysis {
  if (!input || input.length < 10) return { result: { intent: "unclear", confidence: "low", score: 0 }, ranking: [] };
  const { ranking, avoided } = matchVocabulary(input, INTENT_VOCABULARY);
  const { intent, secondary, score, margin } = pickIntent(ranking);
  if (intent === "unclear") return { result: { intent: "unclear", confidence: "low", score: 0 }, ranking };
  const result: IntentResult = { intent, confidence: confidenceOf(score, margin), score: round1(score) };
  if (secondary) result.secondary = secondary;
  if (avoided.includes(intent)) result.stance = "avoid";
  return { result, ranking };
}

export function analyzeIntent(input: string): IntentResult {
  return detectIntent(input).result;
}
