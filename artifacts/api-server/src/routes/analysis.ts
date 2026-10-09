import { Router } from "express";
import { db, analysesTable } from "@workspace/db";
import { and, eq, desc, count } from "drizzle-orm";
import {
  AnalyzeSituationBody,
  ClarifySituationBody,
  GetAnalysisHistoryQueryParams,
  GetAnalysisByIdParams,
  DeleteAnalysisParams,
} from "@workspace/api-zod";
import { runEngine, siviReport } from "../services/engine.service.js";
import { publicAstro } from "../services/astro.service.js";
import { getActiveTuning } from "../services/astro-tuning.service.js";
import { currentUserId } from "../middlewares/requireUser.js";
import { getCalibration } from "../services/calibration.service.js";
import { extractTexts, translateTexts, translationAvailable } from "../services/translate.service.js";
import { assessSafety } from "../services/safety.service.js";
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH, MAX_ROUNDS, nextQuestion, withClarifications, type Clarification } from "../services/clarify.service.js";
import { synthesize } from "../services/synthesis.service.js";
import { computeCost, pathFollowUpPrice, withoutAi, type CreditCost } from "../services/credit-cost.service.js";
import type { AnalysisOptions } from "../services/analysis-options.js";
import { attachAnalysis, billingActiveFor, debitCredits, getBalance, refundCharge, type DebitResult } from "../services/credits.service.js";

const MAX_SITUATION_LENGTH = 2000; // matches the UI textarea limit
const MAX_PAGE_SIZE = 100;

const router = Router();

type Parsed = {
  situation: string;
  latitude?: number;
  longitude?: number;
  depth: "auto" | "standard" | "deep" | "expert";
  options: AnalysisOptions;
  /** Set when the question is one of the paths SIVI listed in an earlier analysis. */
  fromPath?: { analysisId: number; pathIndex: number };
  /** The questions the app asked first and the person's answers (added to the situation). */
  clarifications: Clarification[];
};
type ParseOutcome = { ok: true; data: Parsed } | { ok: false; status: number; body: { error: string; message: string } };

/** At most MAX_ROUNDS answered questions, trimmed; anything else is dropped. */
function cleanClarifications(raw: { question: string; answer: string }[] | undefined): Clarification[] {
  return (raw ?? [])
    .map((c) => ({ question: c.question.trim().slice(0, MAX_QUESTION_LENGTH), answer: c.answer.trim().slice(0, MAX_ANSWER_LENGTH) }))
    .filter((c) => c.question && c.answer)
    .slice(0, MAX_ROUNDS);
}

/** Shared by /analyze and /estimate so the quoted price always matches the charged price. */
function parseSituationRequest(body: unknown): ParseOutcome {
  const parseResult = AnalyzeSituationBody.safeParse(body);
  if (!parseResult.success) return { ok: false, status: 400, body: { error: "validation_error", message: parseResult.error.message } };

  const { latitude, longitude } = parseResult.data;
  const situation = parseResult.data.situation.trim();
  const depth = parseResult.data.depth ?? "auto";

  if (situation.length < 10) return { ok: false, status: 400, body: { error: "too_short", message: "Situation must be at least 10 characters." } };
  if (situation.length > MAX_SITUATION_LENGTH) {
    return { ok: false, status: 400, body: { error: "too_long", message: `Situation must be at most ${MAX_SITUATION_LENGTH} characters.` } };
  }

  // The Prashna chart is cast for the moment of the question, so no birth data is needed.
  // Location is optional (default New Delhi) and only refines the ascendant.
  if ((latitude === undefined) !== (longitude === undefined)) {
    return { ok: false, status: 400, body: { error: "invalid_location", message: "Provide both latitude and longitude, or neither." } };
  }
  if (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
    return { ok: false, status: 400, body: { error: "invalid_location", message: "latitude must be between -90 and 90." } };
  }
  if (longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    return { ok: false, status: 400, body: { error: "invalid_location", message: "longitude must be between -180 and 180." } };
  }

  const options: AnalysisOptions = {
    useAi: parseResult.data.useAi ?? true,
    useAstrology: parseResult.data.useAstrology ?? true,
    language: parseResult.data.language ?? "auto",
  };
  const fromPath = parseResult.data.fromPath ? { analysisId: parseResult.data.fromPath.analysisId, pathIndex: parseResult.data.fromPath.pathIndex } : undefined;
  const clarifications = cleanClarifications(parseResult.data.clarifications);
  return { ok: true, data: { situation, latitude, longitude, depth, options, fromPath, clarifications } };
}

