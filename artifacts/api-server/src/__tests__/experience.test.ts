import { test } from "node:test";
import assert from "node:assert/strict";
import { TOPIC_PATTERNS, topicPattern, FORECAST_PRIMER } from "../shared/constants/experience.js";
import { applyCalibration } from "../services/calibration.service.js";
import { buildPrompt } from "../services/synthesis.service.js";
import { runEngine } from "../services/engine.service.js";

const INTENTS = ["decision","relationship","conflict","career","health","money","education","travel","family","legal","business","mind","property","lost","unclear"];

test("Experience: every topic has a usual-pattern note and unknown topics fall back", () => {
  for (const i of INTENTS) assert.ok((TOPIC_PATTERNS[i] ?? "").length > 40, i);
  assert.equal(topicPattern("nonsense"), TOPIC_PATTERNS.unclear);
});

test("Experience: scores never reach 0 or 100 (certainty is rare)", () => {
  const cal = { applied: false, hitRate: 0, samples: 0 } as never;
  assert.equal(applyCalibration(100, cal), 95);
  assert.equal(applyCalibration(0, cal), 5);
  assert.equal(applyCalibration(60, cal), 60);
});

test("Experience: the AI prompt carries the forecasting rules and the topic's usual pattern", () => {
  const e = runEngine("Will I get a promotion this year?", {});
  const p = buildPrompt("Will I get a promotion this year?", e, { applied: false, hitRate: 0, samples: 0 } as never);
  assert.ok(p.includes("OUTSIDE VIEW"));
  assert.ok(p.includes(FORECAST_PRIMER.slice(0, 40)));
  assert.ok(p.includes(topicPattern("career").slice(0, 40)));
});
