import { groqConfigured, groqJsonCompletion } from "../lib/groq.js";
import { LANGUAGE_NAMES, type Language } from "./analysis-options.js";

/**
 * Re-writes the text of a finished analysis in another language, so the person can switch the
 * language after seeing the answer. Only the words are translated: scores, verdicts, dates and
 * planet names stay as computed. The result is cached on the analysis, so each language is
 * translated at most once per analysis.
 */

export type PathTexts = { action?: string; benefits?: string[]; downsides?: string[]; uncertainties?: string[] };

export type AnalysisTexts = {
  summary?: string;
  finalVerdict?: { recommendedAction?: string; reasoning?: string };
  synthesis?: { summary?: string; astroInsight?: string; advice?: string; reasoning?: string; risks?: string[]; keyUnknowns?: string[]; nextSteps?: string[] };
  simulation?: {
    context?: { desiredOutcome?: string; knownFacts?: string[]; constraints?: string[] };
    comparison?: string;
    best?: PathTexts;
    alternatives?: PathTexts[];
  };
  modules?: { key: string; role?: string; verdict?: string; evidence?: string[] }[];
  astro?: { interpretation?: string; timingSummary?: string; activations?: string[] };
  silence?: { trigger?: string; meanings?: { meaning?: string; why?: string }[]; unknowns?: string[]; checks?: string[]; caution?: string };
  indirectRoute?: { blocker?: string; idea?: string; steps?: string[]; fairness?: string };
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const strs = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

const pathTexts = (v: unknown): PathTexts => {
  const p = obj(v);
  return { action: str(p.action), benefits: strs(p.benefits), downsides: strs(p.downsides), uncertainties: strs(p.uncertainties) };
};

/** Picks the user-readable sentences out of a stored analysis. */
export function extractTexts(fa: Record<string, unknown>): AnalysisTexts {
  const fv = obj(fa.finalVerdict);
  const syn = obj(fa.synthesis);
  const sim = obj(fa.simulation);
  const ctx = obj(sim.context);
  const astro = obj(fa.astro);
  const timing = obj(astro.timing);
  const silence = obj(fa.silence);
  const route = obj(fa.indirectRoute);
  const modules = Array.isArray(fa.modules) ? (fa.modules as unknown[]).map(obj) : [];
  return {
    summary: str(fa.summary),
    finalVerdict: { recommendedAction: str(fv.recommendedAction), reasoning: str(fv.reasoning) },
    synthesis: {
      summary: str(syn.summary),
      astroInsight: str(syn.astroInsight),
      advice: str(syn.advice),
      reasoning: str(syn.reasoning),
      risks: strs(syn.risks),
      keyUnknowns: strs(syn.keyUnknowns),
      nextSteps: strs(syn.nextSteps),
    },
    simulation: {
      context: { desiredOutcome: str(ctx.desiredOutcome), knownFacts: strs(ctx.knownFacts), constraints: strs(ctx.constraints) },
      comparison: str(sim.comparison),
      best: pathTexts(sim.bestPath),
      alternatives: Array.isArray(sim.alternatives) ? (sim.alternatives as unknown[]).map(pathTexts) : undefined,
    },
    modules: modules.map((m) => ({ key: String(m.key ?? ""), role: str(m.role), verdict: str(m.verdict), evidence: strs(m.evidence) })),
    astro: { interpretation: str(astro.interpretation), timingSummary: str(timing.summary), activations: strs(timing.activations) },
    silence: Array.isArray(silence.meanings)
      ? {
          trigger: str(silence.trigger),
          meanings: (silence.meanings as unknown[]).map((m) => ({ meaning: str(obj(m).meaning), why: str(obj(m).why) })),
          unknowns: strs(silence.unknowns),
          checks: strs(silence.checks),
          caution: str(silence.caution),
        }
      : undefined,
    indirectRoute: Array.isArray(route.steps)
      ? { blocker: str(route.blocker), idea: str(route.idea), steps: strs(route.steps), fairness: str(route.fairness) }
      : undefined,
  };
}

/** Every string in the structure, in a fixed order (keys named "key" are identifiers and are skipped). */
function leaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => leaves(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (k !== "key") leaves(v, out);
  }
  return out;
}

function rebuild<T>(value: T, next: () => string): T {
  if (typeof value === "string") return next() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => rebuild(v, next)) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "key" ? v : rebuild(v, next)])) as T;
  }
  return value;
}

export type CompleteJson = (prompt: string, maxTokens: number) => Promise<string | null>;

const defaultComplete: CompleteJson = (prompt, maxTokens) => groqJsonCompletion(prompt, { maxTokens, temperature: 0.2 });

/** Translates the texts; returns null when the model's answer is unusable (wrong count, not JSON). */
export async function translateTexts(texts: AnalysisTexts, language: Exclude<Language, "auto">, complete: CompleteJson = defaultComplete): Promise<AnalysisTexts | null> {
  const items = leaves(texts);
  if (items.length === 0) return texts;
  const prompt = `Translate every string in "items" into ${LANGUAGE_NAMES[language]}.
Rules: keep the meaning and the tone; keep the same order and exactly ${items.length} items; keep numbers, scores, dates, and anything inside double quotes (keywords) unchanged; keep the module names AJIT, MANU, SIVI, ASTRO, AI and astrology terms such as planet, sign and dasha names recognisable (for Hindi use the usual Hindi names where natural). Do not add or remove anything.
Reply with ONLY a JSON object: {"items": [ ...${items.length} translated strings... ]}

${JSON.stringify({ items })}`;
  const raw = await complete(prompt, Math.min(7000, 1500 + Math.ceil(items.join("").length * 1.2)));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  const out = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(out) || out.length !== items.length || !out.every((x) => typeof x === "string")) return null;
  let i = 0;
  return rebuild(texts, () => out[i++] as string);
}

export function translationAvailable(): boolean {
  return groqConfigured();
}