function blockedBody(d: ReturnType<typeof assessSafety>) {
  return { error: "blocked", category: d.category, message: d.message ?? "This request cannot be analysed." };
}

const MAX_BASE_LENGTH = 1500; // leaves room for the path text inside the 2000 limit

/**
 * A path from SIVI run as a question of its own. The text is built HERE from the person's own
 * earlier analysis, never taken from the request, so the half price cannot be used on any other text.
 * Returns the new situation, or null when the analysis or path does not exist for this user.
 */
async function situationForPath(userId: string, ref: { analysisId: number; pathIndex: number }): Promise<string | null> {
  const [row] = await db
    .select({ situation: analysesTable.situation, fullAnalysis: analysesTable.fullAnalysis })
    .from(analysesTable)
    .where(and(eq(analysesTable.id, ref.analysisId), eq(analysesTable.userId, userId)));
  if (!row) return null;
  const sim = (row.fullAnalysis as { simulation?: { bestPath?: { action?: unknown }; alternatives?: { action?: unknown }[] } } | null)?.simulation;
  const actions = [sim?.bestPath?.action, ...(sim?.alternatives ?? []).map((a) => a?.action)];
  const action = actions[ref.pathIndex];
  if (typeof action !== "string" || !action.trim()) return null;
  const base = row.situation.length > MAX_BASE_LENGTH ? `${row.situation.slice(0, MAX_BASE_LENGTH)}...` : row.situation;
  return `${base}\n\nI am now considering this specific path: "${action.trim()}". What is likely to happen if I take it, what should I watch for, and how does it compare with my other options?`;
}

// Free, but each call can use the AI, so a person can ask for a limited number per hour.
const CLARIFY_LIMIT = 40;
const CLARIFY_WINDOW_MS = 60 * 60 * 1000;
const clarifyCalls = new Map<string, number[]>();
function clarifyAllowed(userId: string, now = Date.now()): boolean {
  const recent = (clarifyCalls.get(userId) ?? []).filter((t) => now - t < CLARIFY_WINDOW_MS);
  if (recent.length >= CLARIFY_LIMIT) {
    clarifyCalls.set(userId, recent);
    return false;
  }
  recent.push(now);
  clarifyCalls.set(userId, recent);
  if (clarifyCalls.size > 5000) for (const [k, v] of clarifyCalls) if (v.every((t) => now - t >= CLARIFY_WINDOW_MS)) clarifyCalls.delete(k);
  return true;
}

router.post("/analysis/clarify", async (req, res) => {
  const parsed = ClarifySituationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }
  const situation = parsed.data.situation.trim();
  if (situation.length < 10) {
    res.status(400).json({ error: "too_short", message: "Situation must be at least 10 characters." });
    return;
  }
  if (situation.length > MAX_SITUATION_LENGTH) {
    res.status(400).json({ error: "too_long", message: `Situation must be at most ${MAX_SITUATION_LENGTH} characters.` });
    return;
  }
  const answers = cleanClarifications(parsed.data.answers);
  const language = parsed.data.language ?? "auto";
  const gate = assessSafety(withClarifications(situation, answers), language);
  if (gate.action === "block") {
    res.status(422).json(blockedBody(gate));
    return;
  }
  if (!clarifyAllowed(currentUserId(res))) {
    res.status(429).json({ error: "too_many_requests", message: "Too many questions in a short time. You can analyse now, or try again later." });
    return;
  }
  try {
    // When the filter has concerns (support / redirect), the questions come from rules only, never from the AI.
    const result = await nextQuestion(situation, answers, language, (parsed.data.useAi ?? true) && gate.action === "allow");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Clarify failed");
    res.json({ done: true, round: answers.length, max: MAX_ROUNDS, source: "rules" });
  }
});

