import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

/**
 * PP-OCRv6 model catalogue.
 *
 * The tiny model is the one that ships with the desktop build. Small and
 * medium are downloaded on demand. All sizes expose the same det/rec/dict
 * triplet, so the worker and the text-layer protocol never depend on a size.
 */
export type OcrModelId = "v6-tiny" | "v6-small" | "v6-medium";

export type OcrModelFile = {
  /** File name inside the model directory. */
  name: string;
  /** Download URL. */
  url: string;
  /** Expected size in bytes; used for progress and integrity checks. */
  bytes: number;
  /** Accept a slightly smaller file (legacy exports used a different size). */
  tolerant?: boolean;
  /**
   * The byte count is authoritative. For small/medium we only know an
   * approximate size, so a successful download is validated by "non-empty"
   * rather than rejecting a valid file that differs by a few percent.
   */
  exact?: boolean;
};

export type OcrModelSpec = {
  id: OcrModelId;
  label: string;
  dir: string;
  speed: "fast" | "balanced" | "accurate";
  note: string;
  /** Approximate download size shown before the file list is known. */
  approxBytes: number;
  files: {
    detection: OcrModelFile;
    recognition: OcrModelFile;
    dictionary: OcrModelFile;
  };
};

const OAR_BASE = (
  process.env.OCR_MODEL_BASE_URL?.trim() ||
  "https://github.com/GreatV/oar-ocr/releases/download/v0.7.0"
).replace(/\/+$/, "");
const HF_BASE = "https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main";

export const OCR_MODELS: Record<OcrModelId, OcrModelSpec> = {
  "v6-tiny": {
    id: "v6-tiny",
    label: "PP-OCRv6 tiny",
    dir: "ppocrv6",
    speed: "fast",
    note: "随桌面版分发，速度最快、内存最低，适合日常阅读。",
    approxBytes: 6_270_385,
    files: {
      detection: {
        name: "det.onnx",
        url: `${OAR_BASE}/pp-ocrv6_tiny_det.onnx`,
        bytes: 1_780_590,
        tolerant: true,
        exact: true,
      },
      recognition: {
        name: "rec.onnx",
        url: `${OAR_BASE}/pp-ocrv6_tiny_rec.onnx`,
        bytes: 4_462_639,
        tolerant: true,
        exact: true,
      },
      dictionary: {
        name: "dict.txt",
        url: `${OAR_BASE}/ppocrv6_tiny_dict.txt`,
        bytes: 27_156,
        tolerant: true,
        exact: true,
      },
    },
  },
  "v6-small": {
    id: "v6-small",
    label: "PP-OCRv6 small",
    dir: "ppocrv6-small",
    speed: "balanced",
    note: "按需下载，精度和速度平衡，适合表格、脚注较多的文档。",
    approxBytes: 12_000_000,
    files: {
      detection: {
        name: "det.ort",
        url: `${HF_BASE}/detection/ort/PP-OCRv6_small_det.ort`,
        bytes: 2_200_000,
      },
      recognition: {
        name: "rec.ort",
        url: `${HF_BASE}/recognition/ort/PP-OCRv6_small_rec.ort`,
        bytes: 9_800_000,
      },
      dictionary: {
        name: "dict.txt",
        url: `${HF_BASE}/recognition/ppocrv6_dict.txt`,
        bytes: 30_000,
      },
    },
  },
  "v6-medium": {
    id: "v6-medium",
    label: "PP-OCRv6 medium",
    dir: "ppocrv6-medium",
    speed: "accurate",
    note: "按需下载，精度最高但更慢、更占内存，适合低质量扫描件。",
    approxBytes: 27_000_000,
    files: {
      detection: {
        name: "det.ort",
        url: `${HF_BASE}/detection/ort/PP-OCRv6_medium_det.ort`,
        bytes: 4_600_000,
      },
      recognition: {
        name: "rec.ort",
        url: `${HF_BASE}/recognition/ort/PP-OCRv6_medium_rec.ort`,
        bytes: 22_000_000,
      },
      dictionary: {
        name: "dict.txt",
        url: `${HF_BASE}/recognition/ppocrv6_dict.txt`,
        bytes: 30_000,
      },
    },
  },
};

export const OCR_MODEL_IDS = Object.keys(OCR_MODELS) as OcrModelId[];

const WRITABLE_ROOT = process.env.OCR_MODEL_DIR
  ? path.resolve(process.env.OCR_MODEL_DIR)
  : null;
const BUNDLED_ROOT = fileURLToPath(new URL("../models", import.meta.url));
const MODELS_ROOT = WRITABLE_ROOT ?? BUNDLED_ROOT;

export function isOcrModelId(value: unknown): value is OcrModelId {
  return typeof value === "string" && OCR_MODEL_IDS.includes(value as OcrModelId);
}

/**
 * Resolve a model directory. The desktop app points OCR_MODEL_DIR at userData
 * (writable, for small/medium downloads) while tiny ships beside the server.
 * Prefer the writable copy, then fall back to the bundled copy.
 */
