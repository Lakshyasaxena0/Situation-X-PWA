/**
 * Minimal Groq client (OpenAI-compatible chat completions API).
 *
 * Uses plain `fetch`, so it needs no extra package. Configuration (environment variables):
 *   GROQ_API_KEY      required; without it the app answers from the engine + astrology only
 *   GROQ_MODEL        optional; default "llama-3.3-70b-versatile"
 *   GROQ_BASE_URL     optional; default "https://api.groq.com/openai/v1"
 *   GROQ_FALLBACK_MODELS optional; comma list tried when the model is rate limited (default llama-3.3-70b-versatile, openai/gpt-oss-20b)
 *   GROQ_TIMEOUT_MS   optional; default 20000 (a slow call falls back instead of hanging the request)
 */

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TIMEOUT_MS = 20_000;

export function groqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

type ChatResponse = { choices?: { message?: { content?: string | null } }[] };

/** Tried in this order when the configured model is not available to the account. */
const PREFERRED_MODELS = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3-32b",
  "llama-3.1-8b-instant",
];
let discoveredModel: string | null = null;

async function discoverModel(): Promise<string | null> {
  const baseUrl = (process.env.GROQ_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
  const ids = new Set((data?.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)));
  return PREFERRED_MODELS.find((m) => ids.has(m)) ?? null;
}

function post(body: Record<string, unknown>): Promise<Response> {
  const baseUrl = (process.env.GROQ_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = Number(process.env.GROQ_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Seconds Groq says to wait ("Please try again in 22.215s" / "in 1m3.5s"), or the Retry-After header. */
export function retryAfterSeconds(detail: string, header?: string | null): number | null {
  const h = Number(header);
  if (header && Number.isFinite(h) && h >= 0) return h;
  const m = /try again in\s+(?:(\d+)m)?\s*(\d+(?:\.\d+)?)s/i.exec(detail);
  if (!m) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}

/** Other models tried when the main one is out of tokens for the minute (each model has its own limit). */
function fallbackModels(): string[] {
  const env = process.env.GROQ_FALLBACK_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return env?.length ? env : ["llama-3.3-70b-versatile", "openai/gpt-oss-20b"];
}

/** The longest we will wait for a rate limit to clear before giving up (the person is waiting). */
const MAX_RATE_WAIT_S = 25;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends one prompt and returns the model's reply text (expected to be a JSON object).
 * Throws on network errors, timeouts and non-2xx answers; the caller decides the fallback.
 * The error message never contains the API key (it may carry the start of Groq's own error text).
 *
 * If the configured model is unknown to this Groq account (HTTP 404 / model_not_found), the models the
 * account can actually use are looked up once and the best match is used from then on.
 *
 * If the model is out of tokens for the minute (HTTP 429, common on the free plan), the other models
 * are tried (each has its own limit); if all are limited and the wait is short, it waits once and
 * retries the main model, so a busy minute does not turn into an engine-only answer.
 */
export async function groqJsonCompletion(
  prompt: string,
  options: { maxTokens?: number; temperature?: number; model?: string } = {},
): Promise<string | null> {
  const request = {
    model: options.model || discoveredModel || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    temperature: options.temperature ?? 0.3,
    max_completion_tokens: options.maxTokens ?? 500,
    messages: [{ role: "user", content: prompt }],
  };

  const send = async (): Promise<Response> => {
    let r = await post({ ...request, response_format: { type: "json_object" } });
    // A model that does not accept JSON mode answers 400. The prompt already demands "ONLY a JSON
    // object", so retry once without the option instead of losing the AI answer.
    if (r.status === 400) r = await post(request);
    return r;
  };

  let res = await send();
  if (res.status === 404 && !options.model) {
    const found = await discoverModel();
    if (found && found !== request.model) {
      discoveredModel = found;
      request.model = found;
      res = await send();
    }
  }

  if (res.status === 429) {
    const main = request.model;
    let wait = retryAfterSeconds(await res.clone().text().catch(() => ""), res.headers.get("retry-after"));
    for (const alt of fallbackModels().filter((m) => m !== main)) {
      request.model = alt;
      const r = await send();
      if (r.ok) {
        res = r;
        break;
      }
      if (r.status === 429) {
        const w = retryAfterSeconds(await r.clone().text().catch(() => ""), r.headers.get("retry-after"));
        if (w !== null && (wait === null || w < wait)) wait = w;
      }
      res = r;
    }
    if (!res.ok && res.status === 429 && wait !== null && wait <= MAX_RATE_WAIT_S) {
      await sleep(Math.ceil(wait * 1000) + 500);
      request.model = main;
      res = await send();
    }
  }

  if (!res.ok) {
    // Groq explains what is wrong (unknown model, bad key...) in the body: keep it for the logs.
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`Groq request failed with HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = (await res.json()) as ChatResponse;
  return data.choices?.[0]?.message?.content ?? null;
}
