import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeAstro } from "../services/astro.service.js";
import { chanceFromScore } from "../services/outlook.service.js";

test("Chance: 5-95 and rises with the score", () => {
  assert.equal(chanceFromScore(0), 50);
  assert.ok(chanceFromScore(30) > chanceFromScore(10));
  assert.ok(chanceFromScore(-500) >= 5 && chanceFromScore(500) <= 95);
});

test("Outlook: every question gets a chance; a date is given only past the gate", () => {
  let withTiming = 0;
  let gated = 0;
  for (let i = 0; i < 40; i++) {
    const at = new Date(Date.UTC(2026, 0, 1) + i * 9.3 * 86400000);
    const a = analyzeAstro("career", "neutral" as never, { at, text: "when will I get the job?" });
    const o = a.outlook;
    assert.ok(o.chance >= 5 && o.chance <= 95);
    if (o.chance < 35) {
      assert.equal(o.timing, null);
      gated++;
    } else if (o.timing) {
      assert.ok(o.timing.from <= o.timing.to);
      assert.ok(o.timing.dashaCheck);
      withTiming++;
    }
  }
  assert.ok(withTiming > 0 && gated > 0, `timing ${withTiming}, gated ${gated}`);
});

test("Prashna trace: lagna, Moon, concerned house, 6/8/12 lords and the blend are all written as points", () => {
  const a = analyzeAstro("career", "neutral" as never, { at: new Date("2026-10-14T14:00:00Z"), text: "Will I get the job?", latitude: 19.076, longitude: 72.8777 });
  const titles = a.prashna.trace.map((t) => t.title).join(" | ");
  assert.match(titles, /Lagna/);
  assert.match(titles, /Moon/);
  assert.match(titles, /10th house/);
  assert.match(titles, /6th, 8th and 12th/);
  assert.match(titles, /house, sign and planet/);
  for (const t of a.prashna.trace) assert.ok(t.points.length >= 2 && t.points.every((p) => p.length > 5));
  assert.equal(a.prashna.trace.find((t) => /6th, 8th/.test(t.title))!.points.length, 3);
  assert.match(titles, /dasha/);
  assert.match(titles, /Mrityu Bhaga/);
  console.log(a.prashna.trace.map((t) => `## ${t.title}\n- ${t.points.join("\n- ")}`).join("\n"));
});
