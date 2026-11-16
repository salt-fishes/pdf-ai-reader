import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  customOcrSource,
  installModels,
  isOcrModelId,
  normalizeOcrSourceUrl,
  ocrSourceInfo,
  ocrStatus,
  recognizeImage,
  resetOcrSource,
  saveOcrSource,
  setActiveOcrModel,
  testOcrSource,
  type OcrPriority,
} from "./ocr";

// Load server/.env first; a root .env remains a fallback. Existing env wins.
loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
loadEnv();

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://127.0.0.1:5173";
const MOCK_AI = process.env.MOCK_AI === "1";
const MOCK_MODELS = ["deepseek-flash", "deepseek-v4.1-flash", "qwen-vl-max", "glm-4v-plus"];
const DATA_DIR = process.env.PDF_AI_DATA_DIR ?? fileURLToPath(new URL("../data", import.meta.url));
const PROVIDER_FILE = join(DATA_DIR, "provider.json");

type ProviderState = {
  baseUrl: string;
  apiKey: string;
  model: string;
  modelAllow: string[];
};

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizeAllow(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
}

function envProvider(): ProviderState {
  return {
    baseUrl: normalizeBaseUrl(process.env.AI_BASE_URL ?? "https://api.deepseek.com"),
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "deepseek-flash",
    modelAllow: normalizeAllow(process.env.AI_MODEL_ALLOW ?? ""),
  };
}

function readProviderFile(): Partial<ProviderState> {
  try {
    if (!existsSync(PROVIDER_FILE)) return {};
    const raw = JSON.parse(readFileSync(PROVIDER_FILE, "utf8")) as Partial<ProviderState>;
    return {
      baseUrl: typeof raw.baseUrl === "string" ? normalizeBaseUrl(raw.baseUrl) : undefined,
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined,
      model: typeof raw.model === "string" ? raw.model : undefined,
      modelAllow: Array.isArray(raw.modelAllow) ? normalizeAllow(raw.modelAllow) : undefined,
    };
  } catch {
    return {};
  }
}

const fileProvider = readProviderFile();
const provider: ProviderState = {
  baseUrl: fileProvider.baseUrl ?? envProvider().baseUrl,
  apiKey: fileProvider.apiKey !== undefined ? fileProvider.apiKey : envProvider().apiKey,
  model: fileProvider.model ?? envProvider().model,
  modelAllow: fileProvider.modelAllow ?? envProvider().modelAllow,
};
let apiKeyFromFile = fileProvider.apiKey !== undefined;

async function saveProvider(next: {
  baseUrl: string;
  model: string;
  modelAllow: string[];
  apiKey?: string;
}): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PROVIDER_FILE, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

const MODEL_RE = /^[a-zA-Z0-9._:/-]{1,96}$/;
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const MAX_IMAGES = 4;

/**
 * Mutating endpoints are only reachable from the app itself. A browser always
 * sends Origin for POST, so a missing Origin is accepted only for local
 * scripts/tests; cross-site and same-site (subdomain) requests are rejected
 * before they can change the provider URL or spend tokens.
 */
const ALLOWED_ORIGINS = new Set([
  APP_ORIGIN,
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function trustedMutation(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const origin = c.req.header("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return false;
  const site = c.req.header("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return false;
  return true;
}

function isJsonRequest(c: { req: { header: (name: string) => string | undefined } }): boolean {
  return /^application\/json\b/i.test(c.req.header("content-type") ?? "");
}

type ChatMessage = {
  role?: string;
  content?: unknown;
};

function jsonError(status: number, code: string, message: string, hint?: string) {
  return Response.json({ error: { code, message, hint } }, { status });
}

function countImages(messages: ChatMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part && typeof part === "object" && (part as { type?: string }).type === "image_url") {
          count += 1;
        }
      }
    }
  }
  return count;
}

function validateMessages(messages: unknown): ChatMessage[] | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 200) return null;
  for (const message of messages) {
    if (!message || typeof message !== "object") return null;
    const role = (message as ChatMessage).role;
    if (role !== "system" && role !== "user" && role !== "assistant") return null;
  }
  if (countImages(messages as ChatMessage[]) > MAX_IMAGES) return null;
  return messages as ChatMessage[];
}

function messageText(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) =>
      part && typeof part === "object" && (part as { type?: string }).type === "text"
        ? String((part as { text?: string }).text ?? "")
        : "",
    )
    .join("\n");
}

