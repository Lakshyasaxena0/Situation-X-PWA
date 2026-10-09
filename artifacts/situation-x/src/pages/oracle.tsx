import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAnalyzeSituation,
  useEstimateAnalysisCost,
  useClarifySituation,
  getGetCreditsQueryKey,
  type AnalyzeRequestDepth,
} from "@workspace/api-client-react";
import { AnalysisDisplay, CostLines } from "@/components/AnalysisDisplay";
import { ClarifyPanel, type Answered } from "@/components/ClarifyPanel";
import { CreditsBar } from "@/components/CreditsBar";
import { analysisSession, clearAnalysisSession } from "@/lib/analysisSession";
import { DEFAULT_PLACE } from "@/lib/places";
import { requestOptions, useSettings } from "@/lib/settings";
import { InviteCta } from "@/components/InviteCta";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence } from "framer-motion";
import { Loader2, Settings as SettingsIcon } from "lucide-react";

// Validation problems (HTTP 400) carry an actionable message from the API;
// anything else gets the generic text.
function analysisErrorMessage(error: unknown): string {
  const e = error as { status?: number; data?: { message?: unknown } } | null;
  // 400: a problem with the text; 422: the ethical filter's safe reply (it can be several sentences).
  if ((e?.status === 400 || e?.status === 422) && typeof e.data?.message === "string" && !e.data.message.startsWith("[")) {
    return e.data.message;
  }
  return "Analysis failed. Please try again.";
}

const DEPTH_OPTIONS: { value: AnalyzeRequestDepth; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Chosen from how complex your question is" },
  { value: "standard", label: "Standard", hint: "Core question, key facts, best action" },
  { value: "deep", label: "Deep", hint: "Several options weighed, second-order effects" },
  { value: "expert", label: "Expert", hint: "Pre-mortem, bias check, honest uncertainty" },
];

