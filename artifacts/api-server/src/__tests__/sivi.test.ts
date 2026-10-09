import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntent } from "../services/ajit.service.js";
import { detectEmotion } from "../services/manu.service.js";
import { extractContext, parseAiSimulation, simulatePaths } from "../services/sivi.service.js";
import { buildPrompt, parseAiAnswer } from "../services/synthesis.service.js";
import { runEngine } from "../services/engine.service.js";
import { NO_CALIBRATION } from "../services/calibration.service.js";

const sim = (t: string) => simulatePaths(detectIntent(t).result, detectEmotion(t).result, t);

test("SIVI: context separates what the person wants, the facts and the limits", () => {
  const c = extractContext(
    "I want to start my own business. I have been working at this company for five years. I cannot quit before my notice period ends. Should I do it?",
    "career",
  );
  assert.match(c.desiredOutcome, /start my own business/);
  assert.equal(c.inferred, false);
  assert.ok(c.knownFacts.some((f) => /five years/.test(f)));
  assert.ok(c.constraints.some((f) => /notice period/.test(f)));
});

test("SIVI: a desired outcome that was not stated is marked as guessed", () => {
  const c = extractContext("Things are strange lately", "unclear");
  assert.equal(c.inferred, true);
  assert.ok(c.desiredOutcome.length > 0);
});

test("SIVI: every path has benefits, downsides and uncertainties, and a comparison is given", () => {
  const r = sim("I am thinking about leaving my job for another offer, what should I do about my career?");
  assert.equal(r.source, "rules");
  for (const p of [r.bestPath, ...r.alternatives]) {
    assert.ok(p.benefits.length > 0 && p.downsides.length > 0 && p.uncertainties.length > 0);
  }
  assert.equal(r.alternatives.length, 2);
  assert.match(r.comparison, /ranks first/);
  assert.match(r.comparison, /not a prediction/);
});

test("SIVI: when upset, a move that cannot be undone is rated riskier and does not win", () => {
  const calm = sim("I want to leave my job and look at a new career option, I feel fine about it");
  const upset = sim("I HATE my job!! I am furious and so angry, I want to quit my career right now!");
  const quit = (r: ReturnType<typeof sim>) => [r.bestPath, ...r.alternatives].find((p) => !p.reversible)!;
  assert.ok(["medium", "high"].includes(quit(upset).risk));
  assert.equal(upset.bestPath.reversible, true);
  assert.ok(calm.bestPath.risk === "low" || calm.bestPath.risk === "medium");
});

test("SIVI: wanting to avoid a fight makes confronting paths riskier", () => {
  const r = sim("I don't want to fight with my brother but he keeps provoking me in this argument");
  const confront = [r.bestPath, ...r.alternatives].find((p) => /directly/.test(p.action))!;
  assert.ok(confront.risk !== "low");
  assert.match(r.comparison, /avoid confrontation/);
});

test("SIVI: the AI's paths are validated and used", () => {
  const r = parseAiSimulation({
    situationContext: { desiredOutcome: "Move to a better role", knownFacts: ["5 years in the same team"], constraints: ["Notice period of 60 days"] },
    paths: [
      { action: "Negotiate a role change inside the company", benefits: ["No notice period issue"], downsides: ["May be refused"], uncertainties: ["Manager's view"], reversible: true, risk: "low", stability: "high" },
      { action: "Resign and join the new company", benefits: ["Higher pay"], downsides: ["Hard to undo"], uncertainties: ["Team culture"], reversible: false, risk: "high", stability: "low" },
    ],
    bestPath: 0,
    pathComparison: "Negotiating keeps your income safe while you learn more.",
  });
  assert.ok(r);
  assert.equal(r!.source, "ai");
  assert.equal(r!.bestPath.action, "Negotiate a role change inside the company");
  assert.equal(r!.bestPath.outcome, "positive");
  assert.equal(r!.alternatives[0].outcome, "negative");
  assert.equal(r!.context.constraints[0], "Notice period of 60 days");
  assert.equal(r!.comparison, "Negotiating keeps your income safe while you learn more.");
});

test("SIVI: unusable AI paths are rejected, a bad best index falls back to the scoring", () => {
  assert.equal(parseAiSimulation({ paths: [{ action: "Only one" }] }), null);
  assert.equal(parseAiSimulation({}), null);
  const r = parseAiSimulation({
    paths: [
      { action: "Risky", risk: "high", stability: "low", reversible: false },
      { action: "Safe", risk: "low", stability: "high", reversible: true },
    ],
    bestPath: 9,
  });
  assert.equal(r!.bestPath.action, "Safe");
  assert.ok(r!.comparison.length > 0);
});

test("SIVI: the prompt asks the AI for context and paths, and parseAiAnswer carries them", () => {
  const t = "Should I leave my stable job to start my own company? I am worried about money.";
  const p = buildPrompt(t, runEngine(t, {}), NO_CALIBRATION, "standard");
  assert.match(p, /SIVI TASK/);
  assert.match(p, /"situationContext"/);
  assert.match(p, /"pathComparison"/);
  const a = parseAiAnswer(
    JSON.stringify({
      logicScore: 55, summary: "S",
      paths: [{ action: "A", risk: "low", stability: "high" }, { action: "B", risk: "high", stability: "low" }],
    }),
  );
  assert.equal(a?.simulation?.bestPath.action, "A");
});

test("SIVI paths: running one as a new question costs half, rounded up, and the AI part is refunded in proportion", async () => {
  const { computeCost, pathFollowUpPrice, withoutAi } = await import("../services/credit-cost.service.js");
  const t = "Should I leave my stable job to start my own company? I am worried about money.";
  const full = computeCost(t, runEngine(t, {}), "standard");
  const half = pathFollowUpPrice(full);
  assert.ok(half.total < full.total && half.total >= Math.floor(full.total / 2));
  assert.equal(half.total, half.lines.reduce((n, l) => n + l.credits, 0));
  assert.equal(half.aiCredits, Math.ceil(full.aiCredits / 2));
  assert.equal(withoutAi(half).total, half.total - half.aiCredits);
  assert.match(half.lines[0].note, /Half price/);
});
