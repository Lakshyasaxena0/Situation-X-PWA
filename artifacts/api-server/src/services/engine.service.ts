import { analyzeIntent, type IntentResult } from "./ajit.service.js";
import { analyzeEmotion, type EmotionResult } from "./manu.service.js";
import { simulatePaths, type SimulationResult } from "./sivi.service.js";
import { analyzeAstro, type AstroResult } from "./astro.service.js";
import { KEYWORDS as INTENT_KEYWORDS } from "./ajit.service.js";
import { EMOTION_KEYWORDS } from "./manu.service.js";
import { matchedKeywords, normalizeText } from "./text.js";
import type { BirthInput } from "./timing.service.js";

export type EngineResponse = {
  intent: IntentResult;
  emotion: EmotionResult;
  simulation: SimulationResult;
  finalVerdict: {
    recommendedAction: string;
    reasoning: string;
    riskLevel: "low" | "medium" | "high";
  };
  astro: AstroResult;
  /** What each module did for this question: whether it was active, its verdict and the evidence. */
  modules: ModuleReport[];
};

export type ModuleReport = {
  key: "AJIT" | "MANU" | "FILTER" | "SIVI" | "ASTRO" | "AI";
  name: string;
  /** Which part of the analysis this module feeds. */
  area: "intent" | "emotion" | "paths" | "astrology" | "synthesis";
  active: boolean;
  /** What the module concluded about this question. */
  verdict: string;
  evidence: string[];
};

export type EngineOptions = {
  latitude?: number;
  longitude?: number;
  /** Birth moment and place; makes the dashas those of the person's own chart. */
  birth?: BirthInput;
  /** When false the astrology is still cast but is reported as switched off and takes no part in the answer. */
  useAstrology?: boolean;
};

const UNSAFE_PATTERN = new RegExp(
  "\\b(?:revenge|harm(?:s|ed|ing|ful)?|manipulat(?:e|es|ed|d|ing|ion)|control someone|blackmail(?:s|ed|ing)?)\\b",
  "g",
);

function applyEthicalFilter(input: string): { text: string; removed: string[] } {
  const lower = input.toLowerCase();
  const removed = [...new Set(lower.match(UNSAFE_PATTERN) ?? [])];
  return { text: lower.replace(UNSAFE_PATTERN, " ").replace(/\s+/g, " ").trim(), removed };
}

const ranked = (text: string, table: Record<string, string[]>) =>
  Object.entries(table)
    .map(([label, words]) => ({ label, hits: matchedKeywords(text, words) }))
    .filter((r) => r.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);

function buildModuleReports(
  clean: string,
  removed: string[],
  intent: IntentResult,
  emotion: EmotionResult,
  simulation: SimulationResult,
  astro: AstroResult,
  useAstrology: boolean,
): ModuleReport[] {
  const normalized = normalizeText(clean);
  const intentRank = ranked(normalized, INTENT_KEYWORDS);
  const emotionRank = ranked(normalized, EMOTION_KEYWORDS);
  const best = simulation.bestPath;
  const topFactors = astro.prashna.factors
    .filter((f) => f.label !== "Scale centering")
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
    .slice(0, 3)
    .map((f) => `${f.effect > 0 ? "+" : ""}${f.effect}: ${f.detail}`);

  return [
    {
      key: "FILTER",
      name: "Ethical filter",
      area: "intent",
      active: removed.length > 0,
      verdict: removed.length ? `Removed ${removed.length} harmful term(s) before analysis.` : "Nothing needed filtering.",
      evidence: removed.map((w) => `Removed: "${w}"`),
    },
    {
      key: "AJIT",
      name: "AJIT - intent detection",
      area: "intent",
      active: intent.intent !== "unclear",
      verdict:
        intent.intent === "unclear"
          ? "No clear intent words found, so the question is read as a general outlook."
          : `Intent: ${intent.intent} (${intent.confidence} confidence, ${intent.score} keyword match${intent.score === 1 ? "" : "es"}).`,
      evidence: intentRank.map((r) => `${r.label}: ${r.hits.map((h) => `"${h}"`).join(", ")}`),
    },
    {
      key: "MANU",
      name: "MANU - emotion mapping",
      area: "emotion",
      active: emotion.score > 0,
      verdict:
        emotion.score > 0
          ? `Emotion: ${emotion.emotion} (${emotion.intensity} intensity, ${emotion.score} keyword match${emotion.score === 1 ? "" : "es"}).`
          : "No emotion words found, so the tone is treated as unclear (confused, low intensity).",
      evidence: emotionRank.map((r) => `${r.label}: ${r.hits.map((h) => `"${h}"`).join(", ")}`),
    },
    {
      key: "SIVI",
      name: "SIVI - path simulation",
      area: "paths",
      active: true,
      verdict: `Best path: "${best.action}" (risk ${best.risk}, stability ${best.stability}, outcome ${best.outcome}).`,
      evidence: [
        `Built from intent "${intent.intent}" and emotion "${emotion.emotion}".`,
        ...[best, ...simulation.alternatives].map(
          (p) => `${p === best ? "Best" : "Alternative"}: ${p.action} - risk ${p.risk}, stability ${p.stability}, ${p.outcome}`,
        ),
      ],
    },
    {
      key: "ASTRO",
      name: "ASTRO - Prashna chart",
      area: "astrology",
      active: useAstrology,
      verdict: useAstrology
        ? `${astro.prashna.topic}: ${astro.prashna.signal} (score ${astro.prashna.score}), house ${astro.prashna.primaryHouse}, dominant planet ${astro.prashna.dominantPlanet}.`
        : "Switched off in your settings; not used in the answer.",
      evidence: useAstrology ? topFactors : [],
    },
  ];
}

function deriveFinalVerdict(simulation: SimulationResult, emotion: EmotionResult): EngineResponse["finalVerdict"] {
  const best = simulation.bestPath;
  let reasoning = "";
  if (emotion.emotion === "angry" || emotion.emotion === "anxious" || emotion.emotion === "stressed" || emotion.emotion === "sad") {
    reasoning = "Your current emotional state suggests avoiding impulsive actions. A stable and low-risk approach is recommended.";
  } else if (emotion.emotion === "confused") {
    reasoning = "Clarity is currently low. A balanced and stable path will help avoid unnecessary mistakes.";
  } else {
    reasoning = "Your emotional state is relatively stable. You can proceed with a calculated and structured decision.";
  }
  return { recommendedAction: best.action, reasoning, riskLevel: best.risk };
}

export function runEngine(input: string, options: EngineOptions = {}): EngineResponse {
  if (!input || input.length < 10) throw new Error("Input must be at least 10 characters long.");
  const { latitude, longitude, birth, useAstrology = true } = options;

  const { text: cleanInput, removed } = applyEthicalFilter(input);
  const intentResult = analyzeIntent(cleanInput);
  const emotionResult = analyzeEmotion(cleanInput);
  const simulationResult = simulatePaths(intentResult.intent, emotionResult.emotion);
  const finalVerdict = deriveFinalVerdict(simulationResult, emotionResult);
  // ASTRO casts the Prashna charts (D1, D3, D9, D10) for the moment of the question and reads
  // the ones that matter for the intent AJIT detected. No birth details are involved.
  const astroResult = analyzeAstro(intentResult.intent, emotionResult.emotion, { latitude, longitude, birth, text: input });

  return {
    intent: intentResult,
    emotion: emotionResult,
    simulation: simulationResult,
    finalVerdict,
    astro: astroResult,
    modules: buildModuleReports(cleanInput, removed, intentResult, emotionResult, simulationResult, astroResult, useAstrology),
  };
}