export function modelDir(id: OcrModelId): string {
  if (id === "v6-tiny" && existsSync(path.join(MODELS_ROOT, "det.onnx"))) {
    return MODELS_ROOT;
  }
  const local = path.join(MODELS_ROOT, OCR_MODELS[id].dir);
  if (id === "v6-tiny" && WRITABLE_ROOT) {
    const localFile = path.join(local, OCR_MODELS[id].files.detection.name);
    if (!existsSync(localFile)) {
      const bundled = path.join(BUNDLED_ROOT, OCR_MODELS[id].dir);
      if (existsSync(path.join(bundled, OCR_MODELS[id].files.detection.name))) {
        return bundled;
      }
    }
  }
  return local;
}

export function modelPaths(id: OcrModelId) {
  const spec = OCR_MODELS[id];
  const dir = modelDir(id);
  return {
    detection: path.join(dir, spec.files.detection.name),
    recognition: path.join(dir, spec.files.recognition.name),
    dictionary: path.join(dir, spec.files.dictionary.name),
  };
}

function specFiles(spec: OcrModelSpec): OcrModelFile[] {
  return [spec.files.detection, spec.files.recognition, spec.files.dictionary];
}

export function modelBytes(id: OcrModelId): number {
  return specFiles(OCR_MODELS[id]).reduce((sum, file) => sum + file.bytes, 0);
}

async function fileBytes(target: string): Promise<number> {
  try {
    const info = await stat(target);
    return info.isFile() ? info.size : 0;
  } catch {
    return 0;
  }
}

function complete(file: OcrModelFile, size: number): boolean {
  if (size < 1024) return false;
  if (!file.exact) return true;
  const minimum = file.tolerant ? file.bytes * 0.9 : file.bytes * 0.98;
  return size >= Math.min(file.bytes, minimum);
}

export async function installedBytes(id: OcrModelId): Promise<number> {
  const spec = OCR_MODELS[id];
  const dir = modelDir(id);
  let total = 0;
  for (const file of specFiles(spec)) {
    total += Math.min(file.bytes, await fileBytes(path.join(dir, file.name)));
  }
  return total;
}

export async function modelsInstalled(id: OcrModelId): Promise<boolean> {
  const spec = OCR_MODELS[id];
  const dir = modelDir(id);
  for (const file of specFiles(spec)) {
    const size = await fileBytes(path.join(dir, file.name));
    if (!complete(file, size)) return false;
  }
  return true;
}

export type ModelDownloadState = {
  active: boolean;
  downloaded: number;
  total: number;
  error: string | null;
};

const downloads = new Map<OcrModelId, ModelDownloadState>();
const installs = new Map<OcrModelId, Promise<void>>();

function downloadState(id: OcrModelId): ModelDownloadState {
  const existing = downloads.get(id);
  if (existing) return existing;
  const state: ModelDownloadState = {
    active: false,
    downloaded: 0,
    total: modelBytes(id),
    error: null,
  };
  downloads.set(id, state);
  return state;
}

export function modelDownloadState(id: OcrModelId): ModelDownloadState {
  return { ...downloadState(id) };
}

function remoteHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function downloadFile(
  id: OcrModelId,
  file: OcrModelFile,
  baseBytes: number,
  baseTotal: number,
): Promise<void> {
  const dir = modelDir(id);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, file.name);
  const size = await fileBytes(target);
  if (complete(file, size)) {
    const state = downloadState(id);
    state.downloaded = baseBytes + Math.min(file.bytes, size);
    return;
  }

  const part = `${target}.part`;
  await unlink(part).catch(() => undefined);
  let response: Response;
  try {
    response = await fetch(file.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error(`无法连接模型下载源（${remoteHost(file.url)}）`);
  }
  if (!response.ok || !response.body) {
    throw new Error(`模型下载失败（${response.status}）`);
  }
  if (/text\/html/i.test(response.headers.get("content-type") ?? "")) {
    throw new Error("下载源返回了网页而不是模型文件");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 64 * 1024 * 1024) {
    throw new Error("模型文件超过 64MB 上限");
  }
  const expected = contentLength > 0 ? contentLength : file.bytes;
  const total = Math.max(baseTotal, baseBytes + expected);
  let received = 0;
  const state = downloadState(id);
  state.total = total;
  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  body.on("data", (chunk: Buffer) => {
    received += chunk.length;
    state.downloaded = Math.min(total, baseBytes + received);
  });

  await pipeline(body, createWriteStream(part));
  const written = await fileBytes(part);
  if (!complete(file, written)) {
    await unlink(part).catch(() => undefined);
    throw new Error(`模型文件不完整：${file.name}`);
  }
  await rename(part, target);
  state.downloaded = Math.min(total, baseBytes + written);
}

async function runInstall(id: OcrModelId): Promise<void> {
  const spec = OCR_MODELS[id];
  const state = downloadState(id);
  state.active = true;
  state.downloaded = 0;
  state.error = null;
  state.total = modelBytes(id);
  try {
    let base = 0;
    for (const file of specFiles(spec)) {
      await downloadFile(id, file, base, state.total);
      base += file.bytes;
    }
    state.active = false;
    state.downloaded = state.total;
  } catch (error) {
    const message = error instanceof Error ? error.message : "模型下载失败";
    state.active = false;
    state.error = message;
    throw error;
  }
}

export function installModels(id: OcrModelId): Promise<void> {
  const running = installs.get(id);
  if (running) return running;
  const promise = runInstall(id).finally(() => {
    installs.delete(id);
  });
  installs.set(id, promise);
  return promise;
}
