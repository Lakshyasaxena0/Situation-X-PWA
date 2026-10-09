import { db, feedbackTable, analysesTable, astroTuningTable } from "@workspace/db";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { groqConfigured, groqJsonCompletion } from "../lib/groq.js";
import { logger } from "../lib/logger.js";
import { FACTOR_FAMILIES, NO_TUNING, type FactorFamily, type Tuning } from "./prashna.service.js";

/**
 * The astrology learns from follow-ups, but the AI decides how much to change, within hard limits:
 *  - only people who FOLLOWED the suggested step AND reported how it turned out count as evidence
 *    (a rating alone never moves anything: low stars can mean a missing perspective, not a wrong chart);
 *  - nothing changes before enough answers exist, and at most once a day;
 *  - each weight moves by at most MAX_STEP per change and stays within [MIN_MULT, MAX_MULT];
 *  - the AI only ever sees counts, never anyone's text.
 */
export const MIN_SAMPLES = 30;
export const MIN_NEW_SAMPLES = 15;
export const MIN_FAMILY_SAMPLES = 10;
export const MIN_MULT = 0.7;
export const MAX_MULT = 1.3;
export const MAX_STEP = 0.15;
export const MIN_SHARE = 0.3;
export const MAX_SHARE = 0.5;
export const MAX_SHARE_STEP = 0.05;
export const DEFAULT_SHARE = 0.4;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type FamilyStat = { family: FactorFamily; n: number; supportedAndBetter: number; supportedAndWorse: number; opposedAndBetter: number; opposedAndWorse: number };
export type EvidenceRow = { result: "better" | "same" | "worse"; effects: Partial<Record<FactorFamily, number>>; signal: "favorable" | "neutral" | "challenging" };

/** Net effect per family of one stored reading (positive = pushed toward a good outcome). */
export function familyEffects(factors: { family?: string; effect: number }[] | undefined): Partial<Record<FactorFamily, number>> {
  const out: Partial<Record<FactorFamily, number>> = {};
  for (const f of factors ?? []) {
    if (!f.family || !FACTOR_FAMILIES.includes(f.family as FactorFamily) || typeof f.effect !== "number") continue;
    const fam = f.family as FactorFamily;
    out[fam] = (out[fam] ?? 0) + f.effect;
  }
  return out;
}

/** Per family: how often its push agreed with what actually happened. "same" results carry no signal. */
export function familyStats(rows: EvidenceRow[]): FamilyStat[] {
  return FACTOR_FAMILIES.map((family) => {
    const s: FamilyStat = { family, n: 0, supportedAndBetter: 0, supportedAndWorse: 0, opposedAndBetter: 0, opposedAndWorse: 0 };
    for (const r of rows) {
      const e = r.effects[family];
      if (e === undefined || Math.abs(e) < 2 || r.result === "same") continue;
      s.n += 1;
      const supported = e > 0;
      if (r.result === "better") supported ? s.supportedAndBetter++ : s.opposedAndBetter++;
      else supported ? s.supportedAndWorse++ : s.opposedAndWorse++;
    }
    return s;
  });
}

/** Share of readings in which the family's push agreed with the real result (0-1), or null with too little data. */
export function agreement(s: FamilyStat): number | null {
  if (s.n < MIN_FAMILY_SAMPLES) return null;
  return (s.supportedAndBetter + s.opposedAndWorse) / s.n;
}

export type Proposal = { multipliers: Partial<Record<FactorFamily, number>>; astroShare: number; rationale: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Accepts the AI's answer only in a safe form: unknown families are ignored, every number is clamped to the
 * limits and to one small step away from the current value, and families without enough evidence stay put.
 * Returns null when the answer is unusable or changes nothing.
 */
export function validateProposal(raw: unknown, current: Tuning, stats: FamilyStat[], currentShare: number): Proposal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { multipliers?: unknown; astroShare?: unknown; rationale?: unknown };
  const enough = new Set(stats.filter((s) => s.n >= MIN_FAMILY_SAMPLES).map((s) => s.family));
  const multipliers: Partial<Record<FactorFamily, number>> = {};
  let changed = false;
  if (r.multipliers && typeof r.multipliers === "object") {
    for (const fam of FACTOR_FAMILIES) {
      const v = (r.multipliers as Record<string, unknown>)[fam];
      const base = current.multipliers[fam] ?? 1;
      let next = base;
      if (typeof v === "number" && Number.isFinite(v) && enough.has(fam)) {
        next = clamp(clamp(v, base - MAX_STEP, base + MAX_STEP), MIN_MULT, MAX_MULT);
      }
      next = Math.round(next * 100) / 100;
      if (next !== 1) multipliers[fam] = next;
      if (next !== Math.round(base * 100) / 100) changed = true;
    }
  } else {
    for (const fam of FACTOR_FAMILIES) if (current.multipliers[fam] !== undefined) multipliers[fam] = current.multipliers[fam];
  }
  let astroShare = currentShare;
  if (typeof r.astroShare === "number" && Number.isFinite(r.astroShare)) {
    astroShare = clamp(clamp(r.astroShare, currentShare - MAX_SHARE_STEP, currentShare + MAX_SHARE_STEP), MIN_SHARE, MAX_SHARE);
    astroShare = Math.round(astroShare * 100) / 100;
    if (astroShare !== currentShare) changed = true;
  }
  if (!changed) return null;
  const rationale = typeof r.rationale === "string" ? r.rationale.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  return { multipliers, astroShare, rationale: rationale || "Adjusted from follow-up results." };
}

