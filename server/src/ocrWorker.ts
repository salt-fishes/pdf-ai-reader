import { parentPort } from "node:worker_threads";

type OcrService = import("ppu-paddle-ocr").PaddleOcrService;

export type OcrLineBox = { x: number; y: number; width: number; height: number };

export type OcrLine = {
  text: string;
  confidence: number;
  box: OcrLineBox;
};

type InitMessage = {
  type: "init";
  modelId: string;
  model: {
    detection: string;
    recognition: string;
    dictionary: string;
  };
};

type RecognizeMessage = {
  type: "recognize";
  id: number;
  image: ArrayBuffer;
};

type Message = InitMessage | RecognizeMessage | { type: "shutdown" };

const port = parentPort;
if (!port) throw new Error("OCR worker must run inside a worker thread");

let servicePromise: Promise<OcrService> | null = null;
let serviceModel = "";
let activeModel: InitMessage["model"] | null = null;
let chain: Promise<void> = Promise.resolve();

function clampBox(value: unknown): OcrLineBox {
  if (!value || typeof value !== "object") return { x: 0, y: 0, width: 0, height: 0 };
  const box = value as Record<string, unknown>;
  const number = (key: string) => {
    const raw = box[key];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  };
  return {
    x: number("x"),
    y: number("y"),
    width: number("width"),
    height: number("height"),
  };
}

async function getService(modelId: string, model: InitMessage["model"]): Promise<OcrService> {
  if (servicePromise && serviceModel === modelId) return servicePromise;
  servicePromise = (async () => {
    const { PaddleOcrService } = await import("ppu-paddle-ocr");
    const service = new PaddleOcrService({
      model: {
        detection: model.detection,
        recognition: model.recognition,
        charactersDictionary: model.dictionary,
      },
    });
    await service.initialize();
    return service;
  })().catch((error) => {
    servicePromise = null;
    throw error;
  });
  serviceModel = modelId;
  return servicePromise;
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\uFFFD+/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
}

async function recognize(
  modelId: string,
  model: InitMessage["model"],
  image: ArrayBuffer,
): Promise<{ text: string; lines: OcrLine[]; ms: number }> {
  const started = performance.now();
  const service = await getService(modelId, model);
  const result = await service.recognize(image);
  const flattened = (result.lines ?? []).flat() as Array<{
    text?: unknown;
    confidence?: unknown;
    box?: unknown;
  }>;
  const lines: OcrLine[] = flattened
    .map((line) => ({
      text: cleanText(line.text),
      confidence: typeof line.confidence === "number" ? line.confidence : 0,
      box: clampBox(line.box),
    }))
    .filter((line) => line.text.length > 0)
    .slice(0, 400);
  const text = lines
    .map((line) => line.text)
    .join("\n")
    .slice(0, 20_000);
  return { text, lines, ms: Math.round(performance.now() - started) };
}

port.on("message", (message: Message) => {
  if (message.type === "init") {
    activeModel = message.model;
    getService(message.modelId, message.model).then(
      () => port.postMessage({ type: "ready", modelId: message.modelId }),
      (error: unknown) =>
        port.postMessage({
          type: "init-error",
          message: error instanceof Error ? error.message : "OCR 初始化失败",
        }),
    );
    return;
  }

  if (message.type === "recognize") {
    // Serialize even though the parent already sends one job at a time; this
    // keeps the ONNX session usage predictable if the protocol changes.
    chain = chain
      .then(async () => {
        if (!activeModel) throw new Error("OCR worker 尚未初始化");
        const result = await recognize(serviceModel, activeModel, message.image);
        port.postMessage({ type: "result", id: message.id, result });
      })
      .catch((error: unknown) => {
        port.postMessage({
          type: "result-error",
          id: message.id,
          message: error instanceof Error ? error.message : "OCR 识别失败",
        });
      });
    return;
  }

  if (message.type === "shutdown") {
    port.close();
  }
});
