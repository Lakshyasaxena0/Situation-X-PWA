import { test } from "node:test";
import assert from "node:assert/strict";
import { julianDayFromDate, lahiriAyanamsa, siderealLongitudes, tropicalAscendant } from "../services/ephemeris.service.js";
import { analyzeAstro } from "../services/astro.service.js";
import { isTimeBased } from "../services/timing.service.js";
import { runEngine } from "../services/engine.service.js";

test("Ascendant: Greenwich, 2000-01-01 12:00 UT is about 24.5 Aries (tropical)", () => {
  const jd = julianDayFromDate(new Date("2000-01-01T12:00:00Z"));
  const asc = tropicalAscendant(jd, 51.5, 0);
  assert.ok(Math.abs(asc - 24.5) < 1, `got ${asc}`);
});

test("Ascendant: it follows the location (one hour of longitude is 15 degrees of sidereal time)", () => {
  const jd = julianDayFromDate(new Date("2024-06-01T06:00:00Z"));
  const delhi = tropicalAscendant(jd, 28.6139, 77.209);
  const mumbai = tropicalAscendant(jd, 19.076, 72.8777);
  const london = tropicalAscendant(jd, 51.5, -0.12);
  assert.notEqual(Math.round(delhi), Math.round(mumbai));
  assert.notEqual(Math.round(delhi), Math.round(london));
});

test("Ayanamsa and sidereal Sun at J2000", () => {
  const jd = julianDayFromDate(new Date("2000-01-01T12:00:00Z"));
  assert.ok(Math.abs(lahiriAyanamsa(jd) - 23.857) < 0.01);
  // Tropical Sun 280.37 minus ayanamsa 23.857 = 256.5 (Sagittarius 16.5)
  assert.ok(Math.abs(siderealLongitudes(jd).Sun - 256.5) < 0.2);
});

test("analyzeAstro uses the location for the lagna and records it", () => {
  const at = new Date("2024-06-01T06:00:00Z");
  const a = analyzeAstro("career", "calm", { latitude: 19.076, longitude: 72.8777, at });
  const b = analyzeAstro("career", "calm", { latitude: 51.5, longitude: -0.12, at });
  assert.deepEqual(a.location, { latitude: 19.076, longitude: 72.8777 });
  assert.ok(a.ascendant.degree !== b.ascendant.degree || a.ascendant.sign !== b.ascendant.sign);
});

test("Dashas are worked out only for time-based questions", () => {
  const at = new Date("2024-06-01T06:00:00Z");
  const plain = analyzeAstro("career", "calm", { at, text: "Should I accept the offer from the other company?" });
  assert.equal(plain.timing, undefined);
  assert.doesNotMatch(plain.interpretation, /[Dd]asha/);
  const timed = analyzeAstro("career", "calm", { at, text: "When will I get a new job?" });
  assert.ok(timed.timing);
  assert.equal(timed.timing!.basis, "question");
  assert.match(timed.interpretation, /Dasha of the question chart/);
  const v = timed.timing!.vimshottari;
  assert.ok(new Date(v.mahadasha.startDate) <= at && at <= new Date(v.mahadasha.endDate));
  assert.ok(new Date(v.antardasha.startDate) <= at && at <= new Date(v.antardasha.endDate));
  assert.equal(timed.timing!.house, 10);
  assert.ok(timed.timing!.chara === null || timed.timing!.chara.sequence.length === 12);
  // The Prashna chart's own Moon decides the Vimshottari mahadasha
  assert.equal(v.mahadasha.planet, timed.dasha.mahadasha.planet);
});

test("Time-based question detection", () => {
  assert.ok(isTimeBased("When will I get a new job?"));
  assert.ok(isTimeBased("meri shaadi kab hogi"));
  assert.ok(isTimeBased("How long will this take?"));
  assert.ok(!isTimeBased("Should I accept the offer from the other company?"));
});

test("Engine: module reports say which modules were active and what they concluded", () => {
  const r = runEngine("Should I quit my job? I am worried and stressed about my career and salary", {});
  const by = Object.fromEntries(r.modules.map((m) => [m.key, m]));
  assert.equal(by.AJIT.active, true);
  assert.match(by.AJIT.verdict, /Intent:/);
  assert.ok(by.AJIT.evidence.length > 0);
  assert.equal(by.MANU.active, true);
  assert.ok(by.MANU.evidence.some((e) => e.includes("worried") || e.includes("stress")));
  assert.equal(by.SIVI.active, true);
  assert.equal(by.ASTRO.active, true);
  const off = runEngine("Should I quit my job? I am worried and stressed about my career and salary", { useAstrology: false });
  assert.equal(off.modules.find((m) => m.key === "ASTRO")!.active, false);
});

test("Engine: an unclear text reports AJIT and MANU as inactive", () => {
  const r = runEngine("abcdefgh ijklmnop qrstuvwx", {});
  assert.equal(r.modules.find((m) => m.key === "AJIT")!.active, false);
  assert.equal(r.modules.find((m) => m.key === "MANU")!.active, false);
});
