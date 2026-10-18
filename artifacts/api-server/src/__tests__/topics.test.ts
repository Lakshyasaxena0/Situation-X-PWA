import { test } from "node:test";
import assert from "node:assert/strict";
import { runEngine } from "../services/engine.service.js";

const CASES: [string, string][] = [
  ["Will I get the visa approved this year?", "travel"],
  ["Should I buy a house or keep renting?", "property"],
  ["Will my exam result be good?", "education"],
  ["Should I invest in stocks now?", "money"],
  ["Meri shaadi kab hogi?", "relationship"],
  ["My mother is ill, will she recover soon?", "health"],
  ["Mere ghar mein roz jhagda hota hai, sasural wale pareshan karte hain", "family"],
  ["My court case has been going on for 5 years, when will the verdict come?", "legal"],
  ["I have no peace of mind and feel hopeless", "mind"],
  ["Mujhe depression ho raha hai, kuch acha nahi lagta", "mind"],
  ["Mera phone kho gaya hai, kya wapas milega?", "lost"],
  ["My shop is not doing well, should I expand or close it?", "business"],
  ["Will I get a promotion this year?", "career"],
];

test("Topics: everyday life questions land in the right topic and get their own chart houses and options", () => {
  for (const [q, intent] of CASES) {
    const e = runEngine(q, {});
    assert.equal(e.intent.intent, intent, q);
    assert.ok(e.simulation.bestPath.action.length > 10, q);
    assert.ok(e.astro.prashna?.topic, q);
  }
});

test("Topics: a will/when question gets outlook-style options, not break-up or quit options", () => {
  const e = runEngine("Will I get the visa approved this year?", {});
  const all = [e.simulation.bestPath, ...e.simulation.alternatives].map((p) => p.action).join(" ");
  assert.doesNotMatch(all, /End the relationship|Switch or quit/);
});
