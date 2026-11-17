import type { Hono } from "hono";
import { isJsonRequest, jsonError } from "../http";
import {
  customOcrSource,
  installModels,
  isOcrModelId,
  normalizeOcrSourceUrl,
  ocrSourceInfo,
  ocrStatus,
  recognizeImage,
  repairOcrRuntime,
  resetOcrSource,
  saveOcrSource,
  setActiveOcrModel,
  testOcrSource,
  type OcrPriority,
} from "../ocr";
import {
  ocrConfigSchema,
  ocrImageSchema,
  ocrInstallSchema,
  ocrSourceSchema,
  ocrSourceTestSchema,
} from "../schemas";

export function registerOcrRoutes(app: Hono): void {
  app.get("/api/ocr/status", async (c) => c.json(await ocrStatus()));

  app.get("/api/ocr/source", (c) => c.json(ocrSourceInfo()));

  app.post("/api/ocr/source", async (c) => {
    if (!isJsonRequest(c)) {
      return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
    }
    if (Number(c.req.header("content-length") ?? 0) > 4 * 1024) {
      return jsonError(413, "body_too_large", "配置请求体过大");
    }
    const parsed = ocrSourceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(
        400,
        "invalid_source",
        "缺少或无效的 baseUrl",
        parsed.error.issues[0]?.message,
      );
    }
    try {
      await saveOcrSource(parsed.data.baseUrl);
    } catch (error) {
      return jsonError(
        400,
        "invalid_source",
        error instanceof Error ? error.message : "下载源无效",
      );
    }
    return c.json({ ok: true, source: ocrSourceInfo() });
  });

  app.post("/api/ocr/source/test", async (c) => {
    if (!isJsonRequest(c)) {
      return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
    }
    const parsed = ocrSourceTestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError(400, "invalid_source", "下载源参数不合法", parsed.error.issues[0]?.message);
    }
    const baseUrl = parsed.data.baseUrl ?? customOcrSource();
    if (!baseUrl) return jsonError(400, "invalid_source", "缺少 baseUrl");
    const model = parsed.data.model ?? "v6-tiny";
    try {
      normalizeOcrSourceUrl(baseUrl);
      const result = await testOcrSource(baseUrl, model);
      return c.json(result);
    } catch (error) {
      return jsonError(
        400,
        "invalid_source",
        error instanceof Error ? error.message : "下载源无效",
      );
    }
  });

  app.post("/api/ocr/source/reset", async (c) => {
    await resetOcrSource();
    return c.json({ ok: true, source: ocrSourceInfo() });
  });

  app.post("/api/ocr/install", async (c) => {
    let requested: unknown;
    if (isJsonRequest(c)) {
      const parsed = ocrInstallSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return jsonError(400, "invalid_model", "未知的 OCR 模型", parsed.error.issues[0]?.message);
      }
      requested = parsed.data.model;
    }
    if (requested !== undefined && !isOcrModelId(requested)) {
      return jsonError(400, "invalid_model", "未知的 OCR 模型");
    }
    try {
      const status = await ocrStatus();
      const model = isOcrModelId(requested) ? requested : status.activeModel;
      const info = status.availableModels.find((item) => item.id === model);
      if (!info?.installed || !status.runtime.installed) {
        // One click installs the runtime pack first, then the selected model.
        void installModels(model).catch(() => undefined);
      }
      return c.json({ ok: true, model, runtime: !status.runtime.installed }, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法启动模型下载";
      return jsonError(500, "ocr_install_failed", message, "检查网络或 OCR_MODELS_ROOT");
    }
  });

  app.post("/api/ocr/repair", async (c) => {
    // The download runs in the background; Settings polls /api/ocr/status.
    // Fire-and-forget keeps the request short and matches /api/ocr/install.
    void repairOcrRuntime().catch(() => undefined);
    return c.json({ ok: true }, 202);
  });

  app.post("/api/ocr/config", async (c) => {
    if (!isJsonRequest(c)) {
      return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
    }
    if (Number(c.req.header("content-length") ?? 0) > 16 * 1024) {
      return jsonError(413, "body_too_large", "配置请求体过大");
    }
    const parsed = ocrConfigSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, "invalid_model", "未知的 OCR 模型", parsed.error.issues[0]?.message);
    }
    const status = await setActiveOcrModel(parsed.data.model);
    return c.json({ ok: true, config: status });
  });

  app.post("/api/ocr", async (c) => {
    const headerLength = Number(c.req.header("content-length") ?? 0);
    if (headerLength > 12 * 1024 * 1024) {
      return jsonError(413, "body_too_large", "图片超过 12MB", "降低页面渲染分辨率");
    }
    const status = await ocrStatus();
    if (!status.runtime.installed) {
      return jsonError(
        409,
        "ocr_runtime_not_installed",
        "OCR 组件尚未下载",
        "在设置 → 扫描件 OCR 中下载组件",
      );
    }
    if (!status.installed) {
      return jsonError(409, "ocr_not_installed", "OCR 模型尚未下载", "在设置中下载 OCR 模型");
    }

    let bytes: Buffer;
    const contentType = c.req.header("content-type") ?? "";
    if (isJsonRequest(c)) {
      let body: { image: string };
      try {
        const parsed = ocrImageSchema.safeParse(await c.req.json());
        if (!parsed.success) {
          return jsonError(
            400,
            "invalid_image",
            "缺少 image 数据",
            parsed.error.issues[0]?.message,
          );
        }
        body = parsed.data;
      } catch {
        return jsonError(400, "invalid_json", "请求体不是合法 JSON");
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
      if (message.includes("组件尚未下载")) {
        return jsonError(
          409,
          "ocr_runtime_not_installed",
          message,
          "在设置 → 扫描件 OCR 中下载组件",
        );
      }
      if (message.includes("尚未下载")) {
        return jsonError(409, "ocr_not_installed", message, "在设置中下载 OCR 模型");
      }
      if (message.includes("取消")) {
        return jsonError(499, "ocr_cancelled", message);
      }
      return jsonError(500, "ocr_failed", message, "检查模型文件是否完整，或重新下载");
    }
  });
}
