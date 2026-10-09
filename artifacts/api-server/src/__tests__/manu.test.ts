import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEmotion } from "../services/manu.service.js";

const emo = (t: string) => detectEmotion(t).result;

test("MANU: plain emotions in English and Hinglish", () => {
  assert.equal(emo("I am so angry and furious at him").emotion, "angry");
  assert.equal(emo("mujhe bahut gusse mein hoon aaj").emotion, "angry");
  assert.equal(emo("mujhe bura lag raha hai, bahut dukh hua").emotion, "sad");
  assert.equal(emo("mujhe samajh nahi aa raha kya karu").emotion, "confused");
  assert.equal(emo("I am very worried and nervous about tomorrow").emotion, "anxious");
});

test("MANU: negated feelings do not count", () => {
  const r = detectEmotion("I am not angry and not worried at all");
  assert.notEqual(r.result.emotion, "angry");
  assert.notEqual(r.result.emotion, "anxious");
});

test("MANU: a past feeling counts less than a present one", () => {
  const past = detectEmotion("yesterday I was angry").ranking.find((k) => k.key === "angry")!.score;
  const now = detectEmotion("I am angry right now").ranking.find((k) => k.key === "angry")!.score;
  assert.ok(now > past);
});

test("MANU: 'main theek hoon' with distress elsewhere is not calm", () => {
  const r = detectEmotion("main theek hoon, bas thoda sa rona aa raha hai aur kuch accha nahi lagta, bahut udaas hoon");
  assert.notEqual(r.result.emotion, "calm");
});

test("MANU: 'main theek hoon' alone can be calm", () => {
  assert.equal(emo("main theek hoon, sab shant hai").emotion, "calm");
});

test("MANU: intensity uses the overall pattern, not one word", () => {
  const low = emo("I am a little worried");
  const high = emo("I am ALWAYS worried!! I cannot sleep, I am panicking, nothing works and I am scared");
  assert.equal(low.intensity, "low");
  assert.equal(high.intensity, "high");
});

test("MANU: crisis wording forces high and sets the flag", () => {
  const r = emo("I feel so hopeless, I want to end my life");
  assert.equal(r.intensity, "high");
  assert.equal(r.crisis, true);
});

test("MANU: no signals gives confused / low / 0", () => {
  const r = emo("The meeting is on Monday at ten");
  assert.deepEqual([r.emotion, r.intensity, r.score], ["confused", "low", 0]);
});