router.post("/analysis/estimate", async (req, res) => {
  const parsed = parseSituationRequest(req.body);
  if (!parsed.ok) {
    res.status(parsed.status).json(parsed.body);
    return;
  }
  try {
    const { latitude, longitude, depth, options, fromPath } = parsed.data;
    const userId = currentUserId(res);
    let situation = parsed.data.situation;
    if (fromPath) {
      const built = await situationForPath(userId, fromPath);
      if (!built) {
        res.status(404).json({ error: "path_not_found", message: "That path was not found in your analysis." });
        return;
      }
      situation = built;
    } else {
      situation = withClarifications(situation, parsed.data.clarifications);
    }
    const gate = assessSafety(situation, options.language);
    if (gate.action === "block") {
      res.status(422).json(blockedBody(gate));
      return;
    }
    const tuning = await getActiveTuning();
    const base = computeCost(situation, runEngine(situation, { latitude, longitude, useAstrology: options.useAstrology, language: options.language, tuning }), depth, options);
    const cost = fromPath ? pathFollowUpPrice(base) : base;
    const billingActive = billingActiveFor(userId);
    const balance = await getBalance(userId);
    res.json({ ...cost, billingActive, balance, enough: !billingActive || balance >= cost.total });
  } catch (err) {
    req.log.error({ err }, "Estimate failed");
    res.status(500).json({ error: "estimate_failed", message: "Failed to estimate the cost" });
  }
});

