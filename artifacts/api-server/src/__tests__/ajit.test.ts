import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntent } from "../services/ajit.service.js";
import { matchVocabulary } from "../shared/utils/vocabularyMatcher.js";
import { INTENT_VOCABULARY } from "../shared/constants/vocabulary.js";

const intent = (t: string) => detectIntent(t).result;

test("AJIT: plain topics", () => {
  assert.equal(intent("I want a promotion and a higher salary at my company").intent, "career");
  assert.equal(intent("My girlfriend and I had a breakup and I miss her").intent, "relationship");
  assert.equal(intent("I have a constant headache and pain, should I see a doctor").intent, "health");
  assert.equal(intent("We had a big argument and a quarrel with my neighbour").intent, "conflict");
});

test("AJIT: 'I don't want to fight' is a conflict question from the avoiding side", () => {
  const r = intent("I don't want to fight with my brother but he keeps provoking me");
  assert.equal(r.intent, "conflict");
  assert.equal(r.stance, "avoid");
});

test("AJIT: negated symptoms and problems are dropped", () => {
  assert.equal(intent("I have no pain and no illness, everything is fine with me").intent === "health", false);
  const r = detectIntent("There is no problem at all and I do not have any issue, just thinking about my job offer");
  const conflict = r.ranking.find((k) => k.key === "conflict");
  assert.equal(conflict?.score ?? 0, 0);
  assert.equal(r.result.intent, "career");
});

test("AJIT: Hinglish negation after the word ('dard nahi hai')", () => {
  const r = detectIntent("mujhe koi dard nahi hai lekin naukri ko lekar bahut tension hai");
  assert.equal(r.result.intent, "career");
  const health = r.ranking.find((k) => k.key === "health");
  assert.equal(health?.score ?? 0, 0);
});

test("AJIT: Hindi in Devanagari works", () => {
  assert.equal(intent("मेरी नौकरी और सैलरी को लेकर बहुत चिंता है").intent, "career");
  assert.equal(intent("मेरा अपनी पत्नी से झगड़ा हो गया, रिश्ता खराब हो रहा है").intent, "relationship");
});

test("AJIT: a real topic wins over the form of the question, and decision is kept as secondary", () => {
  const r = intent("Should I quit my job and start a business?");
  assert.equal(r.intent, "career");
  assert.equal(r.secondary, "decision");
});

test("AJIT: a pure choice stays a decision", () => {
  assert.equal(intent("Which one should I choose, option A or option B? I cannot decide, kya karu").intent, "decision");
});

test("AJIT: repeating a word does not make it stronger", () => {
  const once = detectIntent("job problem").ranking.find((k) => k.key === "career")!.score;
  const many = detectIntent("job job job job job job job job").ranking.find((k) => k.key === "career")!.score;
  assert.equal(once, many);
});

test("AJIT: intensity and word endings", () => {
  const plain = matchVocabulary("I feel pain", INTENT_VOCABULARY).ranking.find((k) => k.key === "health")!.score;
  const strong = matchVocabulary("I feel very much pain", INTENT_VOCABULARY).ranking.find((k) => k.key === "health")!.score;
  assert.ok(strong > plain);
  assert.equal(intent("we keep fighting and arguing all the time at home").intent, "conflict");
});

test("AJIT: no words, no intent; short text is unclear", () => {
  assert.equal(intent("abcdefgh ijklmnop qrstuvwx").intent, "unclear");
  assert.equal(intent("hi").intent, "unclear");
});

test("AJIT: the explanation lists the words that counted", () => {
  const { ranking } = detectIntent("My salary is low and I want a promotion");
  const career = ranking.find((k) => k.key === "career")!;
  assert.deepEqual(career.hits.map((h) => h.matched).sort(), ["promotion", "salary"]);
});
