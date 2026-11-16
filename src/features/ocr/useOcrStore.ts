import { create } from "zustand";
import {
  getActiveDocument,
  getNativePageText,
  renderPageImageBlob,
  setPageText,
} from "../../lib/pdf/pdf";
import {
  fetchOcrStatus,
  recognizeImageBytes,
  setOcrModel,
  startOcrInstall,
  type OcrModelId,
  type OcrPriority,
  type OcrStatus,
} from "../../lib/ocr/client";
import {
  loadOcrPage,
  loadSettings,
  saveOcrPage,
  saveSettings,
  type OcrPageRecord,
} from "../../lib/storage/db";
import { useViewer } from "../viewer/useViewerStore";

export type OcrPageData = OcrPageRecord;

export type OcrPhase = "idle" | "preparing" | "recognizing" | "error";

type QueueItem = { page: number; priority: OcrPriority };

type OcrState = {
  docHash: string;
  status: OcrStatus | null;
  pages: Record<number, OcrPageData>;
  queue: QueueItem[];
  running: number | null;
  phase: OcrPhase;
  error: string | null;
  enabled: boolean;
  textVersion: number;
  installing: boolean;
  lastCompleted: number | null;

  init: () => Promise<void>;
  reset: (hash: string) => void;
  refreshStatus: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  observe: (page: number, priority?: OcrPriority) => void;
  ensurePage: (page: number, priority?: OcrPriority) => Promise<void>;
  ensurePages: (pages: number[], priority?: OcrPriority) => void;
  hydrate: (page: number) => Promise<void>;
  hydratePages: (pages: number[]) => Promise<void>;
  install: (model?: OcrModelId) => Promise<void>;
  setModel: (model: OcrModelId) => Promise<void>;
  cancelPending: () => void;
  bumpTextVersion: () => void;
};

const SCANNED_CHARS = 20;
const settings = loadSettings();

function isScannedText(text: string): boolean {
  return text.replace(/\s+/g, "").length < SCANNED_CHARS;
}

let generation = 0;
let pumping = false;
let installPromise: Promise<void> | null = null;
let failedInstallModel: OcrModelId | null = null;
const hydrating = new Set<number>();

function priorityRank(priority: OcrPriority): number {
  return priority === "high" ? 0 : priority === "low" ? 2 : 1;
}

function currentHash(): string {
  return useViewer.getState().docHash;
}

async function markRecognized(page: number): Promise<void> {
  const { useAssistant } = await import("../assistant/useAssistantStore");
  const assistant = useAssistant.getState();
  assistant.markOcrPage(page);
}

