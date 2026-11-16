export type OcrModelId = "v6-tiny" | "v6-small" | "v6-medium";

export type OcrModelInfo = {
  id: OcrModelId;
  label: string;
  speed: "fast" | "balanced" | "accurate";
  note: string;
  approxBytes: number;
  installed: boolean;
  downloading: boolean;
  progress: number;
};

export type OcrStatus = {
  installed: boolean;
  ready: boolean;
  downloading: boolean;
  downloaded: number;
  total: number;
  progress: number;
  model: string;
  activeModel?: OcrModelId;
  availableModels?: OcrModelInfo[];
  installedModels?: OcrModelId[];
  error: string | null;
  dir: string;
  busy?: boolean;
  queued?: number;
};

export type OcrLineBox = { x: number; y: number; width: number; height: number };

export type OcrLine = {
  text: string;
  confidence: number;
  box: OcrLineBox;
};

export type OcrResult = {
  text: string;
  lines: OcrLine[];
  ms: number;
};

export type OcrPriority = "high" | "normal" | "low";

export type OcrSourceFile = { name: string; url: string; bytes: number };
export type OcrSourceModel = { id: OcrModelId; label: string; files: OcrSourceFile[] };
export type OcrSourceInfo = {
  customBaseUrl: string | null;
  defaultBaseUrl: string;
  officialBaseUrls: Record<"tiny" | "small" | "medium", string>;
  models: OcrSourceModel[];
};
export type OcrSourceProbe = {
  name: string;
  url: string;
  ok: boolean;
  status: number;
  bytes: number;
  error?: string;
};
export type OcrSourceTest = { baseUrl: string; files: OcrSourceProbe[]; ok: boolean };

export class OcrClientError extends Error {
  hint?: string;
  code?: string;

  constructor(message: string, options?: { hint?: string; code?: string }) {
    super(message);
    this.name = "OcrClientError";
    this.hint = options?.hint;
    this.code = options?.code;
  }
}

async function readError(response: Response): Promise<OcrClientError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string; hint?: string };
  } | null;
  return new OcrClientError(payload?.error?.message ?? `OCR 请求失败（${response.status}）`, {
    hint: payload?.error?.hint,
    code: payload?.error?.code,
  });
}

export async function fetchOcrStatus(): Promise<OcrStatus> {
  let response: Response;
  try {
    response = await fetch("/api/ocr/status", { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new OcrClientError("无法连接本地代理", { hint: "请确认 npm start 正在运行" });
  }
  if (!response.ok) throw await readError(response);
  return (await response.json()) as OcrStatus;
}

export async function fetchOcrSource(): Promise<OcrSourceInfo> {
  let response: Response;
  try {
    response = await fetch("/api/ocr/source", { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new OcrClientError("无法连接本地代理", { hint: "请确认 npm start 正在运行" });
  }
  if (!response.ok) throw await readError(response);
  return (await response.json()) as OcrSourceInfo;
}

async function sourceRequest(
  path: string,
  body?: unknown,
): Promise<{ source?: OcrSourceInfo } & Partial<OcrSourceTest>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new OcrClientError("无法连接本地代理", { hint: "请确认 npm start 正在运行" });
  }
  if (!response.ok) throw await readError(response);
  return (await response.json()) as { source?: OcrSourceInfo } & Partial<OcrSourceTest>;
}

export async function saveOcrSource(baseUrl: string): Promise<OcrSourceInfo> {
  const payload = await sourceRequest("/api/ocr/source", { baseUrl });
  return payload.source ?? fetchOcrSource();
}

export async function resetOcrSource(): Promise<OcrSourceInfo> {
  const payload = await sourceRequest("/api/ocr/source/reset");
  return payload.source ?? fetchOcrSource();
}

export async function testOcrSource(baseUrl: string, model?: OcrModelId): Promise<OcrSourceTest> {
  const payload = await sourceRequest("/api/ocr/source/test", { baseUrl, model });
  if (!payload.files) throw new OcrClientError("下载源测试没有返回结果");
  return payload as OcrSourceTest;
}

export async function startOcrInstall(model?: OcrModelId): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/ocr/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model ? { model } : {}),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new OcrClientError("无法连接本地代理", { hint: "请确认 npm start 正在运行" });
  }
  if (!response.ok) throw await readError(response);
}

export async function setOcrModel(model: OcrModelId): Promise<OcrStatus> {
  let response: Response;
  try {
    response = await fetch("/api/ocr/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new OcrClientError("无法连接本地代理", { hint: "请确认 npm start 正在运行" });
  }
  if (!response.ok) throw await readError(response);
  const payload = (await response.json()) as { config?: OcrStatus };
  if (payload.config) return payload.config;
  return fetchOcrStatus();
}

/**
 * Send JPEG/PNG bytes instead of a base64 data URL. Saves ~33% upload and one
 * decode on the proxy; the server hands the ArrayBuffer straight to the OCR
 * worker.
 */
export async function recognizeImageBytes(
  image: Blob,
  options: { priority?: OcrPriority; signal?: AbortSignal } = {},
): Promise<OcrResult> {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(120_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    response = await fetch("/api/ocr", {
      method: "POST",
      headers: {
        "Content-Type": image.type || "image/jpeg",
        "X-OCR-Priority": options.priority ?? "normal",
      },
      body: image,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OcrClientError("识别已取消", { hint: "可以重新识别这一页" });
    }
    throw new OcrClientError("无法连接本地代理", { hint: "请确认 npm start 正在运行" });
  }
  if (!response.ok) throw await readError(response);
  return (await response.json()) as OcrResult;
}

/** Legacy data-URL entry point kept for tests and older integrations. */
export async function recognizeImage(image: string): Promise<OcrResult> {
  let response: Response;
  try {
    response = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OcrClientError("识别超时", { hint: "可以缩小页面或重试" });
    }
    throw new OcrClientError("无法连接本地代理", { hint: "请确认 npm start 正在运行" });
  }
  if (!response.ok) throw await readError(response);
  return (await response.json()) as OcrResult;
}