function mockChat(messages: ChatMessage[]): Response {
  const context = messages.map(messageText).join("\n");
  const pages = [...context.matchAll(/<<<PAGE (\d+)>>>/g)].map((match) => Number(match[1]));
  const uniquePages = [...new Set(pages)];
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const question = messageText(lastUser ?? { role: "user", content: "" })
    .replace(/\s+/g, " ")
    .slice(0, 80);
  const cited = uniquePages.length ? uniquePages.slice(0, 2) : [1];
  const answer = [
    `这是本地 mock 模型对“${question || "当前内容"}”的回答，用来验证流式渲染、引用回跳与 token 计量。`,
    "",
    `根据上下文，第 ${cited[0]} 页给出了主要结论：默认只携带当前页，按需扩展到页码、选中文字和截图。`,
    cited[1] ? `第 ${cited[1]} 页进一步说明了预算与缓存策略。` : "",
    "",
    `> 引用：[[p.${cited[0]}]]${cited[1] ? `、[[p.${cited[1]}]]` : ""}`,
    "",
    "**要点**",
    "",
    "1. 上下文默认折叠成一行，展开后才看到来源与 token 分桶。",
    "2. 引用只对真实出现在上下文中的页码生成按钮。",
    "3. 停止按钮会立刻中断上游流。",
    "4. 行内公式 $a^2+b^2=c^2$ 与行间公式：",
    "",
    "$$\\int_0^1 x^2\\,dx=\\frac{1}{3}$$",
    "",
    "\\[ \\nabla\\cdot\\mathbf{E}=\\frac{\\rho}{\\varepsilon_0} \\]",
    "",
    "这是一段用于测试“展开全文”的补充说明：mock 回答不调用真实模型，不会产生费用；配置 `AI_API_KEY` 并关闭 `MOCK_AI` 后即可使用真实服务。",
  ]
    .filter((line, index, array) => line !== "" || array[index - 1] !== "")
    .join("\n");

  const chunks = answer.match(/[\s\S]{1,14}/g) ?? [answer];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      for (const chunk of chunks) {
        send({ choices: [{ delta: { content: chunk } }] });
        await new Promise((resolve) => setTimeout(resolve, 24));
      }
      send({
        choices: [],
        usage: {
          prompt_tokens: 1480,
          prompt_cache_hit_tokens: 1024,
          prompt_cache_miss_tokens: 456,
          completion_tokens: 186,
          prompt_tokens_details: { image_tokens: 0 },
        },
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

const app = new Hono();

function publicConfig() {
  let host = "";
  try {
    host = new URL(provider.baseUrl).host;
  } catch {
    host = provider.baseUrl;
  }
  return {
    mode: "server",
    model: provider.model,
    models: MOCK_AI
      ? MOCK_MODELS
      : provider.modelAllow.length
        ? provider.modelAllow
        : [provider.model],
    baseUrlHost: host,
    baseUrl: provider.baseUrl,
    modelAllow: provider.modelAllow,
    hasKey: Boolean(provider.apiKey),
    keyHint: provider.apiKey ? provider.apiKey.slice(-4) : "",
    mock: MOCK_AI,
    origin: APP_ORIGIN,
    budget: { input: 1_000_000, output: 8_000 },
    contextWindow: 1_000_000,
  };
}

app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && !trustedMutation(c)) {
    return jsonError(403, "cross_site_blocked", "已阻止跨站请求", "只允许本机阅读器修改配置");
  }
  await next();
});

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    // pdf.js uses WebAssembly for image decoding and some ICC paths; without
    // 'wasm-unsafe-eval' production falls back to slower JS and logs errors.
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/config", (c) => c.json(publicConfig()));

