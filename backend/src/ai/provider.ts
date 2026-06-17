import { env } from '../config/env.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The ONLY place that talks to the LLM. Everything else (orchestrator, sub-agent,
// tools) is provider-agnostic. We target Groq's OpenAI-compatible chat API via
// fetch — no SDK dependency needed.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GenResult {
  text: string;
  toolCalls: LlmToolCall[];
  modelContent: unknown; // the assistant message, appended verbatim to history
}

type Msg = { role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string };

function safeParseArgs(s: unknown): Record<string, unknown> {
  if (typeof s !== 'string' || !s.trim()) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export async function generate(opts: {
  system: string;
  contents: unknown[];
  tools?: LlmTool[];
  temperature?: number;
}): Promise<GenResult> {
  const messages: Msg[] = [{ role: 'system', content: opts.system }, ...(opts.contents as Msg[])];
  const body: Record<string, unknown> = {
    model: env.GROQ_MODEL,
    messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }

  // Free-tier is token-per-minute limited. On 429 we respect Groq's suggested
  // wait ("try again in Xs") so the per-minute window clears, then retry.
  const MAX_ATTEMPTS = 5;
  let data: { choices?: { message?: Msg }[] } | undefined;
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      data = (await res.json()) as { choices?: { message?: Msg }[] };
      break;
    }
    const errText = await res.text();
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const m = errText.match(/try again in ([0-9.]+)s/i);
      const waitMs = m ? Math.min(Math.ceil(parseFloat(m[1]) * 1000) + 500, 30_000) : (attempt + 1) * 3000;
      await sleep(waitMs);
      continue;
    }
    // Some models occasionally emit a malformed (text) tool call → Groq 400
    // tool_use_failed. Retry; the next generation is usually well-formed.
    if (res.status === 400 && errText.includes('tool_use_failed') && attempt < MAX_ATTEMPTS) {
      await sleep(400);
      continue;
    }
    const err = new Error(`Groq ${res.status}: ${errText}`) as Error & { statusCode?: number };
    err.statusCode = res.status;
    throw err;
  }
  if (!data) throw new Error('Groq: no response');

  const msg = data.choices?.[0]?.message ?? { role: 'assistant', content: '' };
  const toolCalls: LlmToolCall[] = ((msg.tool_calls ?? []) as Array<{ id: string; function?: { name?: string; arguments?: string } }>).map(
    (tc) => ({ id: tc.id, name: tc.function?.name ?? '', args: safeParseArgs(tc.function?.arguments) }),
  );
  const text = typeof msg.content === 'string' ? msg.content : '';
  return { text, toolCalls, modelContent: msg };
}

// One OpenAI-style tool message per tool call, echoing the originating call id.
export function toolResultsContent(results: { id: string; name: string; response: unknown }[]) {
  return results.map((r) => ({
    role: 'tool',
    tool_call_id: r.id,
    content: typeof r.response === 'string' ? r.response : JSON.stringify(r.response),
  }));
}

export function userContent(text: string) {
  return { role: 'user', content: text };
}
