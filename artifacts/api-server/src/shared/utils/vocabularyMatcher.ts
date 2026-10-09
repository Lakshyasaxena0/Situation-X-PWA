// Context-aware vocabulary matcher (used by AJIT).
//
// It does more than count words:
//   - words are matched per clause, so "I like my job but I hate my boss" is read clause by clause;
//   - negation is understood on both sides, English ("I do not have pain", "no problem") and
//     Hinglish ("dard nahi hai"): a negated symptom or generic problem is dropped, while a negated
//     topic ("I don't want to fight") stays, flagged as something the person wants to AVOID;
//   - intensifiers ("very", "bahut") and softeners ("thoda") scale a word;
//   - words in a question sentence count a little more;
//   - each distinct word counts once, at its best occurrence, so repeating a word does not win;
//   - Hindi in Devanagari works (the older matcher dropped it).
//
// It still does not understand meaning the way a person does (sarcasm, someone else's situation):
// the AI re-reads the whole text for that. The evidence it returns makes every decision visible.

import {
  CLAUSE_BREAKS,
  DESIRE_CUES,
  DIMINISHERS,
  DIMINISHER_FACTOR,
  INTENSIFIERS,
  INTENSIFIER_FACTOR,
  NEGATORS_AFTER,
  NEGATORS_BEFORE,
  QUESTION_FACTOR,
  SOFTEN_FACTOR,
  type VocabEntry,
  type Vocabulary,
} from "../constants/vocabulary.js";

export type Hit = {
  term: string;
  /** The word as the person wrote it. */
  matched: string;
  weight: number;
  /** What the word is worth after negation, intensifiers and the question bonus. */
  effective: number;
  negated: boolean;
  /** True when the negation was a wish to avoid it ("I don't want to fight"). */
  avoids: boolean;
};

export type KeyScore = { key: string; score: number; hits: Hit[] };

export type MatchResult = {
  /** Every key with at least one hit, highest score first. */
  ranking: KeyScore[];
  /** Keys whose topic the person says they want to avoid. */
  avoided: string[];
};

const ENDINGS = ["s", "es", "ed", "d", "ing", "ly"];

function wordMatches(token: string, term: string): boolean {
  if (term.endsWith("*")) return token.startsWith(term.slice(0, -1));
  if (token === term) return true;
  if (term.length < 3) return false;
  if (ENDINGS.some((e) => token === term + e)) return true;
  // "love" -> "loving", "argue" -> "arguing"
  return term.endsWith("e") && token === term.slice(0, -1) + "ing";
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[‘’`]/g, "'")
    .replace(/(\p{L})'(\p{L})/gu, "$1$2");
}

type Clause = { tokens: string[]; question: boolean };

function splitClauses(text: string): Clause[] {
  const sentences = normalize(text).match(/[^.!?।\n]+[.!?।]*/gu) ?? [];
  const clauses: Clause[] = [];
  for (const sentence of sentences) {
    const question = sentence.includes("?");
    for (const part of sentence.split(CLAUSE_BREAKS)) {
      const tokens = part.replace(/[^\p{L}\p{N}\p{M}\s*]/gu, " ").split(/\s+/).filter(Boolean);
      if (tokens.length) clauses.push({ tokens, question });
    }
  }
  return clauses;
}

function findTerm(tokens: string[], entry: VocabEntry, from = 0): { start: number; end: number } | null {
  const parts = entry.term.split(" ");
  for (let i = from; i + parts.length <= tokens.length; i++) {
    if (parts.every((p, j) => wordMatches(tokens[i + j], p))) return { start: i, end: i + parts.length };
  }
  return null;
}

/** Scores every key of the vocabulary against the text. */
export function matchVocabulary(text: string, vocabulary: Vocabulary): MatchResult {
  const clauses = splitClauses(text);
  const best = new Map<string, Map<string, Hit>>();
  const avoided = new Set<string>();

  for (const [key, entries] of Object.entries(vocabulary)) {
    const perTerm = new Map<string, Hit>();
    for (const entry of entries) {
      for (const clause of clauses) {
        const { tokens } = clause;
        for (let from = 0; ; ) {
          const span = findTerm(tokens, entry, from);
          if (!span) break;
          from = span.start + 1;

          const before = tokens.slice(Math.max(0, span.start - 3), span.start);
          const after = tokens.slice(span.end, span.end + 3);
          const negated = before.some((t) => NEGATORS_BEFORE.has(t)) || after.some((t) => NEGATORS_AFTER.has(t));
          const intensified = tokens.slice(Math.max(0, span.start - 2), span.start).some((t) => INTENSIFIERS.has(t));
          const diminished = tokens.slice(Math.max(0, span.start - 2), span.start).some((t) => DIMINISHERS.has(t));
          const wantsToAvoid = negated && entry.negation === "soften" && tokens.some((t) => DESIRE_CUES.has(t));

          let effective = entry.weight;
          if (negated) effective *= entry.negation === "cancel" ? 0 : SOFTEN_FACTOR;
          if (intensified) effective *= INTENSIFIER_FACTOR;
          if (diminished) effective *= DIMINISHER_FACTOR;
          if (clause.question) effective *= QUESTION_FACTOR;

          const hit: Hit = {
            term: entry.term,
            matched: tokens.slice(span.start, span.end).join(" "),
            weight: entry.weight,
            effective: Math.round(effective * 100) / 100,
            negated,
            avoids: wantsToAvoid,
          };
          const prev = perTerm.get(entry.term);
          // Each distinct word counts once, at its strongest occurrence.
          if (!prev || hit.effective > prev.effective || (hit.effective === prev.effective && hit.avoids && !prev.avoids)) perTerm.set(entry.term, hit);
        }
      }
    }
    if (perTerm.size) best.set(key, perTerm);
  }

  const ranking: KeyScore[] = [...best.entries()]
    .map(([key, hits]) => {
      const list = [...hits.values()].sort((a, b) => b.effective - a.effective);
      return { key, score: Math.round(list.reduce((s, h) => s + h.effective, 0) * 100) / 100, hits: list };
    })
    .filter((k) => k.score > 0 || k.hits.some((h) => h.negated))
    .sort((a, b) => b.score - a.score);

  for (const k of ranking) if (k.hits.some((h) => h.avoids && h.effective > 0)) avoided.add(k.key);
  return { ranking, avoided: [...avoided] };
}
