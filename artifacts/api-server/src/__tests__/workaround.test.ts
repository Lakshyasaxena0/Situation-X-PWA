import { test } from "node:test";
import assert from "node:assert/strict";
import { detectObstacle, mergeRoute, ruleRoute } from "../services/workaround.service.js";
import { runEngine } from "../services/engine.service.js";
import { buildPrompt, parseAiAnswer, synthesize } from "../services/synthesis.service.js";
import { NO_CALIBRATION } from "../services/calibration.service.js";
import { DEFAULT_OPTIONS } from "../services/analysis-options.js";
import { detectIntent } from "../services/ajit.service.js";
import { detectEmotion } from "../services/manu.service.js";

test("AJIT: finds words that say the direct way is closed (English, Hinglish)", () => {
  assert.ok(detectObstacle("My parents will not allow this marriage and I can't convince them")?.length);
  assert.ok(detectObstacle("Mere ghar wale ijazat nahi dete, ye nahi ho sakta")?.length);
  assert.ok(detectObstacle("My application was rejected and there is no vacancy")?.length);
  assert.equal(detectObstacle("I got a good offer and want to know if I should accept it"), null);
});

test("indirect route: offered by the engine only when the way looks closed and the filter allows", () => {
  const closed = runEngine("My manager rejected my transfer request and there is no way to move to the other team. What should I do?");
  assert.ok(closed.route);
  assert.equal(closed.route!.source, "rules");
  assert.ok(closed.route!.steps.length >= 3);
  assert.match(closed.modules.find((m) => m.key === "AJIT")!.evidence.join(" "), /Indirect route/);
  const open = runEngine("Should I accept the new job offer from the startup or stay in my company?");
  assert.equal(open.route, null);
});

test("indirect route: AI route is merged only when usable, otherwise the rules route stays", () => {
  const base = ruleRoute("career", ["rejected"]);
  assert.equal(mergeRoute(base, null), base);
  assert.equal(mergeRoute(base, { idea: "x", steps: ["only one"] }), base);
  const merged = mergeRoute(base, { blocker: "Transfers need HR approval", idea: "Ask the other team lead to request you formally.", steps: ["Talk to the other lead", "Ask HR for the process"], fairness: "Everything is done openly." });
  assert.equal(merged.source, "ai");
  assert.equal(merged.steps.length, 2);
});

test("indirect route: the prompt asks for it, and synthesis carries it", async () => {
  const text = "My manager rejected my transfer request and there is no way to move to the other team. What should I do?";
  const engine = runEngine(text);
  assert.match(buildPrompt(text, engine, NO_CALIBRATION, "standard", DEFAULT_OPTIONS), /INDIRECT ROUTE TASK/);
  const reply = JSON.stringify({
    situationAnalysis: "A transfer was refused.", logicScore: 55, finalScore: 55, summary: "Try the formal and the informal side doors.", advice: "Ask for the reasons first.",
    indirectRoute: { blocker: "The manager will not release you", idea: "Ask HR about the internal posting process and talk to the other team lead.", steps: ["Ask the manager what would change the answer", "Ask HR about the posting process", "Talk to the other team lead openly"], fairness: "Done openly with everyone's knowledge." },
  });
  const out = await synthesize(text, engine, NO_CALIBRATION, async () => reply, "standard", DEFAULT_OPTIONS);
  assert.equal(out.indirectRoute?.source, "ai");
  assert.ok(parseAiAnswer(reply));
});

test("vocabulary: wider word lists catch more of the words", () => {
  const i = detectIntent("My gf and I had a fight, her mom and bhai are against the wedding, and I also have a loan emi");
  const keys = i.ranking.map((r) => r.key);
  assert.ok(keys.includes("relationship") && keys.includes("career"));
  const e = detectEmotion("I am restless and terrified, my heart is racing and I feel helpless and guilty");
  assert.ok(e.ranking.length >= 2);
});
