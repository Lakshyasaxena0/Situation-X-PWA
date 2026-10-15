import { useEffect, useState } from "react";
import { useCreateFeedback, useGetFeedbackList, getGetFeedbackListQueryKey, getGetDueFollowUpsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { FeedbackFields, EMPTY_ANSWERS, answersToRequest, profileOf, type FeedbackAnswers } from "@/components/FeedbackFields";

type Props = { analysisId: number; analysis: unknown; situation?: string };

function errorText(err: unknown): string {
  const e = err as { status?: number; data?: { message?: string } } | null;
  if (e?.status === 404) return "This question is no longer saved in your history, so feedback cannot be attached to it. Please ask it again.";
  if (e?.status === 401) return "Please log in again, then send the feedback.";
  return e?.data?.message ?? "Could not reach the server (it may be waking up). Please try again in a moment.";
}

/**
 * The feedback panel of ONE question. The questions are built from what this answer actually
 * contained (its suggested step, its timing, whether astrology / another route / a silence reading
 * was part of it), and the answers are stored against this question only.
 */
export function QueryFeedback({ analysisId, analysis, situation }: Props) {
  const qc = useQueryClient();
  const profile = profileOf(analysis as never);
  const [answers, setAnswers] = useState<FeedbackAnswers>(EMPTY_ANSWERS);
  const [problem, setProblem] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  const params = { analysisId };
  const existing = useGetFeedbackList(params, { query: { queryKey: getGetFeedbackListQueryKey(params), retry: false } });
  const previous = existing.data?.items?.[0];

  // A different question starts with its own empty panel.
  useEffect(() => {
    setAnswers(EMPTY_ANSWERS);
    setProblem("");
    setSaved(false);
    setEditing(false);
  }, [analysisId]);

  const create = useCreateFeedback({
    mutation: {
      onSuccess: () => {
        setSaved(true);
        setEditing(false);
        setProblem("");
        void qc.invalidateQueries({ queryKey: getGetFeedbackListQueryKey(params) });
        void qc.invalidateQueries({ queryKey: getGetFeedbackListQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetDueFollowUpsQueryKey() });
      },
      onError: (e) => setProblem(errorText(e)),
    },
  });

  function startEdit() {
    if (previous) {
      setAnswers({
        rating: previous.rating,
        actionTaken: (previous.actionTaken as FeedbackAnswers["actionTaken"]) ?? null,
        result: (previous.result as FeedbackAnswers["result"]) ?? null,
        reasonTags: previous.reasonTags ?? [],
        comment: previous.comment ?? "",
      });
    }
    setEditing(true);
    setSaved(false);
  }

  function send() {
    if (answers.rating === 0) {
      setProblem("Please choose a star rating first (question 1).");
      return;
    }
    setProblem("");
    create.mutate({ data: { analysisId, ...answersToRequest(answers) } });
  }

  if ((previous || saved) && !editing) {
    return (
      <section aria-label="Your feedback on this answer" className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h2 className="text-lg font-bold text-foreground">Your feedback on this answer</h2>
        <p className="flex items-center gap-2 text-sm text-foreground">
          <CheckCircle2 className="w-4 h-4 text-green-700" />
          Thank you. You rated this answer {previous?.rating ?? answers.rating}/5.
        </p>
        <button type="button" onClick={startEdit} className="text-sm underline text-foreground">Change my feedback</button>
      </section>
    );
  }

  return (
    <section aria-label="Feedback on this answer" className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Feedback on this answer</h2>
        {situation && <p className="text-xs text-muted-foreground mt-1 break-words">For your question: &ldquo;{situation.length > 140 ? `${situation.slice(0, 137)}...` : situation}&rdquo;</p>}
      </div>
      <FeedbackFields value={answers} onChange={setAnswers} disabled={create.isPending} profile={profile} />
      {problem && <p role="alert" className="text-sm text-red-700">{problem}</p>}
      <Button type="button" onClick={send} disabled={create.isPending} className="w-full sm:w-auto">
        {create.isPending ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Sending...</span> : "Submit feedback"}
      </Button>
    </section>
  );
}
