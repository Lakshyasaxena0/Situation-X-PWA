import { test } from "node:test";
import assert from "node:assert/strict";
import { runEngine } from "../services/engine.service.js";
import { buildPrompt, synthesize } from "../services/synthesis.service.js";
import { computeCost } from "../services/credit-cost.service.js";
import { NO_CALIBRATION } from "../services/calibration.service.js";

const text = "Should I leave my stable job to start my own company? When will it work out? I am worried about money.";
const engine = runEngine(text, {});
const aiJson = JSON.stringify({
  situationAnalysis: "Analysis", risks: ["r"], keyUnknowns: ["k"], logicScore: 60, astrologyAssessment: "Astro text",
  astroAlignment: "mixed", finalScore: 58, summary: "Summary", advice: "Advice", nextSteps: ["a", "b"], timeframeDays: 30,
});

test("Prompt: the AI is told to reason in steps, uses the astrology and timing, and the chosen language", () => {
  const p = buildPrompt(text, engine, NO_CALIBRATION, "deep", { useAi: true, useAstrology: true, language: "hinglish" });
  assert.match(p, /STEP 1 - YOUR OWN JUDGMENT/);
  assert.match(p, /STEP 2 - THE ASTROLOGY VERDICT/);
  assert.match(p, /STEP 3 - RECONCILE/);
  assert.match(p, /Vimshottari/);
  assert.match(p, /Chara/);
  assert.match(p, /THE QUESTION ASKS ABOUT TIMING/);
  assert.match(p, /Hinglish/);
  assert.match(p, /astrologyAssessment/);
});

test("Prompt: with astrology off the AI is not given any chart", () => {
  const p = buildPrompt(text, engine, NO_CALIBRATION, "standard", { useAi: true, useAstrology: false, language: "en" });
  assert.match(p, /ASTROLOGY IS SWITCHED OFF/);
  assert.doesNotMatch(p, /Lagna/);
  assert.doesNotMatch(p, /Vimshottari/);
  assert.doesNotMatch(p, /astrologyAssessment/);
  assert.match(p, /English/);
});

test("Synthesis: AI + astrology blend 60/40", async () => {
  const s = await synthesize(text, engine, NO_CALIBRATION, async () => aiJson, "standard");
  assert.equal(s.source, "ai+astro");
  assert.equal(s.usedAi, true);
  assert.equal(s.usedAstrology, true);
  assert.deepEqual(s.weights, { logic: 0.6, astro: 0.4 });
  assert.equal(s.logicScore, 60);
});

test("Synthesis: AI off never calls the AI", async () => {
  let called = false;
  const s = await synthesize(text, engine, NO_CALIBRATION, async () => { called = true; return aiJson; }, "standard", { useAi: false, useAstrology: true, language: "auto" });
  assert.equal(called, false);
  assert.equal(s.source, "engine");
  assert.equal(s.usedAi, false);
  assert.equal(s.usedAstrology, true);
});

test("Synthesis: astrology off uses the AI's own judgment only", async () => {
  const s = await synthesize(text, engine, NO_CALIBRATION, async () => aiJson, "standard", { useAi: true, useAstrology: false, language: "auto" });
  assert.equal(s.source, "ai");
  assert.equal(s.usedAstrology, false);
  assert.deepEqual(s.weights, { logic: 1, astro: 0 });
  assert.equal(s.astroScore, undefined);
  assert.ok(Math.abs(s.score - 60) <= 12);
});

test("Synthesis: both off gives the module answer", async () => {
  const s = await synthesize(text, engine, NO_CALIBRATION, async () => aiJson, "standard", { useAi: false, useAstrology: false, language: "auto" });
  assert.equal(s.source, "engine");
  assert.equal(s.usedAstrology, false);
  assert.match(s.astroInsight, /switched off/);
});

test("Synthesis: unusable AI output falls back to the engine answer", async () => {
  const s = await synthesize(text, engine, NO_CALIBRATION, async () => "not json", "standard");
  assert.equal(s.source, "engine");
  assert.equal(s.usedAi, false);
});

test("Cost: switching astrology or AI off removes their credits", () => {
  const full = computeCost(text, engine, "standard");
  const noAstro = computeCost(text, engine, "standard", { useAi: true, useAstrology: false });
  const noAi = computeCost(text, engine, "standard", { useAi: false, useAstrology: true });
  assert.ok(full.lines.some((l) => l.key === "astro") && full.lines.some((l) => l.key === "ai"));
  assert.ok(!noAstro.lines.some((l) => l.key === "astro"));
  assert.ok(!noAi.lines.some((l) => l.key === "ai"));
  assert.equal(noAi.aiCredits, 0);
  assert.ok(noAstro.total < full.total && noAi.total < full.total);
});
