import { parseSse } from "./sse";
import type { AiError, ApiMessage, ServerConfig, ThinkingEffort } from "./types";

export async function fetchConfig(): Promise<ServerConfig> {
  const response = await fetch("/api/config");
  if (!response.ok) throw new Error(`配置接口返回 ${response.status}`);
  return (await response.json()) as ServerConfig;
}

export async function fetchModels(): Promise<string[]> {
  const response = await fetch("/api/models");
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? `模型列表返回 ${response.status}`);
  }
  const payload = (await response.json()) as { models?: string[] };
  return payload.models ?? [];
}

export type ProviderInput = {
  baseUrl: string;
  model: string;
  modelAllow: string[];
  apiKey?: string;
  clearKey?: boolean;
};

export async function saveProviderConfig(input: ProviderInput): Promise<ServerConfig> {
  const response = await fetch("/api/provider", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as {
    config?: ServerConfig;
    error?: { message?: string; hint?: string };
  } | null;
  if (!response.ok || !payload?.config) {
    throw new Error(
      payload?.error?.hint
        ? `${payload.error.message ?? "保存失败"}（${payload.error.hint}）`
        : (payload?.error?.message ?? `保存失败（${response.status}）`),
    );
  }
  return payload.config;
}

export type StreamHandlers = {
  onDelta: (text: string) => void;
  onReasoning: (text: string) => void;
  onUsage: (usage: unknown) => void;
};

export type StreamResult = {
  usage: unknown;
  aborted: boolean;
};

export async function streamChat(
  messages: ApiMessage[],
  model: string,
  effort: ThinkingEffort,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<StreamResult> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model, effort }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { usage: null, aborted: true };
    }
    throw toAiError(error, "代理未启动或网络不可达", "请运行 npm run dev:server，并检查端口 8787");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; hint?: string };
    } | null;
    const hints: Record<number, string> = {
      401: "请到设置 → 模型服务检查 API Key 是否正确",
      403: "密钥无权访问该模型，检查账号权限",
      404: "检查模型服务地址与模型名",
      413: "上下文过大，缩小页码或减少截图",
      429: "请求过快或额度不足，稍后重试",
      503: "模型服务尚未配置密钥，请到设置 → 模型服务中填写",
    };
    const error: AiError = {
      code: payload?.error?.code ?? `http_${response.status}`,
      message: payload?.error?.message ?? `请求失败（${response.status}）`,
      hint: payload?.error?.hint ?? hints[response.status],
      status: response.status,
    };
    throw error;
  }
  if (!response.body) {
    throw { code: "empty_stream", message: "模型没有返回数据流" } satisfies AiError;
  }

  let usage: unknown = null;
  let sawError: AiError | null = null;

  try {
    for await (const event of parseSse(response.body)) {
      if (event.type === "delta") handlers.onDelta(event.text);
      else if (event.type === "reasoning") handlers.onReasoning(event.text);
      else if (event.type === "usage") {
        usage = event.usage;
        handlers.onUsage(event.usage);
      } else if (event.type === "error") {
        sawError = event.error;
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { usage, aborted: true };
    }
    throw toAiError(error, "数据流中断", "检查代理日志或重试");
  }

  if (sawError) throw sawError;
  return { usage, aborted: false };
}

function toAiError(error: unknown, message: string, hint: string): AiError {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return error as AiError;
  }
  return {
    code: "network_error",
    message,
    hint,
  };
}

export function describeError(error: unknown): { message: string; hint?: string } {
  const err = error as Partial<AiError> | null;
  if (err && typeof err === "object" && typeof err.message === "string") {
    return { message: err.message, hint: err.hint };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: "未知错误" };
}