router.post("/analysis/analyze", async (req, res) => {
  const parsed = parseSituationRequest(req.body);
  if (!parsed.ok) {
    res.status(parsed.status).json(parsed.body);
    return;
  }
  const { latitude, longitude, depth, options, fromPath } = parsed.data;
  const userId = currentUserId(res);
  const billingActive = billingActiveFor(userId);
  let situation = parsed.data.situation;
  if (fromPath) {
    const built = await situationForPath(userId, fromPath);
    if (!built) {
      res.status(404).json({ error: "path_not_found", message: "That path was not found in your analysis." });
      return;
    }
    situation = built;
  } else {
    situation = withClarifications(situation, parsed.data.clarifications);
  }
  // The ethical filter runs first: a request that asks for serious harm is refused before anything is
  // analysed or charged.
  const gate = assessSafety(situation, options.language);
  if (gate.action === "block") {
    res.status(422).json(blockedBody(gate));
    return;
  }
  const tuning = await getActiveTuning();
  let charge: { ledgerId: number; balance: number } | null = null;

  try {
    // Step 1: Run the local engine pipeline (AJIT → MANU → Ethical Filter → ASTRO → SIVI)
    const engineResult = runEngine(situation, { latitude, longitude, useAstrology: options.useAstrology, language: options.language, tuning });

    // The price is fixed by the modules involved and the reasoning level, so it is charged up front
    // (atomically, never below zero) and the AI part is given back if the AI cannot answer.
    const fullCost = computeCost(situation, engineResult, depth, options);
    const cost: CreditCost = fromPath ? pathFollowUpPrice(fullCost) : fullCost;
    if (billingActive) {
      const debit: DebitResult = await debitCredits(userId, cost.total, { lines: cost.lines, depth: cost.depth });
      if (!debit.ok) {
        res.status(402).json({
          error: "insufficient_credits",
          message: `This analysis needs ${cost.total} credits and you have ${debit.balance}.`,
          required: cost.total,
          balance: debit.balance,
          cost,
        });
        return;
      }
      charge = { ledgerId: debit.ledgerId, balance: debit.balance };
    }

    // Step 2: AI and astrology work together on the final answer. The AI sees every module's
    // output plus the dasha/transits, and past follow-up accuracy tempers the result.
    const calibration = await getCalibration(engineResult.intent.intent);
    const { simulation: aiSimulation, withheld, silence: aiSilence, indirectRoute: aiRoute, ...synthesis } = await synthesize(situation, engineResult, calibration, undefined, cost.depth, options);
    // When the AI read the whole situation, its paths replace the rule-based ones (SIVI says which it used).
    const simulation = aiSimulation ?? engineResult.simulation;
    const finalVerdict = aiSimulation
      ? { ...engineResult.finalVerdict, recommendedAction: aiSimulation.bestPath.action, riskLevel: aiSimulation.bestPath.risk }
      : engineResult.finalVerdict;

    // Charged only for what was delivered: without the AI the user still gets the engine +
    // astrology answer, so the AI credits go back.
    const aiAnswered = synthesis.usedAi;
    const aiMissing = options.useAi && !aiAnswered;
    const billed = aiMissing ? withoutAi(cost) : { total: cost.total, lines: cost.lines };
    let balanceNow = charge?.balance ?? null;
    if (charge && aiMissing && (await refundCharge(userId, charge.ledgerId, cost.aiCredits, "ai_unavailable"))) {
      balanceNow = charge.balance + cost.aiCredits;
    }
    const credits = {
      billingActive,
      charged: billingActive ? billed.total : 0,
      balance: balanceNow,
      depth: cost.depth,
      depthChosen: cost.depthChosen,
      lines: billed.lines,
    };
    const summary = synthesis.summary;
    const overallScore = synthesis.score;

    const modules = [
      ...engineResult.modules.map((m) => (m.key === "SIVI" ? siviReport(simulation, engineResult.intent, engineResult.emotion) : m)),
      {
        key: "AI" as const,
        name: "AI - reasoning",
        area: "synthesis" as const,
        role: "Reasons about your whole situation and weighs the astrology as a second opinion.",
        active: aiAnswered,
        verdict: aiAnswered
          ? `Own judgment ${synthesis.logicScore}/100${synthesis.astroAlignment ? `; astrology ${synthesis.astroAlignment} it` : ""}; final ${synthesis.score}/100 (${synthesis.verdict}).`
          : withheld === "safety"
            ? "The AI's answer was held back by the safety check, so the engine and astrology answer is shown (AI credits refunded)."
            : options.useAi
            ? "The AI could not answer this time, so the engine and astrology answer is shown (AI credits refunded)."
            : "Switched off in your settings.",
        evidence: synthesis.reasoning ? [synthesis.reasoning] : [],
      },
    ];
    const fullAnalysis = {
      situation,
      modules,
      options,
      intent: engineResult.intent,
      emotion: engineResult.emotion,
      simulation,
      finalVerdict,
      astro: publicAstro(engineResult.astro),
      silence: aiSilence ?? engineResult.silence ?? undefined,
      indirectRoute: aiRoute ?? engineResult.route ?? undefined,
      clarifications: fromPath ? undefined : parsed.data.clarifications.length ? parsed.data.clarifications : undefined,
      // Only what the person needs to see: a notice when the filter steered or cared for them.
      safety: { action: engineResult.safety.action, category: engineResult.safety.category, message: engineResult.safety.message },
      overallScore,
      summary,
      synthesis,
      credits,
    };
    // Ask the user how it turned out once the predicted window has passed.
    const followUpAt = new Date(Date.now() + synthesis.timeframeDays * 24 * 60 * 60 * 1000);

    const [saved] = await db.insert(analysesTable).values({
      userId,
      situation,
      category: engineResult.intent.intent,
      modules: modules.filter((m) => m.active).map((m) => m.key),
      overallResult: synthesis.verdict,
      overallConfidence: synthesis.confidence,
      overallScore,
      summary,
      fullAnalysis: fullAnalysis as unknown as Record<string, unknown>,
      followUpAt,
    }).returning();
    if (charge) await attachAnalysis(charge.ledgerId, saved.id);

    res.json({ ...fullAnalysis, id: saved.id, followUpAt: followUpAt.toISOString(), createdAt: saved.createdAt.toISOString() });
  } catch (err) {
    // Nothing was delivered, so nothing is charged.
    if (charge) {
      try {
        await refundCharge(userId, charge.ledgerId, Number.MAX_SAFE_INTEGER, "analysis_failed");
      } catch (refundErr) {
        req.log.error({ err: refundErr, ledgerId: charge.ledgerId }, "Refund after failed analysis did not go through");
      }
    }
    req.log.error({ err }, "Analysis failed");
    res.status(500).json({ error: "analysis_failed", message: "Failed to analyze situation" });
  }
});

