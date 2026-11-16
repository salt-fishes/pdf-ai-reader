import { Worker } from "node:worker_threads";
import {
  OCR_MODELS,
  OCR_MODEL_IDS,
  installedBytes,
  installModels as installModelFiles,
  isOcrModelId,
  modelBytes,
  modelDir,
  modelDownloadState,
  modelPaths,
  modelsInstalled,
  type OcrModelId,
} from "./ocrModels";

export type { OcrModelId } from "./ocrModels";
export { OCR_MODELS, OCR_MODEL_IDS, isOcrModelId } from "./ocrModels";

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

type Job = {
  id: number;
  image: ArrayBuffer;
  priority: number;
  resolve: (result: OcrResult) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
};

type WorkerMessage =
  | { type: "ready"; modelId: string }
  | { type: "init-error"; message: string }
  | { type: "result"; id: number; result: OcrResult }
  | { type: "result-error"; id: number; message: string };

const envModel = process.env.OCR_MODEL?.trim();
let activeModel: OcrModelId = isOcrModelId(envModel) ? envModel : "v6-tiny";
let worker: Worker | null = null;
let workerModel: OcrModelId | null = null;
let workerReady = false;
let workerError: string | null = null;
let bootPromise: Promise<void> | null = null;
let running: Job | null = null;
let sequence = 0;
let shuttingDown = false;
const queue: Job[] = [];

function isTsSource(): boolean {
  return import.meta.url.endsWith(".ts") || import.meta.url.endsWith(".tsx");
}

function workerUrl(): URL {
  return new URL(isTsSource() ? "./ocrWorker.ts" : "./ocr-worker.mjs", import.meta.url);
}

function workerExecArgv(): string[] {
  // In development the server runs through tsx; the worker needs the same
  // loader to import the TypeScript entry. Bundled builds use plain .mjs.
  return isTsSource() ? ["--import", "tsx"] : [];
}

function failJob(job: Job, message: string): void {
  job.reject(new Error(message));
}

function resetWorker(message: string, rejectPending = true): void {
  const current = worker;
  worker = null;
  workerModel = null;
  workerReady = false;
  bootPromise = null;
  if (current) {
    current.removeAllListeners();
    void current.terminate().catch(() => undefined);
  }
  if (running) {
    if (rejectPending) failJob(running, message);
    running = null;
  }
  if (rejectPending) {
    while (queue.length) failJob(queue.shift()!, message);
  }
}

function handleMessage(message: WorkerMessage): void {
  if (message.type === "ready") {
    workerReady = true;
    workerError = null;
    bootPromise = null;
    flush();
    return;
  }
  if (message.type === "init-error") {
    workerError = message.message;
    resetWorker(message.message, false);
    return;
  }
  if (message.type === "result") {
    const job = running;
    running = null;
    if (job && job.id === message.id) job.resolve(message.result);
    flush();
    return;
  }
  if (message.type === "result-error") {
    const job = running;
    running = null;
    if (job && job.id === message.id) failJob(job, message.message);
    flush();
  }
}

function startWorker(): Promise<void> {
  if (worker && workerModel === activeModel && workerReady) return Promise.resolve();
  if (bootPromise && workerModel === activeModel) return bootPromise;

  resetWorker("OCR worker 已重启", false);
  const model = activeModel;
  const paths = modelPaths(model);
  workerModel = model;
  workerReady = false;
  workerError = null;

  bootPromise = new Promise<void>((resolve, reject) => {
    const instance = new Worker(workerUrl(), {
      execArgv: workerExecArgv(),
      name: `ocr-${model}`,
    });
    worker = instance;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      workerError = "OCR 初始化超时";
      resetWorker(workerError, false);
      reject(new Error(workerError));
    }, 45_000);

    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        workerError = error.message;
        reject(error);
      } else {
        resolve();
      }
    };

    instance.on("message", (message: WorkerMessage) => {
      if (message.type === "ready") settle();
      if (message.type === "init-error") settle(new Error(message.message));
      handleMessage(message);
    });
    instance.on("error", (error) => {
      workerError = error.message;
      settle(error);
      resetWorker(error.message, true);
    });
    instance.on("exit", (code) => {
      if (shuttingDown) return;
      const message = code === 0 ? "OCR worker 已退出" : `OCR worker 异常退出（${code}）`;
      workerError = message;
      settle(new Error(message));
      resetWorker(message, true);
    });

    instance.postMessage({
      type: "init",
      modelId: model,
      model: {
        detection: paths.detection,
        recognition: paths.recognition,
        dictionary: paths.dictionary,
      },
    });
  }).catch((error) => {
    bootPromise = null;
    throw error;
  });

  return bootPromise;
}

