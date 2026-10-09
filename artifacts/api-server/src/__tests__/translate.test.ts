import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTexts, translateTexts } from "../services/translate.service.js";
import { runEngine } from "../services/engine.service.js";

const e = runEngine("Should I quit my job? I am worried about money. When will it work out?", {});
const fa = { summary: "Sum", finalVerdict: e.finalVerdict, simulation: e.simulation, astro: e.astro, modules: e.modules, synthesis: { summary: "S", astroInsight: "A", advice: "Adv", risks: ["r1"], keyUnknowns: [], nextSteps: ["n1", "n2"] } } as unknown as Record<string, unknown>;

test("Translate: only sentences are sent, in order, and come back in the same structure", async () => {
  const texts = extractTexts(fa);
  let sent: string[] = [];
  const out = await translateTexts(texts, "hi", async (prompt) => {
    const json = JSON.parse(prompt.slice(prompt.lastIndexOf('{"items"')));
    sent = json.items;
    return JSON.stringify({ items: sent.map((x: string) => `HI:${x}`) });
  });
  assert.ok(out);
  assert.equal(out!.summary, "HI:Sum");
  assert.deepEqual(out!.synthesis!.nextSteps, ["HI:n1", "HI:n2"]);
  assert.equal(out!.modules![0].key, texts.modules![0].key); // identifiers are not translated
  assert.ok(sent.length > 10);
  assert.ok(!sent.includes(texts.modules![0].key));
});

test("Translate: a wrong answer from the model is rejected", async () => {
  const texts = extractTexts(fa);
  assert.equal(await translateTexts(texts, "en", async () => JSON.stringify({ items: ["one"] })), null);
  assert.equal(await translateTexts(texts, "en", async () => "nope"), null);
  assert.equal(await translateTexts(texts, "en", async () => null), null);
});
