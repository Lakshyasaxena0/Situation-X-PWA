import { useState } from "react";
import {
  useCreateFeedback,
  useGetFeedbackList,
  useDeleteFeedback,
  useGetAnalysisHistory,
  getGetFeedbackListQueryKey,
  getGetAnalysisHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { FeedbackFields, EMPTY_ANSWERS, answersToRequest, type FeedbackAnswers } from "@/components/FeedbackFields";
import { Label } from "@/components/ui/label";
import { Loader2, Star, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              n <= (hovered || value) ? "text-orange-700 fill-orange-400" : "text-muted-foreground"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function Feedback() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [analysisId, setAnalysisId] = useState("");
  const [answers, setAnswers] = useState<FeedbackAnswers>(EMPTY_ANSWERS);

  const { data: historyData } = useGetAnalysisHistory(
    { limit: 10, offset: 0 },
    { query: { queryKey: getGetAnalysisHistoryQueryKey({ limit: 10, offset: 0 }) } }
  );

  const { data: feedbackData, isLoading: feedbackLoading } = useGetFeedbackList(
    {},
    { query: { queryKey: getGetFeedbackListQueryKey() } }
  );

  const createFeedback = useCreateFeedback({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFeedbackListQueryKey() });
        setAnalysisId("");
        setAnswers(EMPTY_ANSWERS);
        toast({ title: "Feedback submitted", description: "Thank you for your feedback." });
      },
      onError: () => {
        toast({ title: "Couldn't submit feedback", description: "Please try again.", variant: "destructive" });
      },
    },
  });

  const deleteFeedback = useDeleteFeedback({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFeedbackListQueryKey() });
      },
      onError: () => {
        toast({ title: "Couldn't delete feedback", description: "Please try again.", variant: "destructive" });
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!analysisId || answers.rating === 0) return;
    createFeedback.mutate({ data: { analysisId: parseInt(analysisId), ...answersToRequest(answers) } });
  }

  const recentAnalyses = historyData?.items ?? [];
  const feedbackItems = feedbackData?.items ?? [];

  return (
    <Shell>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Feedback</h1>
          <p className="text-sm text-muted-foreground mt-1">Rate analyses and help improve the system.</p>
        </div>

        {/* Submit Form */}
        <div className="bg-card border border-card-border rounded-lg p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Submit Feedback</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Analysis</Label>
              {recentAnalyses.length > 0 ? (
                <select
                  value={analysisId}
                  onChange={(e) => setAnalysisId(e.target.value)}
                  className="w-full bg-card border border-card-border rounded px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select an analysis...</option>
                  {recentAnalyses.map((a) => (
                    <option key={a.id} value={a.id}>
                      #{a.id} — {a.situation.slice(0, 60)}{a.situation.length > 60 ? "..." : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  placeholder="Analysis ID"
                  value={analysisId}
                  onChange={(e) => setAnalysisId(e.target.value)}
                  className="w-full bg-card border border-card-border rounded px-3 py-2 text-sm text-foreground"
                />
              )}
            </div>

            <FeedbackFields value={answers} onChange={setAnswers} disabled={createFeedback.isPending} />

            <Button
              type="submit"
              disabled={!analysisId || answers.rating === 0 || createFeedback.isPending}
              className="w-full bg-primary text-primary-foreground hover:opacity-90"
            >
              {createFeedback.isPending ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Submitting...</span>
              ) : (
                "Submit Feedback"
              )}
            </Button>
          </form>
        </div>

        {/* Feedback List */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">
            Recent Feedback
            {feedbackData?.total != null && (
              <span className="text-sm font-normal text-muted-foreground ml-2">({feedbackData.total} total)</span>
            )}
          </h2>

          {feedbackLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!feedbackLoading && feedbackItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No feedback submitted yet.</p>
          )}

          <div className="space-y-3">
            {feedbackItems.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-card-border rounded-lg px-4 py-4 flex items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground font-mono">#{f.analysisId}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`w-3.5 h-3.5 ${n <= f.rating ? "text-orange-700 fill-orange-400" : "text-muted-foreground"}`}
                        />
                      ))}
                    </div>
                    {f.accuracy != null && (
                      <span className="text-xs text-muted-foreground">accuracy: {f.accuracy}/5</span>
                    )}
                    {f.helpful != null && (
                      <span className={`text-xs ${f.helpful ? "text-green-700" : "text-red-700"}`}>
                        {f.helpful ? "helpful" : "not helpful"}
                      </span>
                    )}
                  </div>
                  {f.situationSnippet && (
                    <p className="text-xs text-muted-foreground truncate mb-1">{f.situationSnippet}</p>
                  )}
                  {f.comment && <p className="text-sm text-foreground">{f.comment}</p>}
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(f.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete feedback"
                  onClick={() => deleteFeedback.mutate({ id: Number(f.id) })}
                  className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-red-700 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