app.post("/api/provider", async (c) => {
  if (!isJsonRequest(c)) {
    return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
  }
  if (Number(c.req.header("content-length") ?? 0) > 64 * 1024) {
    return jsonError(413, "body_too_large", "配置请求体过大");
  }
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "invalid_json", "请求体不是合法 JSON");
  }
  const baseUrl = normalizeBaseUrl(
    typeof body.baseUrl === "string" ? body.baseUrl : provider.baseUrl,
  );
  const previousHost = (() => {
    try {
      return new URL(provider.baseUrl).host;
    } catch {
      return "";
    }
  })();
  const nextHost = (() => {
    try {
      return new URL(baseUrl).host;
    } catch {
      return "";
    }
  })();
  const hostChanged = Boolean(previousHost && nextHost && previousHost !== nextHost);
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
  } catch {
    return jsonError(400, "invalid_base_url", "Base URL 必须是 http(s) 地址");
  }
  const model =
    typeof body.model === "string" && body.model.trim() ? body.model.trim() : provider.model;
  if (!MODEL_RE.test(model)) {
    return jsonError(400, "invalid_model", "模型名不合法");
  }
  const modelAllow = normalizeAllow(body.modelAllow ?? provider.modelAllow);
  for (const item of modelAllow) {
    if (!MODEL_RE.test(item)) {
      return jsonError(400, "invalid_model", `允许列表中的模型名不合法：${item}`);
    }
  }
  let runtimeKey = provider.apiKey;
  let savedKey: string | undefined = apiKeyFromFile ? provider.apiKey : undefined;
  let keyCleared = false;

  if (body.clearKey === true) {
    runtimeKey = "";
    savedKey = "";
    keyCleared = true;
  }

  const providedKey =
    typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : "";
  if (providedKey) {
    if (providedKey.length > 512) {
      return jsonError(400, "invalid_key", "API Key 过长");
    }
    runtimeKey = providedKey;
    savedKey = providedKey;
  } else if (hostChanged && body.clearKey !== true) {
    // Never forward a key to a different host silently. Changing the base URL
    // without supplying a key clears it; the UI asks for the new key.
    runtimeKey = "";
    savedKey = "";
    keyCleared = true;
  }

  const next: ProviderState = { baseUrl, apiKey: runtimeKey, model, modelAllow };
  try {
    await saveProvider({ baseUrl, model, modelAllow, apiKey: savedKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法写入配置文件";
    return jsonError(500, "provider_save_failed", "无法保存模型服务配置", message);
  }
  apiKeyFromFile = savedKey !== undefined;
  Object.assign(provider, next);
  return c.json({ ok: true, keyCleared, config: publicConfig() });
});

