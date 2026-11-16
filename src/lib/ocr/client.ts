export type OcrStatus = {
  installed: boolean;
  ready: boolean;
  downloading: boolean;
  downloaded: number;
  total: number;
  progress: number;
  model: string;
  error: string | null;
  dir: string;
};

export type OcrLine = {
  text: string;
  confidence: number;
  box?: unknown;
};

export type OcrResult = {
  text: string;
  lines: OcrLine[];
  ms: number;
};

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
  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; hint?: string } }
    | null;
  return new OcrClientError(
    payload?.error?.message ?? `OCR 请求失败（${response.status}）`,
    { hint: payload?.error?.hint, code: payload?.error?.code },
  );
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

export async function startOcrInstall(): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/ocr/install", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new OcrClientError("无法连接本地代理", { hint: "请确认 npm start 正在运行" });
  }
  if (!response.ok) throw await readError(response);
}

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

