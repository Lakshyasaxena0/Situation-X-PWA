import { Star } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ActionTaken = "followed" | "other" | "nothing";
export type ResultKind = "better" | "same" | "worse";

export type FeedbackAnswers = {
  rating: number;
  actionTaken: ActionTaken | null;
  result: ResultKind | null;
  reasonTags: string[];
  comment: string;
};

export const EMPTY_ANSWERS: FeedbackAnswers = { rating: 0, actionTaken: null, result: null, reasonTags: [], comment: "" };

const ACTIONS: { value: ActionTaken; label: string }[] = [
  { value: "followed", label: "Did the suggested step" },
  { value: "other", label: "Did something else" },
  { value: "nothing", label: "Did nothing" },
];

const RESULTS: { value: ResultKind; label: string }[] = [
  { value: "better", label: "Better" },
  { value: "same", label: "No change" },
  { value: "worse", label: "Worse" },
];

const TAGS: { value: string; label: string }[] = [
  { value: "advice_right", label: "The advice was right" },
  { value: "steps_helpful", label: "Steps were helpful" },
  { value: "astrology_helped", label: "Astrology helped" },
  { value: "missed_perspective", label: "Other person's view missing" },
  { value: "missed_facts", label: "Missed important facts" },
  { value: "too_generic", label: "Too generic" },
  { value: "steps_unrealistic", label: "Steps not realistic" },
  { value: "timing_off", label: "Timing was off" },
  { value: "astrology_off", label: "Astrology felt off" },
];

function Chips<T extends string>({ items, value, onPick, label }: { items: { value: T; label: string }[]; value: T | null; onPick: (v: T | null) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {items.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onPick(value === o.value ? null : o.value)}
          className={`px-3 py-1.5 rounded text-sm border transition-colors ${value === o.value ? "bg-primary/15 border-primary text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The four feedback questions: how useful, what you did, what actually happened, and why.
 * One low rating never means the whole advice was wrong: the reasons say what was missing.
 */
export function FeedbackFields({ value, onChange, disabled }: { value: FeedbackAnswers; onChange: (v: FeedbackAnswers) => void; disabled?: boolean }) {
  const set = (patch: Partial<FeedbackAnswers>) => onChange({ ...value, ...patch });
  const toggleTag = (t: string) =>
    set({ reasonTags: value.reasonTags.includes(t) ? value.reasonTags.filter((x) => x !== t) : [...value.reasonTags, t] });

  return (
    <fieldset disabled={disabled} className="space-y-5">
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">1. How useful was this? (1 = not at all, 5 = very)</Label>
        <div className="flex items-center gap-1" role="group" aria-label="Usefulness rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => set({ rating: n })} className="p-0.5">
              <Star className={`w-6 h-6 ${n <= value.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">2. What did you do?</Label>
        <Chips items={ACTIONS} value={value.actionTaken} onPick={(v) => set({ actionTaken: v })} label="Action taken" />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">3. How did it actually turn out?</Label>
        <Chips items={RESULTS} value={value.result} onPick={(v) => set({ result: v })} label="Actual result" />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">4. What was right, or what was missed? (pick any)</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Reasons">
          {TAGS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={value.reasonTags.includes(t.value)}
              onClick={() => toggleTag(t.value)}
              className={`px-3 py-1.5 rounded text-sm border transition-colors ${value.reasonTags.includes(t.value) ? "bg-primary/15 border-primary text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Textarea
          value={value.comment}
          maxLength={2000}
          onChange={(e) => set({ comment: e.target.value })}
          placeholder="In your own words (optional)"
          className="mt-3 text-sm min-h-[64px]"
        />
      </div>
    </fieldset>
  );
}

/** What to send to the server for these answers. */
export function answersToRequest(a: FeedbackAnswers) {
  return {
    rating: a.rating,
    actionTaken: a.actionTaken ?? undefined,
    result: a.result ?? undefined,
    reasonTags: a.reasonTags.length ? (a.reasonTags as never) : undefined,
    comment: a.comment.trim() || undefined,
  };
}
