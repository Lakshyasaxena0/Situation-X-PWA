import { useState } from "react";
import {
  useGetDueFollowUps,
  useCreateFeedback,
  useSnoozeFollowUp,
  useDismissFollowUp,
  getGetDueFollowUpsQueryKey,
  getGetFeedbackListQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FeedbackFields, EMPTY_ANSWERS, answersToRequest, type FeedbackAnswers } from "@/components/FeedbackFields";
import { Loader2, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";


/**
 * Shown on every page once a prediction's time window has passed. The answers feed
 * the accuracy calibration on the server, so future readings get more honest.
 * Renders nothing when there is nothing due (or while loading / on error).
 */
export function FollowUpPrompt() {
  const { data } = useGetDueFollowUps({ query: { queryKey: getGetDueFollowUpsQueryKey(), staleTime: 60_000, retry: false } });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<FeedbackAnswers>(EMPTY_ANSWERS);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetDueFollowUpsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFeedbackListQueryKey() });
    setAnswers(EMPTY_ANSWERS);
  };
  const onError = () =>
    toast({ title: "Could not save", description: "Please try again.", variant: "destructive" });

  const submit = useCreateFeedback({
    mutation: {
      onSuccess: () => {
        toast({ title: "Thank you", description: "Your answer helps improve future predictions." });
        refresh();
      },
      onError,
    },
  });
  const snooze = useSnoozeFollowUp({ mutation: { onSuccess: refresh, onError } });
  const dismiss = useDismissFollowUp({ mutation: { onSuccess: refresh, onError } });

  const current = data?.items[0];
  if (!current) return null;

  const busy = submit.isPending || snooze.isPending || dismiss.isPending;

  return (
    <section
      aria-label="Prediction follow-up"
      className="mx-4 mt-4 md:mx-8 border border-primary/30 bg-primary/5 rounded-lg p-4"
    >
      <div className="flex items-start gap-3">
        <CalendarClock className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">How did this turn out?</p>
          <p className="text-xs text-muted-foreground mt-1 break-words">
            You asked: &ldquo;{current.situation}&rdquo;
          </p>
          <p className="text-xs text-muted-foreground mt-1 break-words">
            Reading: <span className="text-foreground">{current.verdict}</span>. {current.summary}
          </p>

          <div className="mt-3 space-y-3">
            <FeedbackFields value={answers} onChange={setAnswers} disabled={busy} />
            <Button
              type="button"
              size="sm"
              disabled={busy || answers.rating === 0}
              onClick={() => submit.mutate({ data: { analysisId: current.id, ...answersToRequest(answers) } })}
            >
              {submit.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send
            </Button>
          </div>

          <div className="flex gap-4 mt-3 text-xs">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
              disabled={busy}
              onClick={() => snooze.mutate({ id: current.id })}
            >
              Too early to say, ask me later
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
              disabled={busy}
              onClick={() => dismiss.mutate({ id: current.id })}
            >
              Don&rsquo;t ask about this
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