export default function Oracle() {
  // The question and the last analysis live in a store, so they are still here after visiting another page.
  const { situation, result } = analysisSession.use();
  const setSituation = (text: string) => analysisSession.set((prev) => ({ ...prev, situation: text }));
  const [settings, updateSettings] = useSettings();
  const depth: AnalyzeRequestDepth = settings.depth;
  const queryClient = useQueryClient();

  const analyze = useAnalyzeSituation();
  const clarify = useClarifySituation();

  // Questions asked before the analysis: the answers belong to the exact text they were given for.
  const [qa, setQa] = useState<{ forText: string; answers: Answered[]; current: { question: string; why: string; choices: string[] } | null; round: number; max: number; done: boolean }>({
    forText: "", answers: [], current: null, round: 0, max: 4, done: false,
  });
  const answers = qa.forText === situation.trim() ? qa.answers : [];
  const clarifying = qa.current !== null && qa.forText === situation.trim();
  const estimate = useEstimateAnalysisCost();
  const { mutate: runEstimate, reset: resetEstimate } = estimate;
  const text = situation.trim();
  const optionsKey = JSON.stringify(requestOptions(settings));
  const answersKey = JSON.stringify(answers);

  // Quote the exact price (modules involved + reasoning level) while the user types, before anything is charged.
  useEffect(() => {
    if (text.length < 10) {
      resetEstimate();
      return;
    }
    const t = setTimeout(() => runEstimate({ data: { situation: text, depth, ...(JSON.parse(optionsKey) as object), ...(JSON.parse(answersKey).length ? { clarifications: JSON.parse(answersKey) as Answered[] } : {}) } }), 600);
    return () => clearTimeout(t);
  }, [text, depth, optionsKey, answersKey, runEstimate, resetEstimate]);
  const quote = estimate.data?.billingActive ? estimate.data : null;

  function runAnalysis(given: Answered[]) {
    analyze.mutate(
      { data: { situation: situation.trim(), depth, ...requestOptions(settings), ...(given.length ? { clarifications: given } : {}) } },
      {
        onSuccess: (data) => {
          analysisSession.set((prev) => ({ ...prev, result: data }));
          void queryClient.invalidateQueries({ queryKey: getGetCreditsQueryKey() });
        },
        onError: () => void queryClient.invalidateQueries({ queryKey: getGetCreditsQueryKey() }),
      }
    );
  }

  /** Asks the next short question, or finishes the questions when there is nothing more to ask. */
  function askNext(given: Answered[]) {
    const forText = situation.trim();
    clarify.mutate(
      { data: { situation: forText, answers: given, language: settings.language, useAi: settings.useAi } },
      {
        onSuccess: (r) => {
          if (r.done || !r.question) return finishQuestions(forText, given);
          setQa({ forText, answers: given, current: { question: r.question.question, why: r.question.why ?? "", choices: r.question.choices }, round: r.round, max: r.max, done: false });
        },
        // A failed question must never block the analysis.
        onError: () => finishQuestions(forText, given),
      }
    );
  }

  function finishQuestions(forText: string, given: Answered[]) {
    setQa({ forText, answers: given, current: null, round: given.length, max: 4, done: true });
    // With credits in use the final price (it can change with the answers) is shown first; otherwise just run.
    if (!estimate.data?.billingActive) runAnalysis(given);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!situation.trim() || situation.length < 10 || clarifying || clarify.isPending) return;
    // Questions are asked once per text; after that Run Analysis runs it.
    if (settings.askQuestions && !(qa.done && qa.forText === situation.trim())) {
      askNext([]);
      return;
    }
    runAnalysis(answers);
  }

  const placeName = settings.location?.name ?? `${DEFAULT_PLACE.name} (default)`;

  return (
    <Shell>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <CreditsBar />
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analysis</h1>
          </div>
          {(result || situation) && (
            <Button type="button" variant="outline" size="sm" onClick={() => { clearAnalysisSession(); analyze.reset(); }}>
              New analysis
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Textarea
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder="Describe your situation in detail. Be specific about what you are facing, what decision you need to make, or what conflict you are experiencing."
              className="min-h-[120px] text-sm bg-card border-card-border resize-none"
              maxLength={2000}
            />
            <div className="flex justify-between mt-1">
              <span className={`text-xs ${situation.length < 10 && situation.length > 0 ? "text-red-700" : "text-muted-foreground"}`}>
                {situation.length < 10 && situation.length > 0 ? `${10 - situation.length} more characters needed` : ""}
              </span>
              <span className="text-xs text-muted-foreground">{situation.length}/2000</span>
            </div>
          </div>

          {/* What Settings currently say, with a link to change it */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <span>AI: <strong className="text-foreground">{settings.useAi ? "on" : "off"}</strong></span>
            <span>Astrology: <strong className="text-foreground">{settings.useAstrology ? "on" : "off"}</strong></span>
            <span>Language: <strong className="text-foreground">{settings.language === "auto" ? "same as question" : settings.language === "en" ? "English" : settings.language === "hi" ? "Hindi" : "Hinglish"}</strong></span>
            {settings.useAstrology && <span>Place: <strong className="text-foreground">{placeName}</strong></span>}
            <Link href="/settings" className="ml-auto inline-flex items-center gap-1 text-primary underline underline-offset-2">
              <SettingsIcon className="w-3 h-3" /> Change in Settings
            </Link>
          </div>

          {/* How deeply the AI should think: costs more credits, shown before you run. */}
          {settings.useAi && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">AI reasoning level</p>
            <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="AI reasoning level">
              {DEPTH_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={depth === o.value}
                  title={o.hint}
                  onClick={() => updateSettings({ depth: o.value })}
                  className={`px-3 py-1.5 rounded border text-xs transition-colors ${
                    depth === o.value ? "border-primary bg-primary/20 text-foreground font-semibold" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {quote && (
            <details className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <summary className="cursor-pointer flex items-center justify-between gap-3 list-none">
                <span className="text-foreground">
                  This analysis will use <strong>{quote.total} credits</strong>
                  <span className="text-xs text-muted-foreground"> ({quote.depth} reasoning{quote.depthChosen === "auto" ? ", auto" : ""})</span>
                </span>
                <span className={`text-xs ${quote.enough ? "text-muted-foreground" : "text-red-700"}`}>{quote.balance} available</span>
              </summary>
              <CostLines lines={quote.lines} />
              {!quote.enough && (
                <p className="mt-3 text-xs text-red-700">
                  You need {quote.total - quote.balance} more credits.{" "}
                  <Link href="/pricing" className="underline underline-offset-2">
                    Get credits
                  </Link>
                </p>
              )}
            </details>
          )}
          {quote && !quote.enough && <InviteCta />}

          {clarifying && qa.current && (
            <ClarifyPanel
              question={qa.current.question}
              why={qa.current.why}
              choices={qa.current.choices}
              round={qa.round}
              max={qa.max}
              answered={answers}
              busy={clarify.isPending}
              onAnswer={(a) => askNext([...answers, { question: qa.current!.question, answer: a }])}
              onSkip={() => finishQuestions(situation.trim(), answers)}
            />
          )}
          {!clarifying && answers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Added from your answers: {answers.map((a) => a.answer).join("; ")}
            </p>
          )}

          <Button
            type="submit"
            disabled={analyze.isPending || clarify.isPending || clarifying || situation.length < 10 || (quote !== null && !quote.enough)}
            className="w-full bg-primary text-primary-foreground hover:opacity-90"
          >
            {analyze.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Running analysis...
              </span>
            ) : clarify.isPending && !clarifying ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking of a question...
              </span>
            ) : (
              "Run Analysis"
            )}
          </Button>

          {analyze.isError && (analyze.error as { status?: number } | null)?.status === 402 && !(quote && !quote.enough) && <InviteCta />}
          {analyze.isError && (analyze.error as { status?: number } | null)?.status === 402 ? (
            <p className="text-sm text-center text-foreground">
              {(analyze.error as { data?: { message?: string } } | null)?.data?.message ?? "You do not have enough credits for this analysis."}{" "}
              <Link href="/pricing" className="text-primary underline underline-offset-2">
                Get credits
              </Link>
            </p>
          ) : (
            analyze.isError && (
              <p className={`text-sm ${(analyze.error as { status?: number } | null)?.status === 422 ? "rounded-md border border-border bg-card p-4 text-foreground leading-relaxed" : "text-red-700 text-center"}`}>
                {analysisErrorMessage(analyze.error)}
              </p>
            )
          )}
        </form>

        <AnimatePresence>
          {result && <AnalysisDisplay result={result} />}
        </AnimatePresence>
      </div>
    </Shell>
  );
}
