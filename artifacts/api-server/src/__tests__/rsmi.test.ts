import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSilence, mergeSilence } from "../services/rsmi.service.js";
import { MAX_ROUNDS, buildClarifyPrompt, nextQuestion, parseClarify, ruleQuestion, withClarifications } from "../services/clarify.service.js";
import { runEngine } from "../services/engine.service.js";
import { computeCost } from "../services/credit-cost.service.js";
import { buildPrompt, parseAiAnswer, synthesize } from "../services/synthesis.service.js";
import { NO_CALIBRATION } from "../services/calibration.service.js";
import { DEFAULT_OPTIONS } from "../services/analysis-options.js";

test("RSMI: a quiet pause after a confession is read as a short, in-person silence", () => {
  const s = detectSilence("Maine apni girlfriend ko bola ki I love you, fir vo kuch der chup rahi. Iska matlab kya hoga?")!;
  assert.equal(s.channel, "in_person");
  assert.equal(s.who, "partner");
  assert.equal(s.trigger, "a confession of feelings");
  assert.equal(s.duration.bucket, "moments");
  assert.equal(s.meanings[0].likelihood, "more likely");
  assert.match(s.meanings[0].meaning, /taking it in|process/i);
  assert.ok(s.meanings.length >= 3 && s.checks.length >= 2);
  assert.match(s.caution, /no single meaning/);
});

test("RSMI: no reply for two weeks from HR is an organisation silence; delay is the leading reason, but a soft no is listed", () => {
  const s = detectSilence("HR ne interview ke baad 2 weeks se koi reply nahi diya. Kya mujhe reject kar diya gaya?")!;
  assert.equal(s.channel, "organisation");
  assert.equal(s.duration.bucket, "weeks");
  assert.ok(s.meanings.some((m) => /no/i.test(m.meaning)));
});

test("RSMI: the same words rank differently with a seen message, a pattern and a long gap", () => {
  const brief = detectSilence("My friend hasn't replied to my message since this morning, he is busy with exams this week.")!;
  assert.match(brief.meanings[0].meaning, /busy/i);
  const cold = detectSilence("She has been leaving me on read for 3 weeks again, she always does this, seen but no reply.")!;
  assert.doesNotMatch(cold.meanings[0].meaning, /busy/i);
  assert.ok(cold.meanings.some((m) => /priority|interest|boundary/i.test(m.meaning)));
});

test("RSMI: criticism followed by visible anger points to hurt, not to processing", () => {
  const s = detectSilence("I told my husband he was wrong in front of everyone and he glared at me and went quiet, gussa lag raha tha.")!;
  assert.match(s.meanings[0].meaning, /hurt|angry/i);
});

test("RSMI: the person's own silence is read as how it may have been taken", () => {
  const s = detectSilence("Maine kuch nahi bola jab usne mujhe sabke saamne daanta, ab vo samajh raha hoga ki main theek hoon.")!;
  assert.equal(s.subject, "self");
  assert.match(s.meanings[0].meaning, /Your silence|read as|seen as/i);
});

test("RSMI: no silence, or a negated one, is not detected", () => {
  assert.equal(detectSilence("Should I accept the job offer from the other company?"), null);
  assert.equal(detectSilence("Vo chup nahi hua balki bahut bola, mujhe samajh nahi aa raha kya karun"), null);
});

test("RSMI: the AI's reading replaces the rules' only when it is complete", () => {
  const base = detectSilence("Maine bola ki I love you, fir vo kuch der chup rahi.")!;
  assert.equal(mergeSilence(base, { meanings: [{ meaning: "x" }] }).source, "rules");
  const ok = mergeSilence(base, {
    meanings: [
      { meaning: "She is surprised", likelihood: "more likely", why: "Unexpected" },
      { meaning: "She is thinking", likelihood: "possible", why: "Weighty" },
    ],
    checks: ["Ask her gently"],
  });
  assert.equal(ok.source, "ai");
  assert.deepEqual(ok.checks, ["Ask her gently"]);
  assert.equal(ok.unknowns.length, base.unknowns.length);
});

