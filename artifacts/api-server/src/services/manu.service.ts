// MANU: reads the emotional signals in the words and estimates how strong they are.
//
// It does NOT diagnose anyone. "High" means the text sounds intense; it says nothing about a mental
// health condition. It works from the person's words only (shared/constants/vocabulary.ts and the
// matcher in shared/utils/vocabularyMatcher.ts) and understands:
//   - negation: "I am not worried" is not worry;
//   - phrases: "gusse mein", "bura lag raha hai", "samajh nahi aa raha";
//   - time: "I was angry yesterday" counts less than "I am angry now";
//   - masking: "main theek hoon" but distress everywhere else is read as distress;
//   - overall pattern: several different feelings, "!", CAPITALS and absolutes ("always",
//     "nothing") raise the intensity, not just one strong word.
// The AI re-reads the whole text for tone it cannot see here (sarcasm, humour).

import { CRISIS_VOCABULARY, EMOTION_VOCABULARY, INTENSITY_CUES } from "../shared/constants/vocabulary.js";
import { matchVocabulary, type KeyScore } from "../shared/utils/vocabularyMatcher.js";

export type EmotionType = "calm" | "stressed" | "anxious" | "angry" | "sad" | "confused";

export type EmotionResult = {
  emotion: EmotionType;
  intensity: "low" | "medium" | "high";
  /** Weighted evidence for the chosen emotion (not a plain word count). */
  score: number;
  /** A second feeling that is nearly as strong, e.g. anxious and stressed together. */
  secondary?: EmotionType;
  /** The person says they are fine, but the rest of the message shows distress. */
  masked?: boolean;
  /** The text contains words that may point to a person in danger; the answer must be written with care. */
  crisis?: boolean;
};

export type EmotionAnalysis = {
  result: EmotionResult;
  ranking: KeyScore[];
  /** Human-readable notes about how the estimate was reached (masking, intensity cues, ...). */
  notes: string[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
/** When two feelings tie, the more specific one wins. */
const TIE_ORDER: EmotionType[] = ["angry", "anxious", "sad", "stressed", "confused", "calm"];
/** Calm words count this much when distress words are present ("I am fine" can be a mask). */
const MASKED_CALM_FACTOR = 0.3;
const DISTRESS_THRESHOLD = 1.5;

export function detectEmotion(input: string): EmotionAnalysis {
  const empty: EmotionAnalysis = { result: { emotion: "confused", intensity: "low", score: 0 }, ranking: [], notes: [] };
  if (!input || input.length < 10) return empty;

  const { ranking } = matchVocabulary(input, EMOTION_VOCABULARY, { context: true });
  const crisis = matchVocabulary(input, CRISIS_VOCABULARY).ranking.length > 0;
  const notes: string[] = [];

  const score = (key: string) => ranking.find((r) => r.key === key)?.score ?? 0;
  const distress = ranking.filter((r) => r.key !== "calm").reduce((sum, r) => sum + r.score, 0);

  let masked = false;
  const adjusted = ranking.map((r) => ({ ...r }));
  const calm = adjusted.find((r) => r.key === "calm");
  if (calm && calm.score > 0 && distress >= DISTRESS_THRESHOLD) {
    masked = true;
    calm.score = round1(calm.score * MASKED_CALM_FACTOR);
    notes.push("The message says things are fine, but the rest of it shows distress, so the distress is taken more seriously.");
  }

  const live = adjusted.filter((r) => r.score > 0).sort((a, b) => b.score - a.score || TIE_ORDER.indexOf(a.key as EmotionType) - TIE_ORDER.indexOf(b.key as EmotionType));
  if (live.length === 0) {
    if (crisis) return { result: { emotion: "sad", intensity: "high", score: 0, crisis: true }, ranking, notes: ["Words that may point to a person in danger were found."] };
    return { ...empty, ranking };
  }

  const top = live[0];
  const second = live[1] && live[1].score >= top.score * 0.6 && live[1].key !== "calm" ? (live[1].key as EmotionType) : undefined;

  // Intensity: the main feeling, plus the overall pattern (other feelings, absolutes, limits).
  const cues = matchVocabulary(input, INTENSITY_CUES, { context: true }).ranking;
  const cueScore = Math.min(2, cues.reduce((s, c) => s + c.score, 0));
  const otherFeelings = live.filter((r) => r.key !== top.key && r.key !== "calm" && r.score >= 1).length;
  let strength = top.score + (top.key === "calm" ? 0 : cueScore) + Math.min(1.5, otherFeelings * 0.5) + (masked ? 1 : 0);
  if (top.key === "calm") strength = Math.min(strength, 1.9); // calm is never "intense"
  if (cueScore > 0 && top.key !== "calm") notes.push(`Intensity raised by words like "${cues.flatMap((c) => c.hits.map((h) => h.matched)).slice(0, 8).join('", "')}".`);
  if (otherFeelings > 0 && top.key !== "calm") {
    const named = live
      .filter((r) => r.key !== top.key && r.key !== "calm" && r.score >= 1)
      .map((r) => `${r.key} (${r.hits.filter((h) => h.effective > 0).map((h) => `"${h.matched}"`).join(", ")})`)
      .join("; ");
    notes.push(`Other feeling${otherFeelings > 1 ? "s" : ""} also present, which raises the intensity: ${named}.`);
  }
  let intensity: EmotionResult["intensity"] = strength >= 4 ? "high" : strength >= 2 ? "medium" : "low";
  if (crisis) {
    intensity = "high";
    notes.push("Words that may point to a person in danger were found.");
  }

  const result: EmotionResult = { emotion: top.key as EmotionType, intensity, score: round1(top.score) };
  if (second) result.secondary = second;
  if (masked && top.key !== "calm") result.masked = true;
  if (crisis) result.crisis = true;
  return { result, ranking: adjusted.filter((r) => r.score > 0 || r.hits.some((h) => h.negated)), notes };
}

export function analyzeEmotion(input: string): EmotionResult {
  return detectEmotion(input).result;
}
