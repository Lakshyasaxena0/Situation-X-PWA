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
