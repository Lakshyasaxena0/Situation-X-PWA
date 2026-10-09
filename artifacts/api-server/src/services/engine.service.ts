import { detectIntent, type IntentAnalysis, type IntentResult } from "./ajit.service.js";
import { detectEmotion, type EmotionAnalysis, type EmotionResult } from "./manu.service.js";
import { simulatePaths, type SimulationResult } from "./sivi.service.js";
import { analyzeAstro, type AstroResult } from "./astro.service.js";
import type { Tuning } from "./prashna.service.js";
import { detectSilence, type SilenceReading } from "./rsmi.service.js";
import { assessSafety, type SafetyDecision } from "./safety.service.js";
import type { Language } from "./analysis-options.js";

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
  /** RSMI: the meanings a silence in the question can have; null when the question mentions no silence. */
  silence: SilenceReading | null;
  /** What the ethical filter decided about the message (read in context; nothing is deleted from the text). */
  safety: SafetyDecision;
  /** What each module did for this question: whether it was active, its verdict and the evidence. */
  modules: ModuleReport[];
};

export type ModuleReport = {
  key: "AJIT" | "MANU" | "FILTER" | "SIVI" | "ASTRO" | "RSMI" | "AI";
  name: string;
  /** Which part of the analysis this module feeds. */
  area: "intent" | "emotion" | "paths" | "astrology" | "silence" | "synthesis";
  /** What this module looks at and how it understands the question (plain language). */
  role: string;
  active: boolean;
  /** What the module concluded about this question. */
  verdict: string;
  evidence: string[];
};

export type EngineOptions = {
  latitude?: number;
  longitude?: number;
  /** When false the astrology is still cast but is reported as switched off and takes no part in the answer. */
  useAstrology?: boolean;
  /** The answer language, so a safety message can be written in it. */
  language?: Language;
  /** The learned weighting of the astrology (from feedback); the built-in weights when absent. */
  tuning?: Tuning;
};

/** The SIVI card: what situation it understood, the paths it compared and why one ranks first. */
export function siviReport(simulation: SimulationResult, intent: IntentResult, emotion: EmotionResult): ModuleReport {
  const best = simulation.bestPath;
  const ctx = simulation.context;
  const describe = (p: SimulationResult["bestPath"], label: string) =>
    `${label}: ${p.action} - risk ${p.risk}, stability ${p.stability}, ${p.reversible ? "can be undone" : "hard to undo"}` +
    (p.benefits.length ? `. Benefits: ${p.benefits.join("; ")}` : "") +
    (p.downsides.length ? `. Downsides: ${p.downsides.join("; ")}` : "") +
    (p.uncertainties.length ? `. Uncertain: ${p.uncertainties.join("; ")}` : "");
  return {
    key: "SIVI",
    role: "Finds what your question is about, from your words in context.",
    name: "SIVI - Simulated Intelligent & Variable Intentions",
    area: "paths",
    active: true,
    verdict: `Best path: "${best.action}" (risk ${best.risk}, stability ${best.stability}). ${simulation.source === "ai" ? "Paths built by the AI from your full situation." : "General paths from the intent and emotion (rule-based)."}`,
    evidence: [
      `Wants: ${ctx.desiredOutcome}${ctx.inferred ? " (guessed from the kind of question)" : ""}`,
      ...ctx.knownFacts.map((f) => `Fact: ${f}`),
      ...ctx.constraints.map((c) => `Limit: ${c}`),
      ...(simulation.source === "rules" ? [`Built from intent "${intent.intent}" and emotion "${emotion.emotion}".`] : []),
      describe(best, "Best"),
      ...simulation.alternatives.map((p) => describe(p, "Alternative")),
      `Why: ${simulation.comparison}`,
    ],
  };
}

const FILTER_VERDICT: Record<SafetyDecision["action"], string> = {
  allow: "Read in context: nothing unsafe found. Your text was passed on unchanged.",
  support: "Words that may point to a person in distress were found. The analysis is written with care and help lines are shown.",
  redirect: "An intention to harm, control or deceive someone was found. The analysis will not help with that aim and steers to safe options.",
  block: "Blocked: this asks for something that could seriously harm someone. Nothing was analysed and nothing was charged.",
};

function filterReport(safety: SafetyDecision): ModuleReport {
  return {
    key: "FILTER",
    role: "Checks your message in context for harm, and steers or refuses when needed.",
    name: "Ethical filter",
    area: "intent",
    active: safety.action !== "allow",
    verdict: FILTER_VERDICT[safety.action],
    evidence: safety.action === "allow" ? [] : [...safety.reasons, ...safety.matched.map((m) => `Matched: "${m}"`)],
  };
}

