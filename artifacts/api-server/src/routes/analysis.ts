import { Router } from "express";
import { db, analysesTable } from "@workspace/db";
import { and, eq, desc, count } from "drizzle-orm";
import {
  AnalyzeSituationBody,
  GetAnalysisHistoryQueryParams,
  GetAnalysisByIdParams,
  DeleteAnalysisParams,
} from "@workspace/api-zod";
import { runEngine } from "../services/engine.service.js";
import { currentUserId } from "../middlewares/requireUser.js";
import { getCalibration } from "../services/calibration.service.js";
import { synthesize } from "../services/synthesis.service.js";
import { computeCost, withoutAi, type CreditCost } from "../services/credit-cost.service.js";
import type { AnalysisOptions } from "../services/analysis-options.js";
import type { BirthInput } from "../services/timing.service.js";
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
  birth?: BirthInput;
};
type ParseOutcome = { ok: true; data: Parsed } | { ok: false; status: number; body: { error: string; message: string } };

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

  let birth: BirthInput | undefined;
  const b = parseResult.data.birth;
  if (b) {
    const at = new Date(b.datetime);
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() || at.getUTCFullYear() < 1800) {
      return { ok: false, status: 400, body: { error: "invalid_birth", message: "Birth date and time must be a valid moment in the past." } };
    }
    if (!Number.isFinite(b.latitude) || Math.abs(b.latitude) > 90 || !Number.isFinite(b.longitude) || Math.abs(b.longitude) > 180) {
      return { ok: false, status: 400, body: { error: "invalid_birth", message: "Birth place coordinates are out of range." } };
    }
    birth = { at, latitude: b.latitude, longitude: b.longitude };
  }
  const options: AnalysisOptions = {
    useAi: parseResult.data.useAi ?? true,
    useAstrology: parseResult.data.useAstrology ?? true,
    language: parseResult.data.language ?? "auto",
  };
  return { ok: true, data: { situation, latitude, longitude, depth, options, birth } };
}

router.post("/analysis/estimate", async (req, res) => {
  const parsed = parseSituationRequest(req.body);
  if (!parsed.ok) {
    res.status(parsed.status).json(parsed.body);
    return;
  }
  try {
    const { situation, latitude, longitude, depth, options, birth } = parsed.data;
    const userId = currentUserId(res);
    const cost = computeCost(situation, runEngine(situation, { latitude, longitude, birth, useAstrology: options.useAstrology }), depth, options);
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
  const { situation, latitude, longitude, depth, options, birth } = parsed.data;
  const userId = currentUserId(res);
  const billingActive = billingActiveFor(userId);
  let charge: { ledgerId: number; balance: number } | null = null;

  try {
    // Step 1: Run the local engine pipeline (AJIT → MANU → Ethical Filter → ASTRO → SIVI)
    const engineResult = runEngine(situation, { latitude, longitude, birth, useAstrology: options.useAstrology });

    // The price is fixed by the modules involved and the reasoning level, so it is charged up front
    // (atomically, never below zero) and the AI part is given back if the AI cannot answer.
    const cost: CreditCost = computeCost(situation, engineResult, depth, options);
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
    const synthesis = await synthesize(situation, engineResult, calibration, undefined, cost.depth, options);

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
      ...engineResult.modules,
      {
        key: "AI" as const,
        name: "AI - reasoning",
        area: "synthesis" as const,
        active: aiAnswered,
        verdict: aiAnswered
          ? `Own judgment ${synthesis.logicScore}/100${synthesis.astroAlignment ? `; astrology ${synthesis.astroAlignment} it` : ""}; final ${synthesis.score}/100 (${synthesis.verdict}).`
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
      simulation: engineResult.simulation,
      finalVerdict: engineResult.finalVerdict,
      astro: engineResult.astro,
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
