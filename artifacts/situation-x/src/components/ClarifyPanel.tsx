import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageCircleQuestion } from "lucide-react";

export type Answered = { question: string; answer: string };

/**
 * One short question at a time, asked before the analysis. The person taps a quick answer, types their
 * own, or skips; the answers are added to the situation. Nothing here costs credits.
 */
export function ClarifyPanel({
  question, why, choices, round, max, answered, busy, onAnswer, onSkip,
}: {
  question: string;
  why: string;
  choices: string[];
  round: number;
  max: number;
  answered: Answered[];
  busy: boolean;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState("");
  const send = (a: string) => {
    const v = a.trim();
    if (!v || busy) return;
    setText("");
    onAnswer(v);
  };

  return (
    <section aria-label="A quick question" className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
          <MessageCircleQuestion className="w-4 h-4 text-primary" aria-hidden /> A quick question first
        </span>
        <span>{Math.min(round + 1, max)} of up to {max} &middot; free</span>
      </div>

      {answered.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {answered.map((a, i) => (
            <li key={i}>
              {a.question} <span className="text-foreground">{a.answer}</span>
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite">
        <p className="text-sm font-medium text-foreground">{question}</p>
        {why && <p className="text-xs text-muted-foreground mt-0.5">{why}</p>}
      </div>

      {choices.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick answers">
          {choices.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              onClick={() => send(c)}
              className="px-3 py-1.5 rounded border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={text}
          maxLength={500}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Or answer in your own words"
          aria-label="Your answer"
        />
        <Button type="button" size="sm" disabled={busy || !text.trim()} onClick={() => send(text)}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
        </Button>
      </div>

      <button type="button" disabled={busy} onClick={onSkip} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50">
        Skip the questions
      </button>
    </section>
  );
}
