import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

type OcrService = import("ppu-paddle-ocr").PaddleOcrService;

/**
 * Optional PP-OCRv6 tiny install. Nothing is downloaded until the user asks
 * for it; models live beside the proxy, never in the browser bundle.
 *
 * ONNX files are the PP-OCRv6 tiny conversion published by oar-ocr
 * (Apache-2.0, originals from PaddlePaddle/PaddleOCR).
 */
const DEFAULT_BASE =
  "https://github.com/GreatV/oar-ocr/releases/download/v0.7.0";

const MODEL_FILES = [
  {
    name: "det.onnx",
    source: "pp-ocrv6_tiny_det.onnx",
    bytes: 1_780_590,
  },
  {
    name: "rec.onnx",
    source: "pp-ocrv6_tiny_rec.onnx",
    bytes: 4_462_639,
  },
  {
    name: "dict.txt",
    source: "ppocrv6_tiny_dict.txt",
    bytes: 27_156,
  },
] as const;

const TOTAL_BYTES = MODEL_FILES.reduce((sum, file) => sum + file.bytes, 0);
const BASE_URL = (process.env.OCR_MODEL_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
const MODEL_DIR = process.env.OCR_MODEL_DIR
  ? path.resolve(process.env.OCR_MODEL_DIR)
  : fileURLToPath(new URL("../models/ppocrv6", import.meta.url));

type DownloadState = {
  active: boolean;
  downloaded: number;
  total: number;
  error: string | null;
};

let download: DownloadState = {
  active: false,
  downloaded: 0,
  total: TOTAL_BYTES,
  error: null,
};
let installPromise: Promise<void> | null = null;
let servicePromise: Promise<OcrService> | null = null;

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

async function fileBytes(target: string): Promise<number> {
  try {
    const info = await stat(target);
    return info.isFile() ? info.size : 0;
  } catch {
    return 0;
  }
}

export async function installedBytes(): Promise<number> {
  let total = 0;
  for (const file of MODEL_FILES) total += await fileBytes(path.join(MODEL_DIR, file.name));
  return total;
}

export async function modelsInstalled(): Promise<boolean> {
  for (const file of MODEL_FILES) {
    const size = await fileBytes(path.join(MODEL_DIR, file.name));
    if (size < file.bytes * 0.98) return false;
  }
  return true;
}

export async function ocrStatus(): Promise<OcrStatus> {
  const installed = await modelsInstalled();
  const downloaded = installed ? TOTAL_BYTES : await installedBytes();
  return {
    installed,
    ready: Boolean(servicePromise),
    downloading: download.active,
    downloaded,
    total: TOTAL_BYTES,
    progress: TOTAL_BYTES ? Math.min(1, downloaded / TOTAL_BYTES) : 0,
    model: "PP-OCRv6 tiny",
    error: download.error,
    dir: MODEL_DIR,
  };
}

async function downloadFile(
  file: (typeof MODEL_FILES)[number],
  baseBytes: number,
): Promise<void> {
  const target = path.join(MODEL_DIR, file.name);
  if ((await fileBytes(target)) >= file.bytes * 0.98) {
    download.downloaded = baseBytes + file.bytes;
    return;
  }

  const part = `${target}.part`;
  await unlink(part).catch(() => undefined);
  const response = await fetch(`${BASE_URL}/${file.source}`, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`模型下载失败（${response.status}）`);
  }

  let received = 0;
  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  body.on("data", (chunk: Buffer) => {
    received += chunk.length;
    download.downloaded = Math.min(TOTAL_BYTES, baseBytes + received);
  });

  await pipeline(body, createWriteStream(part));
  const size = await fileBytes(part);
  if (size < file.bytes * 0.98) {
    await unlink(part).catch(() => undefined);
    throw new Error(`模型文件不完整：${file.name}`);
  }
  await rename(part, target);
  download.downloaded = Math.min(TOTAL_BYTES, baseBytes + size);
}

async function runInstall(): Promise<void> {
  await mkdir(MODEL_DIR, { recursive: true });
  download = { active: true, downloaded: 0, total: TOTAL_BYTES, error: null };
  try {
    let base = 0;
    for (const file of MODEL_FILES) {
      await downloadFile(file, base);
      base += file.bytes;
    }
    download = { active: false, downloaded: TOTAL_BYTES, total: TOTAL_BYTES, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "模型下载失败";
    download = { ...download, active: false, error: message };
    throw error;
  }
}

export function installModels(): Promise<void> {
  if (!installPromise) {
    installPromise = runInstall().finally(() => {
      installPromise = null;
    });
  }
  return installPromise;
}

async function getService(): Promise<OcrService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      if (!(await modelsInstalled())) throw new Error("OCR 模型尚未下载");
      const { PaddleOcrService } = await import("ppu-paddle-ocr");
      const service = new PaddleOcrService({
        model: {
          detection: path.join(MODEL_DIR, "det.onnx"),
          recognition: path.join(MODEL_DIR, "rec.onnx"),
          charactersDictionary: path.join(MODEL_DIR, "dict.txt"),
        },
      });
      await service.initialize();
      return service;
    })().catch((error) => {
      servicePromise = null;
      throw error;
    });
  }
  return servicePromise;
}

export type OcrLine = {
  text: string;
  confidence: number;
  box: unknown;
};

export async function recognizeImage(
  image: ArrayBuffer,
): Promise<{ text: string; lines: OcrLine[]; ms: number }> {
  const started = performance.now();
  const service = await getService();
  const result = await service.recognize(image);
  const flattened = (result.lines ?? []).flat() as Array<{
    text?: string;
    confidence?: number;
    box?: unknown;
  }>;
  const lines: OcrLine[] = flattened
    .map((line) => ({
      text: (line.text ?? "")
        .replace(/\uFFFD+/g, "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
        .trim(),
      confidence: typeof line.confidence === "number" ? line.confidence : 0,
      box: line.box,
    }))
    .filter((line) => line.text.length > 0)
    .slice(0, 400);
  const text = lines
    .map((line) => line.text)
    .join("\n")
    .slice(0, 20_000);
  return { text, lines, ms: Math.round(performance.now() - started) };
}
