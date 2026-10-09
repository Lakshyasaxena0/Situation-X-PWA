import { test } from "node:test";
import assert from "node:assert/strict";
import { groqJsonCompletion, retryAfterSeconds } from "../services/../lib/groq.js";

test("Groq: the wait is read from the error text or header", () => {
  assert.equal(retryAfterSeconds("Please try again in 22.215s. Need more"), 22.215);
  assert.equal(retryAfterSeconds("try again in 1m3.5s"), 63.5);
  assert.equal(retryAfterSeconds("nothing", "7"), 7);
  assert.equal(retryAfterSeconds("nothing"), null);
});

test("Groq: a rate-limited model falls back to another one", async () => {
  process.env.GROQ_API_KEY = "test";
  process.env.GROQ_MODEL = "main-model";
  const real = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    const model = JSON.parse(init!.body!).model as string;
    seen.push(model);
    if (model === "main-model") return new Response('{"error":{"message":"Rate limit. Please try again in 22.2s."}}', { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await groqJsonCompletion("hi"), '{"ok":true}');
    assert.deepEqual(seen, ["main-model", "llama-3.3-70b-versatile"]);
  } finally {
    globalThis.fetch = real;
  }
});
