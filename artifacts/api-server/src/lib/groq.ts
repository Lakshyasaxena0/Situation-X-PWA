/**
 * Minimal Groq client (OpenAI-compatible chat completions API).
 *
 * Uses plain `fetch`, so it needs no extra package. Configuration (environment variables):
 *   GROQ_API_KEY      required; without it the app answers from the engine + astrology only
 *   GROQ_MODEL        optional; default "llama-3.3-70b-versatile"
 *   GROQ_BASE_URL     optional; default "https://api.groq.com/openai/v1"
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

/**
 * Sends one prompt and returns the model's reply text (expected to be a JSON object).
 * Throws on network errors, timeouts and non-2xx answers; the caller decides the fallback.
 * The error message never contains the API key (it may carry the start of Groq's own error text).
 *
 * If the configured model is unknown to this Groq account (HTTP 404 / model_not_found), the models the
 * account can actually use are looked up once and the best match is used from then on.
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
  if (!res.ok) {
    // Groq explains what is wrong (unknown model, bad key...) in the body: keep it for the logs.
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`Groq request failed with HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = (await res.json()) as ChatResponse;
  return data.choices?.[0]?.message?.content ?? null;
}