export const useOcr = create<OcrState>((set, get) => {
  const enqueue = (page: number, priority: OcrPriority) => {
    const state = get();
    if (state.running === page) return;
    if (state.queue.some((item) => item.page === page)) return;
    const queue = [...state.queue, { page, priority }].sort(
      (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.page - b.page,
    );
    set({ queue });
    void pump();
  };

  const pump = async (): Promise<void> => {
    if (pumping) return;
    pumping = true;
    const mine = generation;
    try {
      while (get().queue.length) {
        if (mine !== generation || get().docHash !== currentHash()) break;
        const pdf = getActiveDocument();
        if (!pdf) break;

        if (!get().status) {
          try {
            await get().refreshStatus();
          } catch {
            // The install path below will surface a useful error.
          }
        }
        if (!get().status?.installed) {
          set({ phase: "preparing" });
          try {
            await get().install();
          } catch {
            break;
          }
          if (!get().status?.installed) break;
        }

        const queue = [...get().queue].sort(
          (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.page - b.page,
        );
        const job = queue.shift()!;
        set({
          queue,
          running: job.page,
          phase: "recognizing",
          error: null,
        });

        try {
          const image = await renderPageImageBlob(pdf, job.page, 1600);
          if (mine !== generation) break;
          const result = await recognizeImageBytes(image.blob, {
            priority: job.priority,
          });
          if (mine !== generation || get().docHash !== currentHash()) break;
          if (!result.text.trim()) {
            throw new Error("没有识别到文字");
          }

          const width = Math.max(1, image.width);
          const height = Math.max(1, image.height);
          const lines = result.lines
            .map((line) => ({
              text: line.text,
              confidence: line.confidence,
              x: Math.max(0, Math.min(1, line.box.x / width)),
              y: Math.max(0, Math.min(1, line.box.y / height)),
              w: Math.max(0.001, Math.min(1, line.box.width / width)),
              h: Math.max(0.001, Math.min(1, line.box.height / height)),
            }))
            .filter((line) => line.w > 0 && line.h > 0);
          const model = get().status?.activeModel ?? "v6-tiny";
          const hash = get().docHash;
          const record: OcrPageData = {
            hash,
            page: job.page,
            text: result.text,
            lines,
            model,
            imageWidth: width,
            imageHeight: height,
          };

          setPageText(pdf, job.page, result.text);
          void saveOcrPage(record).catch(() => undefined);
          // A summary produced before this page was recognized is stale.
          void import("../../lib/storage/db").then(({ clearSummaryRecord }) =>
            clearSummaryRecord(hash),
          );
          if (mine !== generation) break;
          set((prev) => ({
            pages: { ...prev.pages, [job.page]: record },
            textVersion: prev.textVersion + 1,
            lastCompleted: job.page,
          }));
          void markRecognized(job.page);
        } catch (error) {
          const message = error instanceof Error ? error.message : "OCR 识别失败";
          set({ error: message, phase: "error" });
        } finally {
          if (mine === generation) set({ running: null });
        }
      }
    } finally {
      pumping = false;
      if (get().queue.length && get().status?.installed && !get().error) {
        void pump();
      }
    }
  };

  return {
    docHash: "",
    status: null,
    pages: {},
    queue: [],
    running: null,
    phase: "idle",
    error: null,
    enabled: settings.ocrTextLayer !== false,
    textVersion: 0,
    installing: false,
    lastCompleted: null,

    init: async () => {
      try {
        await get().refreshStatus();
        const saved = loadSettings().ocrModel as OcrModelId | undefined;
        const active = get().status?.activeModel;
        if (saved && active && saved !== active) {
          await get().setModel(saved);
        }
      } catch {
        // The proxy may not be up yet; the next observer retries.
      }
    },

    reset: (hash) => {
      generation += 1;
      pumping = false;
      hydrating.clear();
      set({
        docHash: hash,
        pages: {},
        queue: [],
        running: null,
        phase: "idle",
        error: null,
        textVersion: 0,
        lastCompleted: null,
      });
      void get().refreshStatus();
    },

    refreshStatus: async () => {
      try {
        const status = await fetchOcrStatus();
        set({ status, error: status.error ?? null });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "无法读取 OCR 状态",
        });
      }
    },

    setEnabled: (enabled) => {
      set({ enabled });
      saveSettings({ ocrTextLayer: enabled });
      if (!enabled) get().cancelPending();
    },

    observe: (page, priority = "high") => {
      if (!get().enabled) return;
      if (priority === "high") {
        // The page the reader is looking at now wins over older high-priority
        // pages that were only briefly visible.
        set((state) => ({
          queue: state.queue.filter(
            (item) => item.priority !== "high" || item.page === page,
          ),
        }));
      }
      void get().ensurePage(page, priority);
    },

    ensurePage: async (page, priority = "normal") => {
      const viewer = useViewer.getState();
      const hash = viewer.docHash;
      if (!hash || page < 1 || page > viewer.numPages) return;
      if (get().docHash !== hash) get().reset(hash);
      if (get().pages[page]) return;

      const pdf = getActiveDocument();
      if (!pdf) return;
      try {
        const native = await getNativePageText(pdf, page);
        if (!isScannedText(native)) return;
      } catch {
        return;
      }
      if (get().pages[page] || get().docHash !== hash) return;
      enqueue(page, priority);
    },

    ensurePages: (pages, priority = "low") => {
      if (!get().enabled) return;
      for (const page of pages) void get().ensurePage(page, priority);
    },

    hydrate: async (page) => {
      const hash = currentHash();
      if (!hash || get().pages[page] || hydrating.has(page)) return;
      hydrating.add(page);
      try {
        const record = await loadOcrPage(hash, page);
        if (!record || currentHash() !== hash) return;
        const pdf = getActiveDocument();
        if (pdf) setPageText(pdf, page, record.text);
        set((prev) => ({
          pages: { ...prev.pages, [page]: record },
          textVersion: prev.textVersion + 1,
        }));
      } finally {
        hydrating.delete(page);
      }
    },

    hydratePages: async (pages) => {
      const hash = currentHash();
      if (!hash) return;
      let changed = false;
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        if (get().pages[page]) continue;
        const record = await loadOcrPage(hash, page);
        if (!record || currentHash() !== hash) continue;
        const pdf = getActiveDocument();
        if (pdf) setPageText(pdf, page, record.text);
        set((prev) => ({ pages: { ...prev.pages, [page]: record } }));
        changed = true;
      }
      if (changed) set((prev) => ({ textVersion: prev.textVersion + 1 }));
    },

    install: async (model) => {
      if (installPromise) return installPromise;
      const target = model ?? get().status?.activeModel ?? "v6-tiny";
      if (failedInstallModel === target && !model) {
        throw new Error("OCR 模型下载失败，请在设置中重试");
      }
      installPromise = (async () => {
        set({ installing: true, phase: "preparing", error: null });
        try {
          await startOcrInstall(target);
          const deadline = Date.now() + 8 * 60 * 1000;
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            const status = await fetchOcrStatus();
            set({ status, error: status.error ?? null });
            if (status.error) {
              failedInstallModel = target;
              throw new Error(status.error);
            }
            if (status.installed) {
              failedInstallModel = null;
              set({ phase: "idle" });
              return;
            }
          }
          failedInstallModel = target;
          throw new Error("模型下载超时");
        } catch (error) {
          const message = error instanceof Error ? error.message : "模型下载失败";
          set({ phase: "error", error: message });
          throw error;
        } finally {
          set({ installing: false });
          installPromise = null;
          if (get().status?.installed && get().queue.length) void pump();
        }
      })();
      return installPromise;
    },

    setModel: async (model) => {
      const status = await setOcrModel(model);
      saveSettings({ ocrModel: model });
      failedInstallModel = null;
      set({ status, error: status.error ?? null });
      if (status.installed && get().queue.length) void pump();
    },

    cancelPending: () => set({ queue: [] }),

    bumpTextVersion: () => set((prev) => ({ textVersion: prev.textVersion + 1 })),
  };
});
