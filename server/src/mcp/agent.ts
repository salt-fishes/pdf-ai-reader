import { provider } from "../provider";
import type { ChatMessage } from "../mock";
import { toOpenAiTools } from "./openai";
import type { Toolset } from "./types";

const MAX_TOOL_ROUNDS = 3;
const MAX_RESULT_CHARS = 120_000;
const MAX_EVENT_ARGS = 600;

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type UpstreamMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | unknown[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ToolEvent = {
  id: string;
  name: string;
  label: string;
  phase: "start" | "end" | "error";
  args?: unknown;
  summary?: string;
  durationMs?: number;
  error?: string;
};

export type AgentEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "usage"; usage: unknown }
  | { type: "tool"; tool: ToolEvent };

type Turn = {
  text: string;
  toolCalls: ToolCall[];
  usage: unknown;
};

function mergeUsage(total: unknown, next: unknown): unknown {
  if (!next || typeof next !== "object") return total;
  if (!total || typeof total !== "object") return next;
  const merged: Record<string, unknown> = { ...(total as Record<string, unknown>) };
  for (const [key, value] of Object.entries(next as Record<string, unknown>)) {
    if (typeof value === "number" && typeof merged[key] === "number") {
      merged[key] = (merged[key] as number) + value;
    } else if (value && typeof value === "object") {
      merged[key] = mergeUsage(merged[key], value);
    } else if (merged[key] === undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

function truncate(value: string, max = MAX_RESULT_CHARS): string {
  return value.length > max ? `${value.slice(0, max)}\n…（结果已截断）` : value;
}

function parseArgs(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, value: {} };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "工具参数必须是 JSON 对象" };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, error: "工具参数不是合法 JSON" };
  }
}

function eventArgs(value: Record<string, unknown>): unknown {
  const serialized = JSON.stringify(value);
  return serialized.length > MAX_EVENT_ARGS
    ? { preview: `${serialized.slice(0, MAX_EVENT_ARGS)}…` }
    : value;
}

async function* sseChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
          .trim();
        if (!data || data === "[DONE]") {
          boundary = buffer.indexOf("\n\n");
          continue;
        }
        try {
          const parsed: unknown = JSON.parse(data);
          if (parsed && typeof parsed === "object") {
            yield parsed as Record<string, unknown>;
          }
        } catch {
          // Ignore keep-alive or malformed vendor chunks.
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function consumeTurn(
  body: ReadableStream<Uint8Array>,
  emit: (event: AgentEvent) => void,
): Promise<Turn> {
  const calls: ToolCall[] = [];
  let text = "";
  let usage: unknown = null;
  for await (const chunk of sseChunks(body)) {
    const error = chunk.error as { message?: string } | undefined;
    if (error) throw new Error(error.message ?? "模型返回错误");
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    const choice = choices[0] as
      | {
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }
      | undefined;

    const delta = choice?.delta;
    if (delta?.reasoning_content) emit({ type: "reasoning", text: delta.reasoning_content });
    if (delta?.content) {
      text += delta.content;
      emit({ type: "delta", text: delta.content });
    }
    if (delta?.tool_calls) {
      for (const [fallbackIndex, raw] of delta.tool_calls.entries()) {
        const index = typeof raw.index === "number" ? raw.index : fallbackIndex;
        const slot =
          calls[index] ??
          (calls[index] = {
            id: `call_${index}`,
            type: "function",
            function: { name: "", arguments: "" },
          });
        if (raw.id) slot.id = raw.id;
        if (raw.function?.name) slot.function.name += raw.function.name;
        if (raw.function?.arguments) slot.function.arguments += raw.function.arguments;
      }
    }
    if (chunk.usage) usage = chunk.usage;
  }
  return { text, toolCalls: calls.filter((call) => call.function.name.trim()), usage };
}

async function upstreamError(response: Response): Promise<Error> {
  const text = await response.text().catch(() => "");
  let message = `模型服务返回 ${response.status}`;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    if (text) message = `${message}：${text.slice(0, 300)}`;
  }
  return new Error(message);
}

export async function runAgentChat(options: {
  messages: ChatMessage[];
  model: string;
  effortFields: Record<string, unknown>;
  toolset: Toolset;
  signal: AbortSignal;
  emit: (event: AgentEvent) => void;
}): Promise<void> {
  const tools = toOpenAiTools(options.toolset.tools);
  if (!tools.length) throw new Error("没有可用的外部工具");

  const upstream: UpstreamMessage[] = options.messages.map((message) => ({
    role: message.role as UpstreamMessage["role"],
    content: message.content as UpstreamMessage["content"],
  }));
  const system = upstream.find((message) => message.role === "system");
  if (system) {
    system.content = `${typeof system.content === "string" ? system.content : ""}\n\n${options.toolset.prompt}`;
  } else {
    upstream.unshift({ role: "system", content: options.toolset.prompt });
  }

  let totalUsage: unknown = null;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const forceAnswer = round === MAX_TOOL_ROUNDS;
    let response: Response;
    try {
      response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: options.model,
          messages: upstream,
          stream: true,
          stream_options: { include_usage: true },
          ...options.effortFields,
          tools,
          tool_choice: forceAnswer ? "none" : "auto",
        }),
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new Error(`无法连接模型服务：${error instanceof Error ? error.message : "网络错误"}`);
    }
    if (!response.ok) throw await upstreamError(response);
    if (!response.body) throw new Error("模型没有返回数据流");

    const turn = await consumeTurn(response.body, options.emit);
    totalUsage = mergeUsage(totalUsage, turn.usage);
    if (!turn.toolCalls.length) {
      if (!turn.text.trim() && forceAnswer) throw new Error("模型没有返回最终回答");
      if (totalUsage) options.emit({ type: "usage", usage: totalUsage });
      return;
    }
    if (forceAnswer) {
      throw new Error("模型在最终回答阶段仍请求外部工具，已停止本轮生成");
    }

    upstream.push({
      role: "assistant",
      content: turn.text || null,
      tool_calls: turn.toolCalls,
    });

    for (const call of turn.toolCalls) {
      const tool = options.toolset.tools.find((item) => item.name === call.function.name);
      const parsed = parseArgs(call.function.arguments);
      const label = tool?.label ?? call.function.name;
      const args = parsed.ok
        ? eventArgs(parsed.value)
        : { raw: call.function.arguments.slice(0, 300) };
      const started = Date.now();
      options.emit({
        type: "tool",
        tool: {
          id: call.id,
          name: call.function.name,
          label,
          phase: "start",
          args,
        },
      });

      let resultText: string;
      try {
        if (!tool) throw new Error(`未知工具：${call.function.name}`);
        if (!parsed.ok) throw new Error(parsed.error);
        const result = await tool.execute(parsed.value, options.signal);
        resultText = truncate(result.text);
        options.emit({
          type: "tool",
          tool: {
            id: call.id,
            name: call.function.name,
            label,
            phase: result.isError ? "error" : "end",
            summary: result.summary,
            durationMs: Date.now() - started,
            error: result.isError ? result.text.slice(0, 300) : undefined,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "工具执行失败";
        resultText = `工具执行失败：${message}`;
        options.emit({
          type: "tool",
          tool: {
            id: call.id,
            name: call.function.name,
            label,
            phase: "error",
            durationMs: Date.now() - started,
            error: message.slice(0, 300),
          },
        });
      }

      upstream.push({
        role: "tool",
        tool_call_id: call.id,
        content: truncate(resultText),
      });
    }
  }

  throw new Error("工具调用轮次超过上限");
}
