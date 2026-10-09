import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeAstro, publicAstro } from "../services/astro.service.js";
import { readPrashna, houseProfile, FACTOR_FAMILIES, NO_TUNING } from "../services/prashna.service.js";
import { castPrashnaCharts } from "../services/vedic.service.js";
import { detectFocus } from "../services/significations.js";
import { sunTimesFor, julianDayFromDate } from "../services/ephemeris.service.js";
import { familyEffects, familyStats, validateProposal, agreement, MAX_STEP } from "../services/astro-tuning.service.js";
import { outcomeFrom } from "../routes/feedback.js";

const AT = new Date("2024-06-01T06:00:00Z");

test("Astro: only the ascendant is public; charts and dossier stay inside", () => {
  const a = analyzeAstro("career", "calm", { at: AT, text: "Should I change my job?" });
  assert.ok(a.ascendant.sign.length > 0);
  assert.ok(a.ascendant.degree >= 0 && a.ascendant.degree < 30);
  assert.ok(a.prashna.dossier.length > 3);
  const pub = JSON.parse(JSON.stringify(publicAstro(a)));
  assert.equal(pub.currentPlanets, undefined);
  assert.equal(pub.dasha, undefined);
  assert.equal(pub.prashna.dossier, undefined);
  assert.ok(pub.prashna.factors.every((f: { family: string }) => FACTOR_FAMILIES.includes(f.family as never)));
});

test("Astro: the same sky and question always give the same reading", () => {
  const a = analyzeAstro("relationship", "calm", { at: AT, text: "Will my partner agree?" });
  const b = analyzeAstro("relationship", "calm", { at: AT, text: "Will my partner agree?" });
  assert.equal(a.prashna.score, b.prashna.score);
  assert.equal(a.ascendant.degree, b.ascendant.degree);
});

test("Astro: divisional charts D3/D4/D7/D9/D10/D12 exist in the cast", () => {
  const sky = castPrashnaCharts(AT, 28.6139, 77.209);
  for (const k of ["d1", "d3", "d4", "d7", "d9", "d10", "d12"]) assert.ok((sky.charts as Record<string, unknown>)[k], k);
});

test("Astro: scores spread over favorable / neutral / challenging", () => {
  const seen = { favorable: 0, neutral: 0, challenging: 0 };
  for (let i = 0; i < 90; i++) {
    // Spread over about 8 years: the planets move slowly, so a short span is not a fair sample.
    const at = new Date(AT.getTime() + i * 32.9 * 86400_000 + (i % 7) * 3.1 * 3600_000);
    seen[analyzeAstro("career", "calm", { at, text: "Should I change my job?" }).influence.signal]++;
  }
  for (const v of Object.values(seen)) assert.ok(v >= 8, JSON.stringify(seen));
});

test("Astro: tuning changes only the family it names", () => {
  const sky = castPrashnaCharts(AT, 28.6139, 77.209);
  const base = readPrashna("career", sky, { text: "job" });
  const tuned = readPrashna("career", sky, { text: "job", tuning: { id: 1, multipliers: { moon: 0.7 } } });
  assert.equal(tuned.tuningId, 1);
  const sum = (r: typeof base, fam: string) => r.factors.filter((f) => f.family === fam).reduce((s, f) => s + f.effect, 0);
  assert.ok(Math.abs(sum(tuned, "moon")) <= Math.abs(sum(base, "moon")) + 0.5);
  assert.ok(Math.abs(sum(tuned, "lagna") - sum(base, "lagna")) <= 1);
});

test("Significations: themes found in the text, marriage picks the 7th house", () => {
  const f = detectFocus("will my marriage happen and will money come", "relationship");
  assert.ok(f.themes.length >= 1);
  assert.equal(houseProfile("relationship", "my marriage").primaryHouse, 7);
});

test("Sun times: Delhi in June has a long day and 1 June 2024 is a Saturday", () => {
  const t = sunTimesFor(julianDayFromDate(new Date("2024-06-01T08:00:00Z")), 28.6139, 77.209);
  const dayHours = (t.sunset - t.sunrise) * 24;
  assert.ok(dayHours > 13 && dayHours < 14.5, String(dayHours));
  assert.equal(t.weekday, 6);
});

test("Feedback: outcome comes only from a followed step with a reported result", () => {
  assert.equal(outcomeFrom("followed", "better"), "matched");
  assert.equal(outcomeFrom("followed", "same"), "partly");
  assert.equal(outcomeFrom("followed", "worse"), "different");
  assert.equal(outcomeFrom("other", "worse"), null);
  assert.equal(outcomeFrom("nothing", "better"), null);
  assert.equal(outcomeFrom(undefined, undefined, "matched"), "matched");
});

test("Tuning: stats ignore 'same' results and tiny pushes", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ result: (i % 2 ? "better" : "worse") as "better" | "worse", effects: { moon: i % 2 ? 6 : -6 }, signal: "neutral" as const }));
  rows.push({ result: "same" as never, effects: { moon: 9 }, signal: "neutral" });
  const moon = familyStats(rows).find((s) => s.family === "moon")!;
  assert.equal(moon.n, 12);
  assert.equal(agreement(moon), 1);
  assert.deepEqual(familyEffects([{ family: "moon", effect: 3 }, { family: "moon", effect: -1 }, { family: "bogus", effect: 9 }]), { moon: 2 });
});

test("Tuning: the AI's proposal is clamped, needs evidence, and can be a no-op", () => {
  const rows = Array.from({ length: 12 }, () => ({ result: "better" as const, effects: { moon: 6 }, signal: "favorable" as const }));
  const stats = familyStats(rows);
  const p = validateProposal({ multipliers: { moon: 5, house: 0.1 }, astroShare: 0.9, rationale: "x" }, NO_TUNING, stats, 0.4)!;
  assert.equal(p.multipliers.moon, 1 + MAX_STEP);
  assert.equal(p.multipliers.house, undefined);
  assert.equal(p.astroShare, 0.45);
  assert.equal(validateProposal({ multipliers: {}, astroShare: 0.4 }, NO_TUNING, stats, 0.4), null);
  assert.equal(validateProposal("junk", NO_TUNING, stats, 0.4), null);
});
