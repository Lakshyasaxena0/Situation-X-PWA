import type { AnalysisResult } from "@workspace/api-client-react";
import { createStore } from "./store";

/**
 * What is on the Analysis page: the text being written and the last analysis. It lives in a store
 * (and in this tab's session storage), so leaving the page and coming back, or reloading, shows the
 * same question and answer. Starting a new analysis is an explicit action.
 */
export type AnalysisSession = { situation: string; result: AnalysisResult | null };

const EMPTY: AnalysisSession = { situation: "", result: null };

export const analysisSession = createStore<AnalysisSession>("sx_analysis_session_v1", EMPTY, "session", (raw) => {
  const r = raw as Partial<AnalysisSession> | null;
  return {
    situation: typeof r?.situation === "string" ? r.situation.slice(0, 2000) : "",
    result: r?.result && typeof r.result === "object" ? (r.result as AnalysisResult) : null,
  };
});

export const clearAnalysisSession = () => analysisSession.set(EMPTY);
