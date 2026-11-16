import type { Hono } from "hono";
import { config } from "../config";
import { isJsonRequest, jsonError } from "../http";
import { provider, publicConfig, updateProvider, MOCK_MODELS } from "../provider";
import { providerConfigSchema } from "../schemas";

export function registerProviderRoutes(app: Hono): void {
  app.get("/api/config", (c) => c.json(publicConfig()));

  app.post("/api/provider", async (c) => {
    if (!isJsonRequest(c)) {
      return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
    }
    if (Number(c.req.header("content-length") ?? 0) > 64 * 1024) {
      return jsonError(413, "body_too_large", "配置请求体过大");
    }
    let input;
    try {
      const parsed = providerConfigSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return jsonError(400, "invalid_request", "配置字段不合法", parsed.error.issues[0]?.message);
      }
      input = parsed.data;
    } catch {
      return jsonError(400, "invalid_json", "请求体不是合法 JSON");
    }
    const result = await updateProvider(input);
    if (!result.ok) {
      return jsonError(result.status, result.code, result.message, result.hint);
    }
    return c.json({ ok: true, keyCleared: result.keyCleared, config: result.config });
  });

  app.get("/api/models", async (c) => {
    if (config.mockAi) {
      return c.json({ models: MOCK_MODELS });
    }
    if (!provider.apiKey) {
      return jsonError(
        503,
        "missing_key",
        "服务端未配置 AI_API_KEY",
        "在设置 → 模型服务中填入密钥",
      );
    }
    try {
      const upstream = await fetch(`${provider.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
        signal: AbortSignal.timeout(12_000),
      });
      if (!upstream.ok) {
        const text = await upstream.text();
        return jsonError(
          upstream.status,
          "upstream_error",
          `上游返回 ${upstream.status}`,
          text.slice(0, 300),
        );
      }
      const payload = (await upstream.json()) as { data?: Array<{ id?: string }> };
      const discovered = (payload.data ?? [])
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id));
      // 只暴露允许列表内的模型，避免前端选到会被 400 拒绝的模型。
      const models = provider.modelAllow.length
        ? provider.modelAllow.filter((id) => discovered.includes(id))
        : discovered;
      return c.json({
        models: models.length
          ? models
          : provider.modelAllow.length
            ? provider.modelAllow
            : [provider.model],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      return jsonError(502, "network_error", "无法连接模型服务", message);
    }
  });
}
