/**
 * What usually happens in real life, per topic. These are general, widely seen patterns from
 * forecasting research (base rates, the outside view, the planning fallacy) and from common human
 * experience. They are a starting point ("the base rate"), never a fact about this person: the AI
 * and the built-in reasoner may move away from them only for things the person actually stated.
 */

/** Rules of careful forecasting (Tetlock's superforecasting, Kahneman's outside view). */
export const FORECAST_PRIMER = `HOW TO FORECAST CAREFULLY (use it silently; do not recite it):
- Start from the OUTSIDE VIEW: how often does a situation like this usually turn out well for people in general (the base rate)? Begin there, then move up or down only for real, stated facts about THIS person. Feeling that "my case is special" is not a reason to move.
- Break the question into parts you can judge (what must go right, who else decides, how long it takes) and judge each part, instead of one gut feeling.
- PLANNING FALLACY: plans, healing, approvals, replies and relationships almost always take longer than hoped. When you give days, lean to the slower side.
- Give the strongest argument AGAINST your own answer, and say what new fact would change your mind (keyUnknowns).
- Be calibrated: certainty is rare. Keep scores away from the extremes unless a fact settles it (a rule, a law, a stated refusal); use roughly 10-90 for most things. A chance is a range of honesty, not a promise.
- Do not let one vivid detail, or the person's mood right now, outweigh the many ordinary things that decide the result. Strong feelings make bad outcomes look likelier and good ones look surer than they are.
- When the person controls the result, say what they can DO to improve the odds; when others decide, say what is outside their control.`;

/** Usual real-life patterns by AJIT intent (general experience, not facts about this person). */
export const TOPIC_PATTERNS: Record<string, string> = {
  decision: "Big choices are usually regretted more for things not tried than for things tried, but irreversible, costly choices deserve extra time. A small, reversible test first often beats a big leap. Deciding while upset or in a hurry usually goes worse.",
  relationship: "Most relationship trouble comes from unspoken expectations and poor timing of talks, not from lack of love. A calm, direct, kind conversation solves more than waiting or hinting. Patterns that repeat for a long time rarely change without a clear, shared effort. People seldom change because they are pushed.",
  conflict: "Most fights cool down when someone listens first and the real need under the anger is named. Replying in the heat of the moment usually makes it worse. A third, neutral person or a written record helps when trust is low.",
  career: "Job changes and promotions usually take longer than people expect, and offers come mostly through people who already know your work. A new job is judged best on growth, manager and pay together, not one alone. Quitting before an offer is signed carries real risk.",
  health: "Most everyday symptoms settle on their own, but a symptom that is new, severe, getting worse or lasting more than a couple of weeks deserves a doctor. Recovery is slower than people hope, and steady routine matters more than one big step. Only a qualified doctor can judge a medical question.",
  money: "Most money problems ease with a written budget, an emergency saving and steady habits rather than one big win. Returns that look too good usually carry a hidden risk. Do not borrow or invest more than you can afford to lose, and check any scheme with a trusted professional.",
  education: "Results follow steady daily effort, sleep and practice with past papers more than last-minute pushes. Admissions and results usually have more than one route, so a plan B is wise. Comparing yourself to others tends to lower performance.",
  travel: "Visas, bookings and approvals nearly always take longer than planned, and delays are common. Papers that are complete and early are the biggest lever. Keep a buffer in dates and money.",
  family: "Family matters move slowly and improve with patience, respect and talking at a calm time. Older people usually soften with time and listening, not with pressure. Taking one clear small step is better than trying to settle everything at once.",
  legal: "Legal matters nearly always take longer and cost more than expected, and many settle before a final judgement. Written records, dates and documents decide more than arguments. A qualified lawyer must judge the actual case.",
  business: "Most new businesses and projects take longer to earn than planned, and many cash-flow problems come before profit. A small, cheap test with real customers is more reliable than a big plan on paper. Keep reserves for the slow months.",
  mind: "Low mood, worry and stress are common and usually ease with sleep, movement, talking to someone you trust and small steady routines. Thoughts in a hard hour are often harsher than the facts. If it lasts, or feels unbearable, a counsellor or doctor can help.",
  property: "Property deals nearly always take longer than promised, and papers (title, approvals, loans) cause most delays. Check documents with a professional before paying. Buying under pressure or on a rumour is a common cause of regret.",
  lost: "Lost things are most often found in the last place you were calm, or where you did something on autopilot, or with someone close. Search the nearby and ordinary places carefully before the far ones. Retracing your steps works better than guessing.",
  unclear: "When the question is vague, the usual answer is to name the one thing you want, the one thing blocking it, and the smallest step you can take this week.",
};

export function topicPattern(intent: string): string {
  return TOPIC_PATTERNS[intent] ?? TOPIC_PATTERNS.unclear!;
}
