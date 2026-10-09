import type { AnalysisResult } from "@workspace/api-client-react";

type PathTexts = { action?: string; benefits?: string[]; downsides?: string[]; uncertainties?: string[] };

/** The translated sentences of an analysis (same structure the server sends back). */
export type Texts = {
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
};

const pick = <T>(translated: T | undefined, original: T): T => (translated === undefined || translated === null || translated === "" ? original : translated);
const pickList = (translated: string[] | undefined, original: string[] | undefined) =>
  original && translated && translated.length === original.length ? translated : original;

function applyPath<P extends { action: string; benefits?: string[]; downsides?: string[]; uncertainties?: string[] }>(p: P, t: PathTexts | undefined): P {
  // Older cached translations stored a plain string here; they are ignored rather than trusted.
  if (!t || typeof t !== "object") return p;
  return {
    ...p,
    action: pick(t.action, p.action),
    benefits: pickList(t.benefits, p.benefits),
    downsides: pickList(t.downsides, p.downsides),
    uncertainties: pickList(t.uncertainties, p.uncertainties),
  };
}

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
      ...result.simulation,
      context: result.simulation.context
        ? {
            ...result.simulation.context,
            desiredOutcome: pick(t.simulation?.context?.desiredOutcome, result.simulation.context.desiredOutcome),
            knownFacts: pickList(t.simulation?.context?.knownFacts, result.simulation.context.knownFacts) ?? [],
            constraints: pickList(t.simulation?.context?.constraints, result.simulation.context.constraints) ?? [],
          }
        : result.simulation.context,
      comparison: result.simulation.comparison ? pick(t.simulation?.comparison, result.simulation.comparison) : result.simulation.comparison,
      bestPath: applyPath(result.simulation.bestPath, t.simulation?.best),
      alternatives: result.simulation.alternatives.map((alt, i) => applyPath(alt, t.simulation?.alternatives?.[i])),
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