function flush(): void {
  if (!worker || !workerReady || running || queue.length === 0) return;
  queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
  const job = queue.shift()!;
  running = job;
  worker.postMessage({ type: "recognize", id: job.id, image: job.image }, [job.image]);
}

export type OcrPriority = "high" | "normal" | "low";

function priorityValue(priority: OcrPriority | undefined): number {
  if (priority === "high") return 0;
  if (priority === "low") return 2;
  return 1;
}

export async function recognizeImage(
  image: ArrayBuffer,
  options: { priority?: OcrPriority; signal?: AbortSignal } = {},
): Promise<OcrResult> {
  if (!(await modelsInstalled(activeModel))) {
    throw new Error("OCR 模型尚未下载");
  }
  if (options.signal?.aborted) throw new Error("OCR 请求已取消");

  await startWorker();
  return new Promise<OcrResult>((resolve, reject) => {
    const job: Job = {
      id: ++sequence,
      image,
      priority: priorityValue(options.priority),
      resolve,
      reject,
      signal: options.signal,
    };
    if (job.signal) {
      const onAbort = () => {
        const index = queue.indexOf(job);
        if (index >= 0) {
          queue.splice(index, 1);
          reject(new Error("OCR 请求已取消"));
        }
      };
      job.signal.addEventListener("abort", onAbort, { once: true });
      const originalResolve = job.resolve;
      job.resolve = (result) => {
        job.signal?.removeEventListener("abort", onAbort);
        originalResolve(result);
      };
      const originalReject = job.reject;
      job.reject = (error) => {
        job.signal?.removeEventListener("abort", onAbort);
        originalReject(error);
      };
    }
    queue.push(job);
    flush();
  });
}

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
  activeModel: OcrModelId;
  availableModels: OcrModelInfo[];
  installedModels: OcrModelId[];
  error: string | null;
  dir: string;
  busy: boolean;
  queued: number;
};

export async function ocrStatus(): Promise<OcrStatus> {
  const download = modelDownloadState(activeModel);
  const installed = await modelsInstalled(activeModel);
  const total = installed ? modelBytes(activeModel) : modelBytes(activeModel);
  const downloaded = installed ? total : await installedBytes(activeModel);
  const availableModels: OcrModelInfo[] = [];
  const installedModels: OcrModelId[] = [];

  for (const id of OCR_MODEL_IDS) {
    const state = modelDownloadState(id);
    const isInstalled = await modelsInstalled(id);
    if (isInstalled) installedModels.push(id);
    const bytes = isInstalled ? modelBytes(id) : await installedBytes(id);
    availableModels.push({
      id,
      label: OCR_MODELS[id].label,
      speed: OCR_MODELS[id].speed,
      note: OCR_MODELS[id].note,
      approxBytes: OCR_MODELS[id].approxBytes,
      installed: isInstalled,
      downloading: state.active,
      progress: modelBytes(id) ? Math.min(1, bytes / modelBytes(id)) : 0,
    });
  }

  return {
    installed,
    ready: Boolean(worker && workerModel === activeModel && workerReady),
    downloading: download.active,
    downloaded: download.active ? download.downloaded : downloaded,
    total: download.active ? download.total : total,
    progress: download.active
      ? download.total
        ? Math.min(1, download.downloaded / download.total)
        : 0
      : installed
        ? 1
        : total
          ? Math.min(1, downloaded / total)
          : 0,
    model: OCR_MODELS[activeModel].label,
    activeModel,
    availableModels,
    installedModels,
    error: download.error ?? workerError,
    dir: modelDir(activeModel),
    busy: running !== null,
    queued: queue.length,
  };
}

export function activeOcrModel(): OcrModelId {
  return activeModel;
}

export async function setActiveOcrModel(model: OcrModelId): Promise<OcrStatus> {
  if (model !== activeModel) {
    activeModel = model;
    resetWorker("OCR 模型已切换");
    workerError = null;
  }
  return ocrStatus();
}

export function installModels(model: OcrModelId = activeModel): Promise<void> {
  return installModelFiles(model);
}

export async function shutdownOcr(): Promise<void> {
  shuttingDown = true;
  resetWorker("OCR 服务已关闭");
  shuttingDown = false;
}
