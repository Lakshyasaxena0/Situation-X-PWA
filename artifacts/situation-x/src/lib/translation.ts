import type { AnalysisResult } from "@workspace/api-client-react";

/** The translated sentences of an analysis (same structure the server sends back). */
export type Texts = {
  summary?: string;
  finalVerdict?: { recommendedAction?: string; reasoning?: string };
  synthesis?: { summary?: string; astroInsight?: string; advice?: string; reasoning?: string; risks?: string[]; keyUnknowns?: string[]; nextSteps?: string[] };
  simulation?: { best?: string; alternatives?: string[] };
  modules?: { key: string; role?: string; verdict?: string; evidence?: string[] }[];
  astro?: { interpretation?: string; timingSummary?: string; activations?: string[] };
};

const pick = <T>(translated: T | undefined, original: T): T => (translated === undefined || translated === null || translated === "" ? original : translated);
const pickList = (translated: string[] | undefined, original: string[] | undefined) =>
  original && translated && translated.length === original.length ? translated : original;

/** Returns a copy of the analysis with its sentences replaced by the translated ones. Numbers are untouched. */
export function applyTexts(result: AnalysisResult, t: Texts | undefined): AnalysisResult {
  if (!t) return result;
  const syn = result.synthesis;
  return {
    ...result,
    summary: pick(t.summary, result.summary),
    finalVerdict: {
      ...result.finalVerdict,
      recommendedAction: pick(t.finalVerdict?.recommendedAction, result.finalVerdict.recommendedAction),
      reasoning: pick(t.finalVerdict?.reasoning, result.finalVerdict.reasoning),
    },
    synthesis: syn
      ? {
          ...syn,
          summary: pick(t.synthesis?.summary, syn.summary),
          astroInsight: pick(t.synthesis?.astroInsight, syn.astroInsight),
          advice: pick(t.synthesis?.advice, syn.advice),
          reasoning: pick(t.synthesis?.reasoning, syn.reasoning),
          risks: pickList(t.synthesis?.risks, syn.risks),
          keyUnknowns: pickList(t.synthesis?.keyUnknowns, syn.keyUnknowns),
          nextSteps: pickList(t.synthesis?.nextSteps, syn.nextSteps),
        }
      : syn,
    simulation: {
      bestPath: { ...result.simulation.bestPath, action: pick(t.simulation?.best, result.simulation.bestPath.action) },
      alternatives: result.simulation.alternatives.map((alt, i) => ({ ...alt, action: pick(t.simulation?.alternatives?.[i], alt.action) })),
    },
    modules: result.modules?.map((m, i) => {
      const tm = t.modules?.[i];
      if (!tm || tm.key !== m.key) return m;
      return { ...m, role: pick(tm.role, m.role), verdict: pick(tm.verdict, m.verdict), evidence: pickList(tm.evidence, m.evidence) ?? m.evidence };
    }),
    astro: {
      ...result.astro,
      interpretation: pick(t.astro?.interpretation, result.astro.interpretation),
      timing: result.astro.timing
        ? {
            ...result.astro.timing,
            summary: pick(t.astro?.timingSummary, result.astro.timing.summary),
            activations: pickList(t.astro?.activations, result.astro.timing.activations) ?? result.astro.timing.activations,
          }
        : result.astro.timing,
    },
  };
}
