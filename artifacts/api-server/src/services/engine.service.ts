import { detectIntent, type IntentAnalysis, type IntentResult } from "./ajit.service.js";
import { detectEmotion, type EmotionAnalysis, type EmotionResult } from "./manu.service.js";
import { simulatePaths, type SimulationResult } from "./sivi.service.js";
import { analyzeAstro, type AstroResult } from "./astro.service.js";
import type { Tuning } from "./prashna.service.js";
import { detectSilence, type SilenceReading } from "./rsmi.service.js";
import { detectObstacle, ruleRoute, type IndirectRoute } from "./workaround.service.js";
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
  /** AJIT: a clever but ethical way round a blocked direct route; null when nothing in the question says the way is closed. */
  route: IndirectRoute | null;
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
  return {
    key: "SIVI",
    role: "Compares the choices open to you and picks the safest useful one.",
    name: "SIVI - Simulated Intelligent & Variable Intentions",
    area: "paths",
    active: true,
    verdict: `Go with: ${best.action}`,
    evidence: [
      `Risk is ${best.risk}, steadiness is ${best.stability}, and it ${best.reversible ? "can be undone" : "is hard to undo"}.`,
      `You want: ${ctx.desiredOutcome}${ctx.inferred ? " (we guessed this from your question)" : ""}`,
      ...(best.benefits.length ? [`Good side: ${best.benefits.slice(0, 2).join("; ")}`] : []),
      ...(best.downsides.length ? [`Watch out: ${best.downsides.slice(0, 2).join("; ")}`] : []),
      ...(simulation.comparison ? [`Why this one: ${simulation.comparison}`] : []),
      simulation.source === "ai" ? "Choices were built by the AI from your whole situation." : "Choices are general ones based on the topic and mood of your question.",
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
  route: IndirectRoute | null,
): ModuleReport[] {
  const emotion = emotionAnalysis.result;
  const intent = intentAnalysis.result;
  return [
    filterReport(safety),
    ...(silence ? [rsmiReport(silence)] : []),
    {
      key: "AJIT",
      role: "Finds what your question is about, from your words in context.",
      name: "AJIT - intent detection",
      area: "intent",
      active: intent.intent !== "unclear",
      verdict:
        intent.intent === "unclear"
          ? "No clear topic found, so your question is read in a general way."
          : `Your question is mostly about ${intent.intent} (${intent.confidence} confidence)` +
            (intent.secondary ? `, and also touches ${intent.secondary}` : "") +
            (intent.stance === "avoid" ? ". It sounds like you want to AVOID what you name, not get it." : "."),
      evidence: [
        ...intentAnalysis.ranking.map(
          (r, i) =>
            `${i === 0 ? "Words that point to" : "Weaker signs of"} ${r.key}: ` +
            r.hits
              .map((h) => `"${h.matched}"${h.negated ? (h.effective === 0 ? " (negated, ignored)" : h.avoids ? " (negated, wanting to avoid it)" : " (negated)") : ""}`)
              .join(", "),
        ),
        ...(route ? [`The direct way looks closed, so a fair way round is shown below.`] : []),
      ],
    },
    {
      key: "MANU",
      role: "Estimates the feelings in your words and how strong they sound.",
      name: "MANU - Mood & Mind Analysis and Navigation Unit",
      area: "emotion",
      active: emotion.score > 0,
      verdict:
        emotion.score > 0
          ? `You sound ${emotion.emotion} (${emotion.intensity} feeling)` +
            (emotion.secondary ? `, with some ${emotion.secondary} too` : "") +
            (emotion.masked ? ". You say you are fine, but the rest of your message sounds upset." : ".") +
            " This is only how the words sound. It is not a diagnosis."
          : emotion.crisis
            ? "Words that may point to a person in danger were found. This is not a diagnosis."
            : "No emotion words found, so the tone is treated as unclear (confused, low intensity).",
      evidence: [
        ...emotionAnalysis.ranking.map(
          (r, i) =>
            `${i === 0 ? "Words that show" : "Weaker signs of"} ${r.key}: ` +
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
      role: "Reads the chart of the moment you asked, to tell if it can happen and when.",
      name: "ASTRO - Prashna chart",
      area: "astrology",
      active: useAstrology,
      verdict: useAstrology
        ? astro.outlook.headline
        : "Switched off in your settings; not used in the answer.",
      evidence: useAstrology
        ? [
            ...(astro.outlook.timing ? [`Expected time: ${astro.outlook.timing.text} (${astro.outlook.timing.from} to ${astro.outlook.timing.to}).`] : astro.outlook.timingNote ? [astro.outlook.timingNote] : []),
            ...astro.outlook.favours.map((f) => `Helps: ${f}`),
            ...astro.outlook.against.map((f) => `Hurts: ${f}`),
          ]
        : [],
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
  // Only offered when the filter found nothing wrong: a way round must never help a harmful aim.
  const blockCues = safety.action === "allow" ? detectObstacle(cleanInput) : null;
  const route = blockCues ? ruleRoute(intentResult.intent, blockCues) : null;
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
    route,
    safety,
    modules: buildModuleReports(safety, intentAnalysis, emotionAnalysis, simulationResult, astroResult, useAstrology, silence, route),
  };
}