router.get("/analysis/history", async (req, res) => {
  const parseResult = GetAnalysisHistoryQueryParams.safeParse(req.query);
  // Clamp: unbounded or negative values would otherwise reach SQL LIMIT/OFFSET.
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(parseResult.success ? (parseResult.data.limit ?? 20) : 20)));
  const offset = Math.max(0, Math.floor(parseResult.success ? (parseResult.data.offset ?? 0) : 0));

  const owner = eq(analysesTable.userId, currentUserId(res));
  const [items, [{ total }]] = await Promise.all([
    db.select().from(analysesTable).where(owner).orderBy(desc(analysesTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(analysesTable).where(owner),
  ]);

  res.json({
    items: items.map((item) => ({
      id: item.id,
      situation: item.situation,
      intent: (item.fullAnalysis as Record<string, unknown> | null)?.["intent"] ?? { intent: item.category, confidence: item.overallConfidence, score: 0 },
      emotion: (item.fullAnalysis as Record<string, unknown> | null)?.["emotion"] ?? { emotion: "calm", intensity: "low", score: 0 },
      overallScore: item.overallScore,
      riskLevel: item.overallResult === "YES" ? "low" : item.overallResult === "NO" ? "high" : "medium",
      summary: item.summary,
      fullAnalysis: item.fullAnalysis,
      createdAt: item.createdAt.toISOString(),
    })),
    total,
    limit,
    offset,
  });
});

router.get("/analysis/history/:id", async (req, res) => {
  const parseResult = GetAnalysisByIdParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    res.status(400).json({ error: "invalid_id", message: "Invalid ID" });
    return;
  }

  const [item] = await db
    .select()
    .from(analysesTable)
    .where(and(eq(analysesTable.id, parseResult.data.id), eq(analysesTable.userId, currentUserId(res))));
  if (!item) {
    res.status(404).json({ error: "not_found", message: "Analysis not found" });
    return;
  }

  const { userId: _owner, ...publicItem } = item;
  res.json({ ...publicItem, createdAt: item.createdAt.toISOString() });
});

const TRANSLATE_LANGUAGES = ["en", "hi", "hinglish"] as const;
type TranslateLanguage = (typeof TRANSLATE_LANGUAGES)[number];

router.post("/analysis/history/:id/translate", async (req, res) => {
  const id = Number(req.params.id);
  const language = (req.body as { language?: unknown } | undefined)?.language;
  if (!Number.isInteger(id) || id <= 0 || !TRANSLATE_LANGUAGES.includes(language as TranslateLanguage)) {
    res.status(400).json({ error: "invalid_request", message: "Choose a valid analysis and a language (en, hi or hinglish)." });
    return;
  }
  const lang = language as TranslateLanguage;
  try {
    const [item] = await db
      .select()
      .from(analysesTable)
      .where(and(eq(analysesTable.id, id), eq(analysesTable.userId, currentUserId(res))));
    if (!item) {
      res.status(404).json({ error: "not_found", message: "Analysis not found" });
      return;
    }
    const fa = (item.fullAnalysis ?? {}) as Record<string, unknown>;
    const cached = (fa.translations as Record<string, unknown> | undefined)?.[lang];
    if (cached) {
      res.json({ language: lang, texts: cached });
      return;
    }
    if (!translationAvailable()) {
      res.status(503).json({ error: "translation_unavailable", message: "Translation is not available right now." });
      return;
    }
    const texts = await translateTexts(extractTexts(fa), lang);
    if (!texts) {
      res.status(503).json({ error: "translation_failed", message: "Could not translate this time. Please try again." });
      return;
    }
    const translations = { ...((fa.translations as Record<string, unknown> | undefined) ?? {}), [lang]: texts };
    await db
      .update(analysesTable)
      .set({ fullAnalysis: { ...fa, translations } as unknown as Record<string, unknown> })
      .where(and(eq(analysesTable.id, id), eq(analysesTable.userId, currentUserId(res))));
    res.json({ language: lang, texts });
  } catch (err) {
    req.log.error({ err }, "Translation failed");
    res.status(500).json({ error: "translation_failed", message: "Could not translate this time. Please try again." });
  }
});

router.delete("/analysis/history/:id", async (req, res) => {
  const parseResult = DeleteAnalysisParams.safeParse({ id: Number(req.params.id) });
  if (!parseResult.success) {
    res.status(400).json({ error: "invalid_id", message: "Invalid ID" });
    return;
  }

  const [deleted] = await db
    .delete(analysesTable)
    .where(and(eq(analysesTable.id, parseResult.data.id), eq(analysesTable.userId, currentUserId(res))))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "not_found", message: "Analysis not found" });
    return;
  }

  res.json({ success: true, message: "Analysis deleted" });
});

export default router;
