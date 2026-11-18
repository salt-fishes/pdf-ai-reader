import type { Hono } from "hono";
import { config } from "../config";
import { isJsonRequest, jsonError } from "../http";
import { getToolset } from "../mcp";
import { agentChatResponse } from "../mcp/response";
import { mockChat, validateMessages } from "../mock";
import { MODEL_RE, provider } from "../provider";
import { chatSchema, type ChatInput } from "../schemas";

const MAX_BODY_BYTES = 25 * 1024 * 1024;

export function registerChatRoute(app: Hono): void {
  app.post("/api/chat", async (c) => {
    if (!isJsonRequest(c)) {
      return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
    }
    if (!provider.apiKey && !config.mockAi) {
      return jsonError(
        503,
        "missing_key",
        "服务端未配置 AI_API_KEY",
        "在设置 → 模型服务中填入密钥",
      );
    }

    const length = Number(c.req.header("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) {
      return jsonError(413, "body_too_large", "请求体超过 25MB", "减少截图数量或降低图片尺寸");
    }

    let body: ChatInput;
    try {
      const parsed = chatSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return jsonError(400, "invalid_request", "请求字段不合法", parsed.error.issues[0]?.message);
      }
      body = parsed.data;
    } catch {
      return jsonError(400, "invalid_json", "请求体不是合法 JSON");
    }

    const messages = validateMessages(body.messages);
    if (!messages) {
      return jsonError(
        400,
        "invalid_messages",
        "messages 结构不合法",
        "仅支持 system/user/assistant，最多 4 张图片",
      );
    }

    if (config.mockAi) {
      return mockChat(messages);
    }

    const requestedModel = body.model ?? provider.model;
    if (!MODEL_RE.test(requestedModel)) {
      return jsonError(400, "invalid_model", "模型名不合法");
    }
    if (provider.modelAllow.length && !provider.modelAllow.includes(requestedModel)) {
      return jsonError(400, "model_not_allowed", "该模型不在允许列表内");
    }
    if (!provider.modelAllow.length && requestedModel !== provider.model) {
      return jsonError(
        400,
        "model_not_allowed",
        "服务端只允许使用配置中的模型",
        "如需切换，请设置模型允许列表",
      );
    }

    const effort = body.effort ?? null;
    if (effort !== null && !["none", "low", "high", "max"].includes(effort)) {
      return jsonError(400, "invalid_effort", "思考强度不合法", "可选 none / low / high / max");
    }
    const isDeepSeek = /deepseek/i.test(provider.baseUrl);
    const effortFields =
      effort === null
        ? {}
        : isDeepSeek
          ? effort === "none"
            ? { thinking: { type: "disabled" } }
            : { thinking: { type: "enabled" }, reasoning_effort: effort }
          : effort === "none"
            ? {}
            : { reasoning_effort: effort };

    // When external tools are enabled, the proxy owns the tool loop and
    // re-emits the same SSE shape plus tool events. With no tools, keep the
    // original zero-copy passthrough so existing behavior is untouched.
    // Strict document mode never exposes external tools: the model must stay
    // grounded in the supplied pages.
    const toolset = body.documentOnly ? { tools: [], prompt: "" } : await getToolset();
    if (toolset.tools.length) {
      return agentChatResponse({
        messages,
        model: requestedModel,
        effortFields,
        toolset,
        signal: c.req.raw.signal,
      });
    }

    const upstreamBody = {
      model: requestedModel,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...effortFields,
    };

    let upstream: Response;
    try {
      upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(upstreamBody),
        signal: c.req.raw.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return new Response(null, { status: 499 });
      }
      const message = error instanceof Error ? error.message : "unknown";
      return jsonError(502, "network_error", "无法连接模型服务", message);
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      let message = `上游返回 ${upstream.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        if (text) message = text.slice(0, 300);
      }
      return jsonError(upstream.status, "upstream_error", message, "检查密钥、模型名与额度");
    }

    c.header("Content-Type", "text/event-stream; charset=utf-8");
    c.header("Cache-Control", "no-cache, no-transform");
    c.header("X-Accel-Buffering", "no");
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