/** The RSMI card: the silence it found and the meanings it ranks. Only present when the question mentions a silence. */
export function rsmiReport(silence: SilenceReading): ModuleReport {
  const whose = silence.subject === "self" ? "Your silence" : `${silence.who ? silence.who[0].toUpperCase() + silence.who.slice(1) : "The other person"}'s silence`;
  const top = silence.meanings[0];
  return {
    key: "RSMI",
    name: "RSMI - Reasonable Silence Module",
    area: "silence",
    role: "Studies a silence you describe and lists what it may mean.",
    active: true,
    verdict: `${whose} ${silence.channel === "in_person" ? "in conversation" : silence.channel === "organisation" ? "from an organisation" : silence.channel === "call" ? "on calls" : "in messages"}, after ${silence.trigger}. Most likely: ${top.meaning}.`,
    evidence: [
      ...silence.meanings.map((m) => `${m.likelihood}: ${m.meaning}`),
      ...(silence.unknowns.length ? [`Not known yet: ${silence.unknowns.join("; ")}`] : []),
    ],
  };
}

function buildModuleReports(
  safety: SafetyDecision,
  intentAnalysis: IntentAnalysis,
  emotionAnalysis: EmotionAnalysis,
  simulation: SimulationResult,
  astro: AstroResult,
  useAstrology: boolean,
  silence: SilenceReading | null,
): ModuleReport[] {
  const emotion = emotionAnalysis.result;
  const intent = intentAnalysis.result;
  const topFactors = astro.prashna.factors
    .filter((f) => f.label !== "Scale centering")
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
    .slice(0, 3)
    .map((f) => `${f.effect > 0 ? "+" : ""}${f.effect}: ${f.detail}`);

  return [
    filterReport(safety),
    ...(silence ? [rsmiReport(silence)] : []),
    {
      key: "AJIT",
      role: "Reads your words in context (English, Hinglish, Hindi): topic words, negation (\"I don't want to fight\" is not wanting to fight), intensity and which sentence is the question, then decides what it is about. It still works from words, so the AI re-reads your full text for meaning.",
      name: "AJIT - intent detection",
      area: "intent",
      active: intent.intent !== "unclear",
      verdict:
        intent.intent === "unclear"
          ? "No clear topic found, so the question is read as a general outlook."
          : `Intent: ${intent.intent} (${intent.confidence} confidence, evidence ${intent.score})` +
            (intent.secondary ? `, also touches ${intent.secondary}` : "") +
            (intent.stance === "avoid" ? ". You seem to want to AVOID what you name, not pursue it." : "."),
      evidence: intentAnalysis.ranking.map(
        (r) =>
          `${r.key} ${r.score}: ` +
          r.hits
            .map((h) => `"${h.matched}"${h.negated ? (h.effective === 0 ? " (negated, ignored)" : h.avoids ? " (negated, wanting to avoid it)" : " (negated)") : ""}`)
            .join(", "),
      ),
    },
    {
      key: "MANU",
      role: "Estimates the feelings in your words and how strong they sound.",
      name: "MANU - Mood & Mind Analysis and Navigation Unit",
      area: "emotion",
      active: emotion.score > 0,
      verdict:
        emotion.score > 0
          ? `Emotion: ${emotion.emotion} (${emotion.intensity} intensity, evidence ${emotion.score})` +
            (emotion.secondary ? `, with ${emotion.secondary} close behind` : "") +
            (emotion.masked ? ". You say you are fine, but the rest of the message sounds distressed." : ".") +
            " This describes how the words sound, not a diagnosis."
          : emotion.crisis
            ? "Words that may point to a person in danger were found. This is not a diagnosis."
            : "No emotion words found, so the tone is treated as unclear (confused, low intensity).",
      evidence: [
        ...emotionAnalysis.ranking.map(
          (r) =>
            `${r.key} ${r.score}: ` +
            r.hits
              .map((h) => `"${h.matched}"${h.negated ? " (negated, ignored)" : ""}${h.past ? " (about the past, softer)" : ""}${h.emphasized ? " (stressed)" : ""}`)
              .join(", "),
        ),
        ...emotionAnalysis.notes,
      ],
    },
    siviReport(simulation, intent, emotion),
    {
      key: "ASTRO",
      role: "Reads the Prashna chart for the moment you ask.",
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
  const { latitude, longitude, useAstrology = true } = options;

  // The text is read as written (case and punctuation carry meaning, e.g. CAPITALS and "!"); the ethical
  // filter judges it in context and never edits it.
  const cleanInput = input.trim();
  const safety = assessSafety(cleanInput, options.language);
  const intentAnalysis = detectIntent(cleanInput);
  const intentResult = intentAnalysis.result;
  const emotionAnalysis = detectEmotion(cleanInput);
  const emotionResult = emotionAnalysis.result;
  const simulationResult = simulatePaths(intentResult, emotionResult, cleanInput);
  const silence = detectSilence(cleanInput);
  const finalVerdict = deriveFinalVerdict(simulationResult, emotionResult);
  // ASTRO casts the Prashna charts (D1, D3, D9, D10) for the moment of the question and reads
  // the ones that matter for the intent AJIT detected. No birth details are involved.
  const astroResult = analyzeAstro(intentResult.intent, emotionResult.emotion, { latitude, longitude, text: cleanInput, tuning: options.tuning });

  return {
    intent: intentResult,
    emotion: emotionResult,
    simulation: simulationResult,
    finalVerdict,
    astro: astroResult,
    silence,
    safety,
    modules: buildModuleReports(safety, intentAnalysis, emotionAnalysis, simulationResult, astroResult, useAstrology, silence),
  };
}