test("RSMI: engine reports the module, charges one credit for it, and puts it in the AI prompt", () => {
  const text = "Maine usse sach bataya fir vo kuch der chup rha. Iska kya matlab hai?";
  const e = runEngine(text, {});
  assert.ok(e.silence);
  assert.ok(e.modules.some((m) => m.key === "RSMI" && m.area === "silence"));
  const cost = computeCost(text, e, "standard", DEFAULT_OPTIONS);
  assert.ok(cost.lines.some((l) => l.key === "rsmi" && l.credits === 1));
  assert.match(buildPrompt(text, e, NO_CALIBRATION, "standard", DEFAULT_OPTIONS), /RSMI TASK/);
  const plain = runEngine("Should I accept the offer from the other company?", {});
  assert.equal(plain.silence, null);
  assert.ok(!computeCost("Should I accept the offer?", plain, "standard", DEFAULT_OPTIONS).lines.some((l) => l.key === "rsmi"));
  assert.doesNotMatch(buildPrompt("Should I accept the offer?", plain, NO_CALIBRATION, "standard", DEFAULT_OPTIONS), /RSMI/);
});

test("RSMI: a synthesis keeps the AI's silence reading and checks it for safety", async () => {
  const text = "Maine usse sach bataya fir vo kuch der chup rha. Iska kya matlab hai?";
  const e = runEngine(text, {});
  const answer = JSON.stringify({
    situationAnalysis: "x", logicScore: 55, finalScore: 55, summary: "Give it time and ask gently.", advice: "Ask.",
    silence: { meanings: [{ meaning: "He is shocked", likelihood: "more likely", why: "Hard truth" }, { meaning: "He is thinking", likelihood: "possible", why: "Weighty" }], checks: ["Ask calmly"] },
  });
  assert.ok(parseAiAnswer(answer)!.silence);
  const out = await synthesize(text, e, NO_CALIBRATION, async () => answer, "standard", DEFAULT_OPTIONS);
  assert.equal(out.silence?.source, "ai");
  assert.equal(out.silence?.meanings[0].meaning, "He is shocked");
});

test("Clarify: answers are added to the situation text", () => {
  const t = withClarifications("Original question here", [{ question: "How long?", answer: "Two days" }, { question: "Skipped?", answer: "  " }]);
  assert.match(t, /How long\? Two days/);
  assert.doesNotMatch(t, /Skipped/);
  assert.equal(withClarifications("Original question here", []), "Original question here");
});

test("Clarify: rules ask the missing silence facts first, never repeat, and stop at the limit", () => {
  const text = "Maine usse bola ki I love you, fir vo chup ho gayi";
  const first = ruleQuestion(text, []);
  assert.equal(first.done, false);
  assert.ok(first.question!.choices.length > 0);
  const asked: { question: string; answer: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const r = ruleQuestion(text, asked);
    if (r.done) break;
    assert.ok(!seen.has(r.question!.question), "repeated");
    seen.add(r.question!.question);
    asked.push({ question: r.question!.question, answer: "x" });
  }
  assert.ok(asked.length <= MAX_ROUNDS);
  assert.equal(ruleQuestion(text, asked).done, true);
});

test("Clarify: an AI question is accepted, a repeat or an unsafe one is not", () => {
  const ok = parseClarify(JSON.stringify({ done: false, question: "How long did she stay silent?", why: "Length matters", choices: ["Seconds", "Minutes"] }), []);
  assert.equal(ok?.question?.choices.length, 2);
  assert.equal(parseClarify(JSON.stringify({ done: true }), [])?.done, true);
  assert.equal(parseClarify(JSON.stringify({ done: false, question: "How long did she stay silent?" }), [{ question: "how long did she stay silent?", answer: "a bit" }]), null);
  assert.equal(parseClarify("not json", []), null);
  assert.match(buildClarifyPrompt("a <b> situation", [{ question: "Q", answer: "A" }], "hinglish"), /Hinglish/);
});

test("Clarify: the AI is used when given, and the rules take over if it fails", async () => {
  const text = "Maine usse bola ki I love you, fir vo chup ho gayi";
  const viaAi = await nextQuestion(text, [], "en", true, async () => JSON.stringify({ done: false, question: "What did she say after?", why: "Her reply matters", choices: [] }));
  assert.equal(viaAi.source, "ai");
  const viaRules = await nextQuestion(text, [], "en", true, async () => { throw new Error("down"); });
  assert.equal(viaRules.source, "rules");
  assert.equal(viaRules.done, false);
  const off = await nextQuestion(text, [], "en", false);
  assert.equal(off.source, "rules");
});
