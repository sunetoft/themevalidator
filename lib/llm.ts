import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

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

/** GLM pricing per million tokens (Z.AI GLM-5.1) */
const GLM_INPUT_COST_PER_M = 0.148;   // $0.148/M input tokens
const GLM_OUTPUT_COST_PER_M = 0.296;  // $0.296/M output tokens

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[];
}

/**
 * Standard chat completion (non-streaming).
 * Uses JSON mode when responseFormat is "json_object".
 *
 * Logs token usage to the database for dashboard aggregation.
 */
export async function chatComplete(
  messages: LLMMessage[],
  options: {
    maxTokens?: number;
    jsonMode?: boolean;
    temperature?: number;
    /** Enable GLM reasoning/thinking mode (default: disabled). */
    thinking?: boolean;
    /** Source of the request (e.g., 'web', 'cron', 'api') — defaults to 'web' */
    source?: string;
    /** Optional endpoint label for grouping (e.g., 'analyze', 'reanalyze', 'add-ticker') */
    endpoint?: string;
  } = {}
) {
  const params: Record<string, unknown> = {
    model: LLM_MODEL,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
    // GLM reasoning models (glm-5.x) emit `reasoning_content` BEFORE `content`
    // and that reasoning consumes the SAME max_tokens budget. On large prompts
    // the reasoning exhausts the whole budget, so `content` comes back empty
    // ("fullContent length: 0"). Disable thinking so the budget goes to actual
    // output. (Matches the proven pattern in AudienceExperts lib/llm.ts.)
    thinking: { type: options.thinking ? "enabled" : "disabled" },
  };
  const response = await client.chat.completions.create(params as any);

  // Log token usage to DB (fire-and-forget — don't block the response)
  const usage = response.usage;
  if (usage) {
    const inputCost = (usage.prompt_tokens / 1_000_000) * GLM_INPUT_COST_PER_M;
    const outputCost = (usage.completion_tokens / 1_000_000) * GLM_OUTPUT_COST_PER_M;
    prisma.tokenUsage.create({
      data: {
        app: "themevalidator",
        model: LLM_MODEL,
        source: options.source ?? "web",
        tokensIn: usage.prompt_tokens,
        tokensOut: usage.completion_tokens,
        tokensTotal: usage.total_tokens,
        costUsd: Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000,
        endpoint: options.endpoint ?? null,
      },
    }).catch(err => {
      console.error("[tokenUsage] Failed to log token usage:", err?.message);
    });
  }

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
 *
 * NOTE: Streaming responses from OpenAI-compatible APIs typically do NOT
 * include `usage` in the stream chunks. Token usage is only available on the
 * final chunk for some providers, but GLM does not provide it in stream mode.
 * Therefore, we skip usage logging for streaming calls. If usage becomes
 * available on the final chunk, it can be captured here.
 */
export async function* chatStream(
  messages: LLMMessage[],
  options: {
    maxTokens?: number;
    jsonMode?: boolean;
    temperature?: number;
    /** Enable GLM reasoning/thinking mode (default: disabled). */
    thinking?: boolean;
    onReasoning?: (reasoningDelta: string) => void;
  } = {}
): AsyncGenerator<string, void, unknown> {
  const stream: any = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: true,
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
    // GLM reasoning models (glm-5.x) emit `reasoning_content` BEFORE `content`
    // and that reasoning consumes the SAME max_tokens budget. On large prompts
    // the reasoning exhausts the whole budget, so `content` comes back empty
    // ("fullContent length: 0"). Disable thinking so the budget goes to actual
    // output. (Matches the proven pattern in AudienceExperts lib/llm.ts.)
    thinking: { type: options.thinking ? "enabled" : "disabled" },
  } as any);

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