app.get("/api/models", async (c) => {
  if (MOCK_AI) {
    return c.json({ models: MOCK_MODELS });
  }
  if (!provider.apiKey) {
    return jsonError(503, "missing_key", "服务端未配置 AI_API_KEY", "在设置 → 模型服务中填入密钥");
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

app.get("/api/ocr/status", async (c) => c.json(await ocrStatus()));

app.get("/api/ocr/source", (c) => c.json(ocrSourceInfo()));

app.post("/api/ocr/source", async (c) => {
  if (!isJsonRequest(c)) {
    return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
  }
  if (Number(c.req.header("content-length") ?? 0) > 4 * 1024) {
    return jsonError(413, "body_too_large", "配置请求体过大");
  }
  const body = (await c.req.json().catch(() => null)) as { baseUrl?: unknown } | null;
  if (!body || typeof body.baseUrl !== "string") {
    return jsonError(400, "invalid_source", "缺少 baseUrl");
  }
  try {
    await saveOcrSource(body.baseUrl);
  } catch (error) {
    return jsonError(400, "invalid_source", error instanceof Error ? error.message : "下载源无效");
  }
  return c.json({ ok: true, source: ocrSourceInfo() });
});

app.post("/api/ocr/source/test", async (c) => {
  if (!isJsonRequest(c)) {
    return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
  }
  const body = (await c.req.json().catch(() => null)) as {
    baseUrl?: unknown;
    model?: unknown;
  } | null;
  const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl : customOcrSource();
  if (!baseUrl) return jsonError(400, "invalid_source", "缺少 baseUrl");
  const model = isOcrModelId(body?.model) ? body.model : "v6-tiny";
  try {
    normalizeOcrSourceUrl(baseUrl);
    const result = await testOcrSource(baseUrl, model);
    return c.json(result);
  } catch (error) {
    return jsonError(400, "invalid_source", error instanceof Error ? error.message : "下载源无效");
  }
});

app.post("/api/ocr/source/reset", async (c) => {
  await resetOcrSource();
  return c.json({ ok: true, source: ocrSourceInfo() });
});

app.post("/api/ocr/install", async (c) => {
  let requested: unknown;
  if (isJsonRequest(c)) {
    const body = (await c.req.json().catch(() => ({}))) as { model?: unknown };
    requested = body.model;
  }
  if (requested !== undefined && !isOcrModelId(requested)) {
    return jsonError(400, "invalid_model", "未知的 OCR 模型");
  }
  try {
    const status = await ocrStatus();
    const model = isOcrModelId(requested) ? requested : status.activeModel;
    const info = status.availableModels.find((item) => item.id === model);
    if (!info?.installed) {
      void installModels(model).catch(() => undefined);
    }
    return c.json({ ok: true, model }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法启动模型下载";
    return jsonError(500, "ocr_install_failed", message, "检查网络或 OCR_MODELS_ROOT");
  }
});

app.post("/api/ocr/config", async (c) => {
  if (!isJsonRequest(c)) {
    return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
  }
  if (Number(c.req.header("content-length") ?? 0) > 16 * 1024) {
    return jsonError(413, "body_too_large", "配置请求体过大");
  }
  const body = (await c.req.json().catch(() => null)) as { model?: unknown } | null;
  if (!body || !isOcrModelId(body.model)) {
    return jsonError(400, "invalid_model", "未知的 OCR 模型");
  }
  const status = await setActiveOcrModel(body.model);
  return c.json({ ok: true, config: status });
});

app.post("/api/ocr", async (c) => {
  const headerLength = Number(c.req.header("content-length") ?? 0);
  if (headerLength > 12 * 1024 * 1024) {
    return jsonError(413, "body_too_large", "图片超过 12MB", "降低页面渲染分辨率");
  }
  const status = await ocrStatus();
  if (!status.installed) {
    return jsonError(409, "ocr_not_installed", "OCR 模型尚未下载", "在设置中下载 OCR 模型");
  }

  let bytes: Buffer;
  const contentType = c.req.header("content-type") ?? "";
  if (isJsonRequest(c)) {
    let body: { image?: unknown };
    try {
      body = (await c.req.json()) as { image?: unknown };
    } catch {
      return jsonError(400, "invalid_json", "请求体不是合法 JSON");
    }
    if (typeof body.image !== "string") {
      return jsonError(400, "invalid_image", "缺少 image 数据");
    }
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(body.image);
    if (!match) {
      return jsonError(400, "invalid_image", "image 必须是 PNG/JPEG data URL");
    }
    bytes = Buffer.from(match[1], "base64");
  } else if (
    /^(image\/jpeg|image\/png|image\/webp|application\/octet-stream)\b/i.test(contentType)
  ) {
    bytes = Buffer.from(await c.req.arrayBuffer());
  } else {
    return jsonError(415, "invalid_content_type", "请发送 JPEG/PNG 图片字节");
  }

  if (bytes.byteLength < 64) {
    return jsonError(400, "invalid_image", "图片数据为空");
  }
  if (bytes.byteLength > 8 * 1024 * 1024) {
    return jsonError(413, "image_too_large", "图片超过 8MB", "降低页面渲染分辨率");
  }

  const priorityHeader = c.req.header("x-ocr-priority");
  const priority: OcrPriority =
    priorityHeader === "high" || priorityHeader === "low" ? priorityHeader : "normal";

  try {
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const result = await recognizeImage(arrayBuffer, {
      priority,
      signal: c.req.raw.signal,
    });
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR 失败";
    if (message.includes("尚未下载")) {
      return jsonError(409, "ocr_not_installed", message, "在设置中下载 OCR 模型");
    }
    if (message.includes("取消")) {
      return jsonError(499, "ocr_cancelled", message);
    }
    return jsonError(500, "ocr_failed", message, "检查模型文件是否完整，或重新下载");
  }
});

app.post("/api/chat", async (c) => {
  if (!isJsonRequest(c)) {
    return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
  }
  if (!provider.apiKey && !MOCK_AI) {
    return jsonError(503, "missing_key", "服务端未配置 AI_API_KEY", "在设置 → 模型服务中填入密钥");
  }

  const length = Number(c.req.header("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return jsonError(413, "body_too_large", "请求体超过 25MB", "减少截图数量或降低图片尺寸");
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
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

  if (MOCK_AI) {
    return mockChat(messages);
  }

  const requestedModel = typeof body.model === "string" ? body.model : provider.model;
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

  const effort = typeof body.effort === "string" ? body.effort : null;
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

// Production: serve the built SPA from dist/.
const distIndex = fileURLToPath(new URL("../../dist/index.html", import.meta.url));
const hasDist = existsSync(distIndex);
if (hasDist) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", async (c) => {
    const html = await readFile(distIndex, "utf8");
    return c.html(html);
  });
}

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return jsonError(404, "not_found", "接口不存在");
  }
  return c.text("Not found", 404);
});

app.onError((error) => {
  const message = error instanceof Error ? error.message : "unknown";
  return jsonError(500, "internal_error", "服务端错误", message.slice(0, 300));
});

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(
    `[api] http://${HOST}:${info.port}  model=${provider.model}  key=${provider.apiKey ? "set" : "missing"}`,
  );
});