export function tuningPrompt(stats: FamilyStat[], total: number, current: Tuning, currentShare: number): string {
  const rows = stats
    .map((s) => {
      const a = agreement(s);
      return `- ${s.family}: readings ${s.n}, push agreed with the real result ${a === null ? "(too few to judge)" : Math.round(a * 100) + "%"}, current weight ${current.multipliers[s.family] ?? 1}`;
    })
    .join("\n");
  return `You tune the weights of an astrology (Prashna) scoring engine from real follow-up results. You see only counts.
${total} people followed the suggested step and reported whether things got better or worse. For each factor family below, "push agreed" means: the family pushed toward a good outcome and things got better, or pushed toward a bad outcome and things got worse. Around 50% means the family carries no information; clearly above 50% means it deserves more weight; clearly below means less.
${rows}
Current share of the final score given to astrology: ${currentShare} (allowed ${MIN_SHARE}-${MAX_SHARE}).
Rules: change a weight only when the evidence is clear, by small steps (at most ${MAX_STEP} from the current weight, range ${MIN_MULT}-${MAX_MULT}); leave families marked "too few to judge" unchanged; change astroShare by at most ${MAX_SHARE_STEP}, and only if astrology overall agreed clearly more or less than chance. It is fine to change nothing.
Reply with JSON only: {"multipliers": {"<family>": number, ...}, "astroShare": number, "rationale": "one or two plain sentences"}`;
}

let cache: { at: number; tuning: Tuning } | null = null;
let running = false;

export function invalidateTuningCache(): void {
  cache = null;
}

/** The weighting in force (the newest saved one), cached for a few minutes. The built-in weights on any problem. */
export async function getActiveTuning(): Promise<Tuning> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.tuning;
  let tuning: Tuning = NO_TUNING;
  try {
    const [row] = await db.select().from(astroTuningTable).orderBy(desc(astroTuningTable.id)).limit(1);
    if (row) {
      const m: Partial<Record<FactorFamily, number>> = {};
      for (const fam of FACTOR_FAMILIES) {
        const v = (row.multipliers as Record<string, unknown> | null)?.[fam];
        if (typeof v === "number" && Number.isFinite(v)) m[fam] = clamp(v, MIN_MULT, MAX_MULT);
      }
      tuning = { id: row.id, multipliers: m, astroShare: clamp(row.astroShare, MIN_SHARE, MAX_SHARE) };
    }
  } catch (err) {
    logger.warn({ err }, "Could not read the astrology tuning; using the built-in weights");
  }
  cache = { at: Date.now(), tuning };
  return tuning;
}

/** Looks at new follow-up results and, when there is enough evidence, lets the AI adjust the weights. Never throws. */
export async function maybeTune(): Promise<void> {
  if (running || process.env.ASTRO_TUNING === "off" || !groqConfigured()) return;
  running = true;
  try {
    const [last] = await db.select().from(astroTuningTable).orderBy(desc(astroTuningTable.id)).limit(1);
    if (last && Date.now() - last.createdAt.getTime() < COOLDOWN_MS) return;
    const sinceId = last?.basedOnMaxFeedbackId ?? 0;

    const rows = await db
      .select({ id: feedbackTable.id, result: feedbackTable.result, full: analysesTable.fullAnalysis })
      .from(feedbackTable)
      .innerJoin(analysesTable, eq(analysesTable.id, feedbackTable.analysisId))
      .where(and(eq(feedbackTable.actionTaken, "followed"), isNotNull(feedbackTable.result)));
    const evidence: EvidenceRow[] = [];
    let maxId = 0;
    let fresh = 0;
    for (const r of rows) {
      if (r.result !== "better" && r.result !== "same" && r.result !== "worse") continue;
      const astro = (r.full as { astro?: { prashna?: { factors?: { family?: string; effect: number }[]; signal?: EvidenceRow["signal"] } } } | null)?.astro?.prashna;
      if (!astro?.factors) continue;
      evidence.push({ result: r.result, effects: familyEffects(astro.factors), signal: astro.signal ?? "neutral" });
      maxId = Math.max(maxId, r.id);
      if (r.id > sinceId) fresh += 1;
    }
    if (evidence.length < MIN_SAMPLES || fresh < MIN_NEW_SAMPLES) return;

    const current = await getActiveTuning();
    const currentShare = current.astroShare ?? DEFAULT_SHARE;
    const stats = familyStats(evidence);
    const raw = await groqJsonCompletion(tuningPrompt(stats, evidence.length, current, currentShare), { maxTokens: 400, temperature: 0.2 });
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw ?? ""); } catch { parsed = null; }
    const proposal = validateProposal(parsed, current, stats, currentShare);
    if (!proposal) {
      logger.info("Astrology tuning: the AI proposed no change");
      return;
    }
    await db.insert(astroTuningTable).values({
      multipliers: proposal.multipliers,
      astroShare: proposal.astroShare,
      rationale: proposal.rationale,
      sampleSize: evidence.length,
      basedOnMaxFeedbackId: maxId,
    });
    invalidateTuningCache();
    logger.info({ share: proposal.astroShare }, "Astrology tuning updated");
  } catch (err) {
    logger.warn({ err }, "Astrology tuning skipped");
  } finally {
    running = false;
  }
}
