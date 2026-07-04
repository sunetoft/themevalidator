import OpenAI from "openai";

/**
 * Z.AI (Zhipu AI) — OpenAI-compatible LLM client.
 * Model: glm-5.1
 * Endpoint: https://api.z.ai/api/paas/v4
 *
 * Replaces the original Abacus.AI integration.
 * All API routes use this shared client for consistency.
 */

const client = new OpenAI({
  apiKey: process.env.ZAI_API_KEY || process.env.GLM_API_KEY || "",
  baseURL: process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4",
});

export const LLM_MODEL = process.env.LLM_MODEL || "glm-5.1";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

/**
 * Standard chat completion (non-streaming).
 * Uses JSON mode when responseFormat is "json_object".
 */
export async function chatComplete(
  messages: LLMMessage[],
  options: {
    maxTokens?: number;
    jsonMode?: boolean;
    temperature?: number;
  } = {}
) {
  const response = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
  });
  return response.choices[0]?.message?.content || "";
}

/**
 * Streaming chat completion.
 * Returns an async generator yielding content deltas.
 *
 * GLM reasoning models send `reasoning_content` deltas BEFORE actual `content`.
 * If we only yield `content`, the SSE stream goes silent for 30-60s during
 * reasoning, causing client/proxy timeouts (ERR_INVALID_STATE: Controller
 * already closed). The `onReasoning` callback lets callers send heartbeats.
 */
export async function* chatStream(
  messages: LLMMessage[],
  options: {
    maxTokens?: number;
    jsonMode?: boolean;
    temperature?: number;
    onReasoning?: (reasoningDelta: string) => void;
  } = {}
): AsyncGenerator<string, void, unknown> {
  const stream = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: true,
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta as any;
    // GLM reasoning models: forward reasoning_content via callback (not yielded,
    // since it would contaminate the accumulated content string).
    if (delta?.reasoning_content && options.onReasoning) {
      options.onReasoning(delta.reasoning_content);
    }
    if (delta?.content) {
      yield delta.content;
    }
  }
}

export default client;
