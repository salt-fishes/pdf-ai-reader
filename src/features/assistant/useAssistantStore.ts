import { create } from "zustand";
import { buildRequest } from "../../lib/ai/prompt";
import { trimHistory } from "../../lib/ai/history";
import { describeError, fetchConfig, streamChat } from "../../lib/ai/client";
import {
  SUMMARY_CHUNK_CHARS,
  SUMMARY_DIRECT_CHARS,
  SUMMARY_FINAL_SYSTEM,
  SUMMARY_MAP_SYSTEM,
  SUMMARY_REDUCE_CHARS,
  joinSectionSummaries,
  reduceBatches,
  summaryDirectQuestion,
  summaryFinalQuestion,
  summaryMapQuestion,
} from "../../lib/ai/summary";
import type { AiError, ApiMessage, Attachment, ChatMessage, ChatSession, ContextState, Quote, Screenshot, Selection, ServerConfig, ThinkingEffort } from "../../lib/ai/types";
import {
  DEFAULT_PRICING,
  EMPTY_USAGE,
  addUsage,
  envelopeHash,
  estimateSurface,
  projectTokens,
  usageFromProvider,
  type Anchor,
  type Pricing,
  type UsageBuckets,
} from "../../lib/tokens/meter";
import {
  cropImageDataUrl,
  extractPdfText,
  getActiveDocument,
  getPageText,
  getPagesText,
  renderPageImage,
  setPageText,
} from "../../lib/pdf/pdf";
import { parsePageRange } from "../../lib/pdf/range";
import type { RegionRect } from "../viewer/region";
import {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  fileKind,
  formatBytes,
  readImageFile,
  readTextFile,
} from "../../lib/files";
import { clearSummaryRecord, loadChatRecord, loadOcrRecord, loadSettings, loadSummaryRecord, saveChatRecord, saveOcrRecord, saveSettings, saveSummaryRecord, type SummaryRecord } from "../../lib/storage/db";import { SYSTEM_PROMPT } from "../../lib/ai/prompt";
import { selectSmartContext } from "../../lib/ai/smart";
import {
  fetchOcrStatus,
  recognizeImage,
  startOcrInstall,
  type OcrStatus,
} from "../../lib/ocr/client";
import { useViewer } from "../viewer/useViewerStore";
import { useOcr } from "../ocr/useOcrStore";

export type AssistantStatus = "open" | "minimized" | "closed";

export type AssistantMode = "float" | "sidebar";

export type PanelRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  docked: boolean;
  manual?: boolean;
};

export type Toast = { id: number; text: string; tone: "info" | "error" | "success" };

export type SummaryProgress = {
  stage: "reading" | "mapping" | "reducing" | "writing";
  done: number;
  total: number;
};

type AssistantState = {
  status: AssistantStatus;
  mode: AssistantMode;
  origin: { x: number; y: number; width: number; height: number } | null;
  config: ServerConfig | null;
  configError: string | null;
  model: string;
  models: string[];
  thinking: ThinkingEffort;
  contextBudget: number;
  historyLimit: number;
  pricing: Pricing;

  messages: ChatMessage[];
  sessions: ChatSession[];
  activeSessionId: string;
  /** Document these messages belong to; survives a viewer doc switch. */
  boundDocHash: string;
  context: ContextState;
  draft: string;
  streamingId: string | null;
  anchor: Anchor | null;
  usage: UsageBuckets | null;
  surface: number;
  projected: number;
  budget: number;
  error: AiError | null;
  sendError: string | null;
  loadingChat: boolean;

  autoCurrentPage: boolean;
  capturingPage: number | null;
  attaching: boolean;
  filtering: { done: number; total: number } | null;
  allPagesBusy: boolean;
  contextCollapseAt: number;
  summary: SummaryProgress | null;
  ocrStatus: OcrStatus | null;
  ocrBusyPage: number | null;
  ocrInstalling: boolean;
  ocrDialogOpen: boolean;
  ocrPendingPage: number | null;
  ocrError: string | null;
  focusInputAt: number;
  panel: PanelRect;
  panelPreviewWidth: number | null;
  boostContext: boolean;
  boostAnswer: boolean;
  clearConfirm: boolean;
  toast: Toast | null;
  scannedPages: number[];

  bootstrap: () => Promise<void>;
  refreshConfig: () => Promise<ServerConfig | null>;
  setMode: (mode: AssistantMode) => void;
  openFrom: (element: HTMLElement | null) => void;
  minimize: () => void;
  close: () => void;
  setModel: (model: string) => void;
  setThinking: (thinking: ThinkingEffort) => void;
  setContextBudget: (tokens: number) => void;
  setHistoryLimit: (limit: number) => void;
  setPricing: (pricing: Pricing) => void;
  setDraft: (draft: string) => void;
  setPanel: (rect: PanelRect) => void;
  setPanelPreviewWidth: (width: number | null) => void;
  setBoostContext: (boost: boolean) => void;
  setBoostAnswer: (boost: boolean) => void;
  setClearConfirm: (open: boolean) => void;
  notify: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: () => void;

  syncCurrentPage: (page: number) => Promise<void>;
  addCurrentPage: () => Promise<void>;
  removeCurrentPage: () => void;
  addPageRange: (input: string) => Promise<{ ok: boolean; message?: string }>;
  setPageRange: (pages: number[]) => Promise<void>;
  addAllPages: () => Promise<void>;
  removePageRange: () => void;
  smartFilter: () => Promise<void>;
  removeSmartFilter: () => void;
  addSelection: (
    page: number,
    text: string,
    pages?: Array<{ page: number; text: string; source?: "ocr" | "mixed" }>,
    source?: "ocr" | "mixed",
  ) => void;
  removeSelection: () => void;
  markOcrPage: (page: number) => void;
  refreshOcrStatus: () => Promise<void>;
  openOcrDialog: (page?: number) => void;
  closeOcrDialog: () => void;
  installOcr: () => Promise<void>;
  recognizePage: (page: number) => Promise<void>;
  capturePage: (page: number) => Promise<void>;
  startRegionCapture: (page: number) => void;
  captureRegion: (page: number, rect: RegionRect) => Promise<void>;
  removeScreenshot: (id: string) => void;
  addAttachment: (file: File) => Promise<{ ok: boolean; message?: string }>;
  removeAttachment: (id: string) => void;
  toggleQuote: (message: ChatMessage) => void;
  removeQuote: (messageId: string) => void;
  isQuoted: (messageId: string) => boolean;
  toggleExclude: (messageId: string) => void;

  loadForDoc: (hash: string) => Promise<void>;
  newSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  send: (question: string) => Promise<void>;
  summarizeDocument: () => Promise<void>;
  stopSummary: () => void;
  stop: () => void;
  retry: (messageId: string) => Promise<void>;
  clearAll: () => void;
  refreshEstimate: () => void;
};

const settings = loadSettings();
const initialSession = createSession(settings.model ?? "deepseek-flash");
const MAX_CONTEXT_BUDGET = 1_000_000;
const DEFAULT_CONTEXT_BUDGET = 1_000_000;
const DEFAULT_HISTORY_LIMIT = 20;
const initialPricing: Pricing = { ...DEFAULT_PRICING, ...(settings.pricing ?? {}) };
const initialBudget =
  settings.contextBudget && settings.contextBudget > 32_000
    ? Math.min(MAX_CONTEXT_BUDGET, settings.contextBudget)
    : DEFAULT_CONTEXT_BUDGET;
let streamAbort: AbortController | null = null;
let summaryAbort: AbortController | null = null;
let pageToken = 0;

type ForegroundRun = {
  id: number;
  kind: "chat" | "summary";
  epoch: number;
  hash: string;
  controller: AbortController;
};

let docEpoch = 0;
let runSequence = 0;
let foregroundRun: ForegroundRun | null = null;

function beginForeground(
  kind: ForegroundRun["kind"],
  hash: string,
  controller: AbortController,
): ForegroundRun | null {
  if (foregroundRun) return null;
  foregroundRun = {
    id: ++runSequence,
    kind,
    epoch: docEpoch,
    hash,
    controller,
  };
  return foregroundRun;
}

function isForegroundCurrent(run: ForegroundRun): boolean {
  return foregroundRun?.id === run.id && run.epoch === docEpoch;
}

function endForeground(run: ForegroundRun): void {
  if (foregroundRun?.id === run.id) foregroundRun = null;
}
let filterToken = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const EMPTY_CONTEXT: ContextState = {
  currentPage: null,
  currentPageText: "",
  pageRange: null,
  pageRangeText: "",
  selection: null,
  screenshots: [],
  attachments: [],
  quotes: [],
  smart: null,
};

function createSession(model: string, title = "新对话"): ChatSession {
  const now = Date.now();
  return {
    id: `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    model,
    anchor: null,
  };
}

function titleFromQuestion(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "新对话";
  return clean.length > 18 ? `${clean.slice(0, 18)}…` : clean;
}

function titleFromMessages(messages: ChatMessage[]): string {
  const first = messages.find((message) => message.role === "user" && message.content.trim());
  return first ? titleFromQuestion(first.content) : "新对话";
}

function normalizeStoredMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ChatMessage[]).map((message) =>
    message.status === "streaming" ? { ...message, status: "stopped" as const } : message,
  );
}

function defaultPanel(): PanelRect {
  const width = Math.min(360, window.innerWidth - 32);
  const height = Math.min(360, window.innerHeight - 140);
  return {
    left: Math.max(16, window.innerWidth - 24 - width),
    top: Math.max(64, window.innerHeight - 92 - height),
    width,
    height,
    docked: false,
  };
}

function clampPanel(rect: PanelRect): PanelRect {
  const width = Math.min(Math.max(320, rect.width), Math.max(320, window.innerWidth - 16));
  const height = Math.min(Math.max(280, rect.height), Math.max(280, window.innerHeight - 16));
  return {
    width,
    height,
    left: Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - width - 8)),
    top: Math.min(Math.max(rect.top, 8), Math.max(8, window.innerHeight - height - 8)),
    docked: rect.docked,
  };
}

function contextCount(context: ContextState, autoCurrentPage: boolean): number {
  let count = 0;
  if (autoCurrentPage && context.currentPage) count += 1;
  if (context.pageRange) count += 1;
  if (context.smart) count += 1;
  if (context.selection) count += 1;
  count += context.screenshots.length;
  count += context.attachments.length;
  count += context.quotes.length;
  return count;
}

function currentHash(model: string, host: string): string {
  return envelopeHash([model, host, SYSTEM_PROMPT]);
}

function surfaceOf(state: AssistantState): {
  surface: number;
  projected: number;
  hash: string;
} {
  const viewer = useViewer.getState();
  if (!viewer.docHash || !state.model) return { surface: 0, projected: 0, hash: "" };
  const question = state.draft.trim() || "（等待输入）";
  const history = trimHistory(state.messages, state.historyLimit);
  const request = buildRequest({
    docName: viewer.docName,
    totalPages: viewer.numPages,
    context: state.context,
    history: history.messages,
    historyOmitted: history.omitted,
    question,
  });
  const surface = estimateSurface({
    system: request.system,
    context: request.context,
    history: request.historyText,
    question: request.question,
    imageCount: request.imageCount,
  });
  const hash = currentHash(state.model, state.config?.baseUrlHost ?? "");
  return { surface, projected: projectTokens(state.anchor, surface, hash), hash };
}

function messageNote(context: ContextState): string | undefined {
  const notes: string[] = [];
  if (context.selection?.source) {
    notes.push("选中文字包含 OCR 识别内容");
  }
  if (context.smart) {
    notes.push(`智能筛选：${context.smart.chunks} 段 / ${context.smart.pages.length} 页`);
  }
  if (context.screenshots.length) {
    notes.push(
      `附图：${context.screenshots
        .map((shot) => `第 ${shot.page} 页${shot.kind === "region" ? "框选" : ""}截图`)
        .join("、")}`,
    );
  }
  const images = context.attachments.filter((a) => a.kind === "image");
  if (images.length) notes.push(`附图：${images.map((a) => a.name).join("、")}`);
  return notes.length ? notes.join("；") : undefined;
}

function chatRecordFrom(state: AssistantState) {
  const hash = state.boundDocHash;
  if (!hash) return null;
  const activeMessages = state.messages.filter((message) => message.status !== "streaming");
  const sessions = state.sessions.map((session) =>
    session.id === state.activeSessionId
      ? { ...session, messages: activeMessages }
      : session,
  );
  return {
    hash,
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages,
      model: session.model,
      anchor: session.anchor,
    })),
    activeId: state.activeSessionId,
  };
}

function saveChatNow(state: AssistantState): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const record = chatRecordFrom(state);
  if (record) void saveChatRecord(record);
}

function persistChat(state: AssistantState): void {
  if (!state.boundDocHash) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const record = chatRecordFrom(state);
    if (record) void saveChatRecord(record);
  }, 300);
}

export const useAssistant = create<AssistantState>((set, get) => {
  const recalc = () => {
    const { surface, projected } = surfaceOf(get());
    set({ surface, projected });
  };

  const patchMessage = (id: string, patch: Partial<ChatMessage>) => {
    set((state) => {
      const messages = state.messages.map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      );
      return {
        messages,
        sessions: state.sessions.map((session) =>
          session.id === state.activeSessionId
            ? { ...session, messages, updatedAt: Date.now() }
            : session,
        ),
      };
    });
  };

  return {
    status: settings.assistantStatus ?? "minimized",
    mode: settings.assistantMode ?? "float",
    origin: null,
    config: null,
    configError: null,
    model: settings.model ?? "deepseek-flash",
    models: [settings.model ?? "deepseek-flash"],
    thinking: settings.thinking ?? "high",
    contextBudget: initialBudget,
    historyLimit: settings.historyLimit ?? DEFAULT_HISTORY_LIMIT,
    pricing: initialPricing,

    messages: [],
    sessions: [initialSession],
    activeSessionId: initialSession.id,
    boundDocHash: "",
    context: { ...EMPTY_CONTEXT },
    draft: "",
    streamingId: null,
    anchor: null,
    usage: null,
    surface: 0,
    projected: 0,
    budget: initialBudget,
    error: null,
    sendError: null,
    loadingChat: false,

    autoCurrentPage: true,
    capturingPage: null,
    attaching: false,
    filtering: null,
    allPagesBusy: false,
    contextCollapseAt: 0,
    summary: null,
    ocrStatus: null,
    ocrBusyPage: null,
    ocrInstalling: false,
    ocrDialogOpen: false,
    ocrPendingPage: null,
    ocrError: null,
    focusInputAt: 0,
    panel: clampPanel(settings.panel ?? defaultPanel()),
    panelPreviewWidth: null,
    boostContext: false,
    boostAnswer: false,
    clearConfirm: false,
    toast: null,
    scannedPages: [],

    bootstrap: async () => {
      try {
        const config = await fetchConfig();
        const model = settings.model && config.models.includes(settings.model)
          ? settings.model
          : config.model;
        const budget = Math.min(
          MAX_CONTEXT_BUDGET,
          settings.contextBudget && settings.contextBudget > 32_000
            ? settings.contextBudget
            : config.contextWindow ?? DEFAULT_CONTEXT_BUDGET,
        );
        set({
          config,
          model,
          models: config.models,
          budget,
          contextBudget: budget,
          configError: null,
        });
        if (budget !== settings.contextBudget) saveSettings({ contextBudget: budget });
        get().refreshEstimate();
      } catch (error) {
        set({
          configError: error instanceof Error ? error.message : "无法连接本地代理",
        });
      }
    },

    refreshConfig: async () => {
      try {
        const config = await fetchConfig();
        const model = config.models.includes(get().model) ? get().model : config.model;
        set({ config, model, models: config.models, configError: null });
        get().refreshEstimate();
        return config;
      } catch (error) {
        set({
          configError: error instanceof Error ? error.message : "无法连接本地代理",
        });
        return null;
      }
    },

    setMode: (mode) => {
      set({ mode, panelPreviewWidth: null });
      saveSettings({ assistantMode: mode });
      if (mode === "float") {
        const rect = clampPanel(get().panel);
        set({ panel: rect });
        saveSettings({ panel: rect });
      }
    },

    openFrom: (element) => {
      const rect = element?.getBoundingClientRect();
      const origin = rect
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : null;
      if (get().status === "open") {
        set({ focusInputAt: Date.now(), origin });
        return;
      }
      set({ status: "open", origin, toast: null, focusInputAt: Date.now() });
      saveSettings({ assistantStatus: "minimized" });
    },

    minimize: () => {
      set({
        status: "minimized",
        clearConfirm: false,
        boostContext: false,
        boostAnswer: false,
        panelPreviewWidth: null,
      });
      saveSettings({ assistantStatus: "minimized" });
    },

    close: () => {
      set({
        status: "closed",
        clearConfirm: false,
        boostContext: false,
        boostAnswer: false,
        panelPreviewWidth: null,
      });
      saveSettings({ assistantStatus: "closed" });
    },

    setModel: (model) => {
      set((state) => ({
        model,
        anchor: null,
        usage: null,
        sessions: state.sessions.map((session) =>
          session.id === state.activeSessionId ? { ...session, model, anchor: null } : session,
        ),
      }));
      saveSettings({ model });
      recalc();
    },

    setThinking: (thinking) => {
      set({ thinking });
      saveSettings({ thinking });
    },

    setContextBudget: (tokens) => {
      const budget = Math.min(
        MAX_CONTEXT_BUDGET,
        Math.max(8_000, Math.round(tokens / 1000) * 1000),
      );
      set({ budget, contextBudget: budget });
      saveSettings({ contextBudget: budget });
      recalc();
    },

    setHistoryLimit: (limit) => {
      const historyLimit = Math.min(200, Math.max(0, Math.round(limit)));
      set({ historyLimit });
      saveSettings({ historyLimit });
      recalc();
    },

    setPricing: (pricing) => {
      const clean = {
        inputMiss: Math.max(0, Number(pricing.inputMiss) || 0),
        inputHit: Math.max(0, Number(pricing.inputHit) || 0),
        output: Math.max(0, Number(pricing.output) || 0),
      };
      set({ pricing: clean });
      saveSettings({ pricing: clean });
    },

    setDraft: (draft) => {
      set({ draft });
      recalc();
    },

    setPanel: (panel) => {
      const clamped = clampPanel(panel);
      set({ panel: clamped });
      saveSettings({ panel: clamped });
    },

    setPanelPreviewWidth: (width) => set({ panelPreviewWidth: width }),

    setBoostContext: (boost) => set({ boostContext: boost }),
    setBoostAnswer: (boost) => set({ boostAnswer: boost }),

    setClearConfirm: (open) => set({ clearConfirm: open }),

    notify: (text, tone = "info") => {
      if (toastTimer) clearTimeout(toastTimer);
      const toast: Toast = { id: Date.now(), text, tone };
      set({ toast });
      toastTimer = setTimeout(() => set({ toast: null }), 2600);
    },

    dismissToast: () => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: null });
    },

    syncCurrentPage: async (page) => {
      const state = get();
      if (!state.autoCurrentPage) return;
      const pdf = getActiveDocument();
      if (!pdf) return;
      const mine = ++pageToken;
      try {
        await useOcr.getState().hydrate(page);
        const text = await getPageText(pdf, page);
        if (mine !== pageToken || !get().autoCurrentPage) return;
        const scanned = text.length < 20 ? [page] : [];
        set((prev) => ({
          context: { ...prev.context, currentPage: page, currentPageText: text },
          scannedPages: scanned,
        }));
        recalc();
      } catch {
        // A page may fail text extraction; keep the previous snapshot.
      }
    },

    addCurrentPage: async () => {
      const viewer = useViewer.getState();
      set({
        autoCurrentPage: true,
        context: { ...get().context, currentPage: viewer.currentPage },
      });
      await get().syncCurrentPage(viewer.currentPage);
    },

    removeCurrentPage: () => {
      pageToken += 1;
      set((state) => ({
        autoCurrentPage: false,
        context: { ...state.context, currentPage: null, currentPageText: "" },
      }));
      recalc();
    },

    addPageRange: async (input) => {
      const viewer = useViewer.getState();
      const pages = parsePageRange(input, viewer.numPages);
      if (!pages) {
        return { ok: false, message: `页码不合法（1–${viewer.numPages}）` };
      }
      const pdf = getActiveDocument();
      if (!pdf) return { ok: false, message: "请先打开 PDF" };
      await useOcr.getState().hydratePages(pages);
      const result = await getPagesText(pdf, pages);
      set((state) => ({
        autoCurrentPage: false,
        context: {
          ...state.context,
          currentPage: null,
          currentPageText: "",
          pageRange: pages,
          pageRangeText: result.text,
          smart: null,
        },
      }));
      recalc();
      return { ok: true };
    },

    setPageRange: async (pages) => {
      const pdf = getActiveDocument();
      if (!pdf || pages.length === 0) return;
      await useOcr.getState().hydratePages(pages);
      const result = await getPagesText(pdf, pages);
      set((state) => ({
        autoCurrentPage: false,
        context: {
          ...state.context,
          currentPage: null,
          currentPageText: "",
          pageRange: pages,
          pageRangeText: result.text,
          smart: null,
        },
      }));
      recalc();
    },

    addAllPages: async () => {
      const viewer = useViewer.getState();
      if (!viewer.numPages) {
        get().notify("请先打开 PDF", "error");
        return;
      }
      if (get().allPagesBusy) return;
      set({ allPagesBusy: true });
      try {
        const pages = Array.from({ length: viewer.numPages }, (_, index) => index + 1);
        await get().setPageRange(pages);
        get().notify(`已加入全文 ${viewer.numPages} 页`, "success");
      } finally {
        set({ allPagesBusy: false });
      }
    },

    removePageRange: () => {
      set((state) => ({
        context: { ...state.context, pageRange: null, pageRangeText: "" },
      }));
      void get().addCurrentPage();
      recalc();
    },

    smartFilter: async () => {
      const state = get();
      if (state.filtering || state.streamingId) return;
      const query = state.draft.trim();
      if (!query) {
        get().notify("先在输入框写下问题，再筛全文", "error");
        return;
      }
      const pdf = getActiveDocument();
      const viewer = useViewer.getState();
      if (!pdf || !viewer.numPages) {
        get().notify("请先打开 PDF", "error");
        return;
      }

      const limit = 400;
      const total = viewer.numPages;
      const scan = Math.min(total, limit);
      const mine = ++filterToken;
      set({ filtering: { done: 0, total: scan }, sendError: null });

      try {
        const pages: Array<{ page: number; text: string }> = [];
        await useOcr
          .getState()
          .hydratePages(Array.from({ length: scan }, (_, index) => index + 1));
        for (let page = 1; page <= scan; page += 1) {
          pages.push({ page, text: await getPageText(pdf, page) });
          if (page % 8 === 0 || page === scan) {
            set({ filtering: { done: page, total: scan } });
            // Let React paint the progress before the next extraction block.
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }

        const result = selectSmartContext(pages, query, { totalPages: total });
        if (mine !== filterToken) return;
        if (!result) {
          get().notify("没有找到相关段落，换成更具体的关键词试试", "error");
          return;
        }

        set((prev) => ({
          context: {
            ...prev.context,
            currentPage: null,
            currentPageText: "",
            pageRange: null,
            pageRangeText: "",
            smart: result,
          },
          autoCurrentPage: false,
          sendError: null,
        }));
        recalc();
        const capped = scan < total ? `（扫描前 ${scan} 页）` : "";
        get().notify(`已从 ${scan} 页中筛选 ${result.chunks} 段${capped}`, "success");
        set({ focusInputAt: Date.now() });
      } catch (error) {
        get().notify(
          error instanceof Error ? `筛选失败：${error.message}` : "筛选失败",
          "error",
        );
      } finally {
        if (mine === filterToken) set({ filtering: null });
      }
    },

    removeSmartFilter: () => {
      set((state) => ({
        context: { ...state.context, smart: null },
        autoCurrentPage: true,
      }));
      const page = useViewer.getState().currentPage;
      if (page) void get().syncCurrentPage(page);
      recalc();
    },

    addSelection: (page, text, pages, source) => {
      const clean = text.trim();
      if (!clean) return;
      const selection: Selection = {
        page,
        text: clean,
        source,
        pages: pages?.length ? pages : undefined,
      };
      set((state) => ({ context: { ...state.context, selection } }));
      get().openFrom(null);
      set({ focusInputAt: Date.now() });
      recalc();
    },

    removeSelection: () => {
      set((state) => ({ context: { ...state.context, selection: null } }));
      recalc();
    },

    markOcrPage: (page) => {
      set((state) => ({
        scannedPages: state.scannedPages.filter((item) => item !== page),
      }));
      if (useViewer.getState().currentPage === page) {
        void get().syncCurrentPage(page);
      } else {
        recalc();
      }
    },

    refreshOcrStatus: async () => {
      try {
        const status = await fetchOcrStatus();
        set({ ocrStatus: status, ocrError: status.error ?? null });
      } catch (error) {
        set({
          ocrError: error instanceof Error ? error.message : "无法读取 OCR 状态",
        });
      }
    },

    openOcrDialog: (page) => {
      set({ ocrDialogOpen: true, ocrPendingPage: page ?? null, ocrError: null });
      void get().refreshOcrStatus();
    },

    closeOcrDialog: () => {
      set({ ocrDialogOpen: false, ocrPendingPage: null, ocrError: null });
    },

    installOcr: async () => {
      const state = get();
      if (state.ocrInstalling) return;
      if (state.ocrStatus?.installed) {
        if (state.ocrPendingPage) await get().recognizePage(state.ocrPendingPage);
        else set({ ocrDialogOpen: false });
        return;
      }
      set({ ocrError: null, ocrInstalling: true });
      try {
        await startOcrInstall();
      } catch (error) {
        set({
          ocrError: error instanceof Error ? error.message : "无法开始下载",
          ocrInstalling: false,
        });
        return;
      }

      try {
        // The proxy downloads in the background; poll it for progress.
        for (let attempt = 0; attempt < 450; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          try {
            const status = await fetchOcrStatus();
            set({ ocrStatus: status, ocrError: status.error ?? null });
            if (status.error) return;
            if (status.installed) break;
          } catch (error) {
            set({
              ocrError: error instanceof Error ? error.message : "无法读取下载进度",
            });
            return;
          }
        }

        if (get().ocrStatus?.installed) {
          const pending = get().ocrPendingPage;
          if (pending) {
            await get().recognizePage(pending);
          } else {
            set({ ocrDialogOpen: false });
            get().notify("OCR 模型已就绪", "success");
          }
        }
      } finally {
        set({ ocrInstalling: false });
      }
    },

    recognizePage: async (page) => {
      const state = get();
      if (!state.ocrStatus?.installed) {
        get().openOcrDialog(page);
        return;
      }
      if (state.ocrBusyPage) return;
      const pdf = getActiveDocument();
      const viewer = useViewer.getState();
      if (!pdf || page < 1 || page > viewer.numPages) return;

      set({ ocrBusyPage: page, ocrError: null });
      try {
        const image = await renderPageImage(pdf, page, 1600);
        const result = await recognizeImage(image.dataUrl);
        if (!result.text.trim()) {
          get().notify("没有识别到文字，试试更清晰的扫描页", "error");
          return;
        }
        setPageText(pdf, page, result.text);
        if (viewer.docHash) {
          const record = await loadOcrRecord(viewer.docHash);
          await saveOcrRecord({
            hash: viewer.docHash,
            pages: { ...(record?.pages ?? {}), [String(page)]: result.text },
          });
          // Cached chunk summaries may have been made before OCR; invalidate
          // them so the next whole-document summary sees the recognized text.
          await clearSummaryRecord(viewer.docHash);
        }
        set((prev) => ({ scannedPages: prev.scannedPages.filter((item) => item !== page) }));
        if (useViewer.getState().currentPage === page) {
          await get().syncCurrentPage(page);
        } else {
          recalc();
        }
        set({ ocrDialogOpen: false, ocrPendingPage: null });
        get().notify(`已识别第 ${page} 页（${result.text.length} 字）`, "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : "OCR 识别失败";
        set({ ocrError: message });
        get().notify(message, "error");
      } finally {
        set({ ocrBusyPage: null });
      }
    },

    capturePage: async (page) => {
      const pdf = getActiveDocument();
      if (!pdf || get().capturingPage) return;
      const imageCount =
        get().context.screenshots.length +
        get().context.attachments.filter((file) => file.kind === "image").length;
      if (imageCount >= 4) {
        get().notify("每轮最多 4 张图片，请先移除一张", "error");
        return;
      }
      set({ capturingPage: page });
      try {
        const image = await renderPageImage(pdf, page);
        const shot: Screenshot = {
          id: `shot_${Date.now().toString(36)}`,
          page,
          dataUrl: image.dataUrl,
          width: image.width,
          height: image.height,
          label: `P${page} 截图`,
          kind: "page",
        };
        set((state) => ({
          context: { ...state.context, screenshots: [...state.context.screenshots, shot] },
          capturingPage: null,
        }));
        recalc();
        get().openFrom(null);
        get().notify(`已截取第 ${page} 页`, "success");
      } catch (error) {
        set({ capturingPage: null });
        get().notify(error instanceof Error ? error.message : "截图失败", "error");
      }
    },

    startRegionCapture: (page) => {
      if (get().streamingId) return;
      const viewer = useViewer.getState();
      if (!viewer.docHash) {
        get().notify("请先打开 PDF", "error");
        return;
      }
      const images =
        get().context.screenshots.length +
        get().context.attachments.filter((file) => file.kind === "image").length;
      if (images >= 4) {
        get().notify("每轮最多 4 张图片，请先移除一张", "error");
        return;
      }
      get().minimize();
      useViewer.getState().startRegion(page);
    },

    captureRegion: async (page, rect) => {
      const pdf = getActiveDocument();
      if (!pdf || get().capturingPage) return;
      const images =
        get().context.screenshots.length +
        get().context.attachments.filter((file) => file.kind === "image").length;
      if (images >= 4) {
        get().notify("每轮最多 4 张图片，请先移除一张", "error");
        return;
      }
      set({ capturingPage: page });
      // Open the panel immediately so the reserved layout width never drops
      // between cancelRegion() and the finished crop.
      const fab = document.querySelector<HTMLElement>("[data-assistant-fab]");
      get().openFrom(fab);
      try {
        const image = await renderPageImage(pdf, page);
        const crop = await cropImageDataUrl(image.dataUrl, rect);
        if (crop.width < 32 || crop.height < 32) {
          set({ capturingPage: null });
          get().notify("选区太小，请重新框选", "error");
          return;
        }
        const shot: Screenshot = {
          id: `shot_${Date.now().toString(36)}`,
          page,
          dataUrl: crop.dataUrl,
          width: crop.width,
          height: crop.height,
          label: `P${page} 框选`,
          kind: "region",
        };
        set((state) => ({
          context: { ...state.context, screenshots: [...state.context.screenshots, shot] },
          capturingPage: null,
        }));
        recalc();
        get().notify(`已截取第 ${page} 页选区`, "success");
      } catch (error) {
        set({ capturingPage: null });
        get().notify(error instanceof Error ? error.message : "框选失败", "error");
      }
    },

    removeScreenshot: (id) => {
      set((state) => ({
        context: {
          ...state.context,
          screenshots: state.context.screenshots.filter((shot) => shot.id !== id),
        },
      }));
      recalc();
    },

    addAttachment: async (file) => {
      const state = get();
      if (state.context.attachments.length >= MAX_ATTACHMENTS) {
        return { ok: false, message: `最多 ${MAX_ATTACHMENTS} 个附件` };
      }
      if (file.size > MAX_FILE_BYTES) {
        return { ok: false, message: `文件超过 ${formatBytes(MAX_FILE_BYTES)}` };
      }
      const kind = fileKind(file);
      if (!kind) {
        return { ok: false, message: "仅支持 PDF、图片、TXT/MD/CSV/JSON" };
      }

      set({ attaching: true });
      try {
        const id = `att_${Date.now().toString(36)}`;
        let attachment: Attachment;
        if (kind === "pdf") {
          const bytes = await file.arrayBuffer();
          const extracted = await extractPdfText(bytes, 40);
          attachment = {
            id,
            name: file.name,
            mime: file.type || "application/pdf",
            size: file.size,
            text: extracted.text,
            pages: extracted.pages,
            chars: extracted.chars,
            kind,
          };
          if (extracted.truncated) {
            get().notify(`附件较长，仅解析前 40 页（共 ${extracted.pages} 页）`, "info");
          }
        } else if (kind === "image") {
          const imageCount =
            get().context.screenshots.length +
            get().context.attachments.filter((item) => item.kind === "image").length;
          if (imageCount >= 4) {
            set({ attaching: false });
            return { ok: false, message: "每轮最多 4 张图片，请先移除一张" };
          }
          const image = await readImageFile(file);
          attachment = {
            id,
            name: file.name,
            mime: file.type || "image/jpeg",
            size: file.size,
            dataUrl: image.dataUrl,
            kind,
          };
        } else {
          const text = await readTextFile(file);
          attachment = {
            id,
            name: file.name,
            mime: file.type || "text/plain",
            size: file.size,
            text,
            chars: text.length,
            kind,
          };
        }
        set((current) => ({
          context: { ...current.context, attachments: [...current.context.attachments, attachment] },
          attaching: false,
        }));
        recalc();
        return { ok: true };
      } catch (error) {
        set({ attaching: false });
        return { ok: false, message: error instanceof Error ? error.message : "附件解析失败" };
      }
    },

    removeAttachment: (id) => {
      set((state) => ({
        context: {
          ...state.context,
          attachments: state.context.attachments.filter((item) => item.id !== id),
        },
      }));
      recalc();
    },

    toggleQuote: (message) => {
      const text = message.content.trim();
      if (!text) return;
      const existing = get().context.quotes.find((quote) => quote.messageId === message.id);
      if (existing) {
        set((state) => ({
          context: {
            ...state.context,
            quotes: state.context.quotes.filter((quote) => quote.messageId !== message.id),
          },
        }));
        recalc();
        return;
      }
      const quote: Quote = {
        id: `q_${message.id}`,
        messageId: message.id,
        role: message.role,
        text: text.length > 1200 ? `${text.slice(0, 1200)}…` : text,
      };
      set((state) => ({ context: { ...state.context, quotes: [...state.context.quotes, quote] } }));
      recalc();
    },

    isQuoted: (messageId) => get().context.quotes.some((quote) => quote.messageId === messageId),

    removeQuote: (messageId) => {
      set((state) => ({
        context: {
          ...state.context,
          quotes: state.context.quotes.filter((quote) => quote.messageId !== messageId),
        },
      }));
      recalc();
    },

    toggleExclude: (messageId) => {
      set((state) => {
        const messages = state.messages.map((message) =>
          message.id === messageId ? { ...message, excluded: !message.excluded } : message,
        );
        return {
          messages,
          sessions: state.sessions.map((session) =>
            session.id === state.activeSessionId
              ? { ...session, messages, updatedAt: Date.now() }
              : session,
          ),
        };
      });
      recalc();
      const message = get().messages.find((item) => item.id === messageId);
      get().notify(message?.excluded ? "已从上下文移除" : "已恢复到上下文");
    },

    loadForDoc: async (hash) => {
      // Finish the outgoing document first so its partial answer is written
      // under its own hash, not under the document we are about to load.
      const outgoing = get();
      if (outgoing.summary) get().stopSummary();
      else if (outgoing.streamingId) get().stop();
      // A run whose state flag was already cleared must still be aborted.
      if (foregroundRun) {
        foregroundRun.controller.abort();
        foregroundRun = null;
      }
      docEpoch += 1;
      streamAbort = null;
      summaryAbort = null;
      set({ loadingChat: true, summary: null, streamingId: null, boundDocHash: hash });
      filterToken += 1;
      try {
        const record = await loadChatRecord(hash);
        const currentModel = get().model;
        let sessions: ChatSession[] = Array.isArray(record?.sessions)
          ? record.sessions.map((session, index) => {
              const messages = normalizeStoredMessages(session.messages);
              return {
                id:
                  typeof session.id === "string" && session.id
                    ? session.id
                    : `s_legacy_${index}_${Date.now().toString(36)}`,
                title:
                  typeof session.title === "string" && session.title.trim()
                    ? session.title
                    : titleFromMessages(messages),
                createdAt:
                  typeof session.createdAt === "number" ? session.createdAt : Date.now(),
                updatedAt:
                  typeof session.updatedAt === "number" ? session.updatedAt : Date.now(),
                messages,
                model:
                  typeof session.model === "string" && session.model
                    ? session.model
                    : currentModel,
                anchor: (session.anchor as Anchor | null) ?? null,
              };
            })
          : [];

        // Migrate a legacy single-session record.
        if (!sessions.length && Array.isArray(record?.messages) && record.messages.length) {
          const messages = normalizeStoredMessages(record.messages);
          const now = Date.now();
          sessions = [
            {
              id: `s_legacy_${now.toString(36)}`,
              title: titleFromMessages(messages),
              createdAt: now,
              updatedAt: now,
              messages,
              model:
                typeof record?.model === "string" && record.model
                  ? record.model
                  : currentModel,
              anchor: (record?.anchor as Anchor | null) ?? null,
            },
          ];
        }

        if (!sessions.length) sessions = [createSession(currentModel)];

        const active =
          sessions.find((session) => session.id === record?.activeId) ?? sessions[0];
        set({
          sessions,
          activeSessionId: active.id,
          messages: active.messages,
          model: active.model,
          anchor: active.anchor,
          usage: active.anchor?.usage ?? null,
          context: { ...EMPTY_CONTEXT },
          autoCurrentPage: true,
          draft: "",
          error: null,
          streamingId: null,
          loadingChat: false,
          filtering: null,
        });
        get().refreshEstimate();
      } catch {
        const fallback = createSession(get().model);
        set({
          sessions: [fallback],
          activeSessionId: fallback.id,
          messages: [],
          boundDocHash: hash,
          context: { ...EMPTY_CONTEXT },
          autoCurrentPage: true,
          streamingId: null,
          loadingChat: false,
          filtering: null,
        });
      }
    },

    newSession: () => {
      const state = get();
      if (state.streamingId) get().stop();
      if (state.summary) get().stopSummary();
      const active = state.sessions.find((session) => session.id === state.activeSessionId);
      if (active && active.messages.length === 0) {
        set({ focusInputAt: Date.now() });
        get().notify("当前已经是新对话");
        return;
      }
      filterToken += 1;
      const session = createSession(state.model);
      set((prev) => ({
        sessions: [...prev.sessions, session],
        activeSessionId: session.id,
        messages: [],
        context: { ...EMPTY_CONTEXT },
        draft: "",
        streamingId: null,
        anchor: null,
        usage: null,
        error: null,
        sendError: null,
        autoCurrentPage: true,
        filtering: null,
        focusInputAt: Date.now(),
      }));
      const page = useViewer.getState().currentPage;
      if (page) void get().syncCurrentPage(page);
      saveChatNow(get());
      get().refreshEstimate();
    },

    switchSession: (id) => {
      const state = get();
      if (id === state.activeSessionId) return;
      const target = state.sessions.find((session) => session.id === id);
      if (!target) return;
      if (state.streamingId) get().stop();
      if (state.summary) get().stopSummary();
      filterToken += 1;
      set({
        activeSessionId: target.id,
        messages: target.messages,
        model: target.model,
        anchor: target.anchor,
        usage: target.anchor?.usage ?? null,
        context: { ...EMPTY_CONTEXT },
        draft: "",
        streamingId: null,
        error: null,
        sendError: null,
        autoCurrentPage: true,
        filtering: null,
        focusInputAt: Date.now(),
      });
      const page = useViewer.getState().currentPage;
      if (page) void get().syncCurrentPage(page);
      saveChatNow(get());
      get().refreshEstimate();
    },

    deleteSession: (id) => {
      const state = get();
      const target = state.sessions.find((session) => session.id === id);
      if (!target) return;
      if (state.streamingId && id === state.activeSessionId) get().stop();
      if (state.summary && id === state.activeSessionId) get().stopSummary();
      filterToken += 1;

      const remaining = state.sessions.filter((session) => session.id !== id);
      if (!remaining.length) {
        const fresh = createSession(state.model);
        set({
          sessions: [fresh],
          activeSessionId: fresh.id,
          messages: [],
          context: { ...EMPTY_CONTEXT },
          draft: "",
          streamingId: null,
          anchor: null,
          usage: null,
          error: null,
          sendError: null,
          autoCurrentPage: true,
          filtering: null,
        });
      } else if (id === state.activeSessionId) {
        const next = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        set({
          sessions: remaining,
          activeSessionId: next.id,
          messages: next.messages,
          model: next.model,
          anchor: next.anchor,
          usage: next.anchor?.usage ?? null,
          context: { ...EMPTY_CONTEXT },
          draft: "",
          streamingId: null,
          error: null,
          sendError: null,
          autoCurrentPage: true,
          filtering: null,
        });
      } else {
        set({ sessions: remaining });
      }

      const page = useViewer.getState().currentPage;
      if (page) void get().syncCurrentPage(page);
      saveChatNow(get());
      get().refreshEstimate();
      get().notify("对话已删除");
    },

    send: async (question) => {
      const text = question.trim();
      const state = get();
      if (!text || state.streamingId || foregroundRun) return;
      const viewer = useViewer.getState();
      if (!viewer.docHash) {
        get().notify("请先打开一个 PDF", "error");
        return;
      }

      const history = trimHistory(state.messages, state.historyLimit);
      const request = buildRequest({
        docName: viewer.docName,
        totalPages: viewer.numPages,
        context: state.context,
        history: history.messages,
        historyOmitted: history.omitted,
        question: text,
      });
      const hash = currentHash(state.model, state.config?.baseUrlHost ?? "");
      const surface = estimateSurface({
        system: request.system,
        context: request.context,
        history: request.historyText,
        question: request.question,
        imageCount: request.imageCount,
      });
      const projected = projectTokens(state.anchor, surface, hash);
      const window = state.config?.contextWindow ?? MAX_CONTEXT_BUDGET;
      if (projected * 1.15 > window) {
        set({
          sendError: `预计 ${Math.round(projected / 1000)}k token，超过模型 ${Math.round(window / 1000)}k 上下文。请用“总结整份文档”或智能筛选。`,
        });
        return;
      }
      set({ sendError: null });

      const runHash = state.boundDocHash || viewer.docHash;
      const controller = new AbortController();
      const run = beginForeground("chat", runHash, controller);
      if (!run) return;
      const stale = () =>
        !isForegroundCurrent(run) ||
        docEpoch !== run.epoch ||
        get().boundDocHash !== run.hash;

      const now = Date.now();
      const userId = `u_${now.toString(36)}`;
      const assistantId = `a_${now.toString(36)}`;
      const userMessage: ChatMessage = {
        id: userId,
        role: "user",
        content: text,
        status: "done",
        createdAt: now,
        note: messageNote(state.context),
      };
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: now + 1,
        model: state.model,
        allowedPages: request.allowedPages,
      };

      const nextMessages = [...state.messages, userMessage, assistantMessage];
      set((prev) => ({
        messages: nextMessages,
        sessions: prev.sessions.map((session) =>
          session.id === prev.activeSessionId
            ? {
                ...session,
                messages: nextMessages,
                title:
                  session.title === "新对话"
                    ? titleFromQuestion(text)
                    : session.title,
                model: state.model,
                updatedAt: Date.now(),
              }
            : session,
        ),
        draft: "",
        boundDocHash: runHash,
        streamingId: assistantId,
        error: null,
        sendError: null,
        surface,
        projected,
        usage: null,
        contextCollapseAt: Date.now(),
      }));
      saveChatNow(get());
      streamAbort = controller;

      let content = "";
      let reasoning = "";
      let dirty = false;
      let lastFlush = 0;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        if (!dirty || stale()) return;
        dirty = false;
        lastFlush = Date.now();
        patchMessage(assistantId, {
          content,
          reasoning: reasoning || undefined,
        });
      };

      const schedule = () => {
        dirty = true;
        const elapsed = Date.now() - lastFlush;
        if (elapsed >= 50) {
          flush();
        } else if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null;
            flush();
          }, 50 - elapsed);
        }
      };

      let usageRaw: unknown = null;
      try {
        const result = await streamChat(
          request.messages,
          state.model,
          state.thinking,
          {
            onDelta: (delta) => {
              if (stale()) return;
              content += delta;
              schedule();
            },
            onReasoning: (delta) => {
              if (stale()) return;
              reasoning += delta;
              schedule();
            },
            onUsage: (usage) => {
              usageRaw = usage;
            },
          },
          controller.signal,
        );
        if (flushTimer) clearTimeout(flushTimer);
        flush();
        if (stale()) return;

        if (result.usage) usageRaw = result.usage;

        if (result.aborted) {
          patchMessage(assistantId, { status: "stopped", content: content || "（已停止）" });
        } else {
          const buckets = usageFromProvider(usageRaw) ?? EMPTY_USAGE;
          const hasUsage = Boolean(usageFromProvider(usageRaw));
          const cited = [...new Set(
            [...content.matchAll(/\[\[p\.(\d+)\]\]|\[p\.(\d+)\]/g)].map((match) =>
              Number(match[1] ?? match[2]),
            ),
          )];
          patchMessage(assistantId, {
            status: "done",
            content: content.trim() || "（模型没有返回内容）",
            citedPages: cited,
            usage: hasUsage ? buckets : undefined,
          });
          if (hasUsage) {
            const anchor: Anchor = {
              envelopeHash: hash,
              promptTokens: buckets.uncachedInput + buckets.cacheRead + buckets.cacheWrite,
              surfaceEstimate: surface,
              usage: buckets,
              at: Date.now(),
            };
            set((prev) => ({
              anchor,
              usage: buckets,
              sessions: prev.sessions.map((session) =>
                session.id === prev.activeSessionId
                  ? { ...session, anchor, model: prev.model, updatedAt: Date.now() }
                  : session,
              ),
            }));
          }
        }
      } catch (error) {
        if (flushTimer) clearTimeout(flushTimer);
        flush();
        if (stale()) return;
        const info = describeError(error);
        set({
          error: {
            code: (error as AiError)?.code ?? "error",
            message: info.message,
            hint: info.hint,
          },
        });
        patchMessage(assistantId, {
          status: "error",
          content: content || "",
          error: info.message,
          errorHint: info.hint,
        });
        if (controller.signal.aborted) {
          patchMessage(assistantId, { status: "stopped" });
        }
      } finally {
        if (!isForegroundCurrent(run)) return;
        endForeground(run);
        streamAbort = null;
        set({ streamingId: null });
        persistChat(get());
        recalc();
      }
    },

    stop: () => {
      const run = foregroundRun;
      if (run?.kind === "summary") return;
      if (run) {
        run.controller.abort();
        foregroundRun = null;
      } else {
        streamAbort?.abort();
      }
      streamAbort = null;
      const id = get().streamingId;
      if (id) {
        const message = get().messages.find((item) => item.id === id);
        patchMessage(id, {
          status: "stopped",
          content: message?.content || "（已停止）",
        });
      }
      set({ streamingId: null });
      // Persist the partial answer under the document it belongs to before a
      // doc switch replaces the current messages.
      saveChatNow(get());
    },

    stopSummary: () => {
      const run = foregroundRun;
      if (run?.kind === "summary") {
        run.controller.abort();
        foregroundRun = null;
      } else {
        summaryAbort?.abort();
      }
      summaryAbort = null;
      const id = get().streamingId;
      if (id) {
        const message = get().messages.find((item) => item.id === id);
        patchMessage(id, {
          status: "stopped",
          content: message?.content || "（已停止整本总结）",
        });
      } else if (get().summary) {
        const now = Date.now();
        const message: ChatMessage = {
          id: `a_${now.toString(36)}_cancel`,
          role: "assistant",
          content: "（已取消整本总结）",
          status: "stopped",
          createdAt: now,
        };
        const messages = [...get().messages, message];
        set((prev) => ({
          messages,
          sessions: prev.sessions.map((session) =>
            session.id === prev.activeSessionId
              ? { ...session, messages, updatedAt: Date.now() }
              : session,
          ),
        }));
      }
      set({ streamingId: null, summary: null });
      saveChatNow(get());
    },

    summarizeDocument: async () => {
      const state = get();
      const viewer = useViewer.getState();
      if (!viewer.docHash) {
        get().notify("请先打开一个 PDF", "error");
        return;
      }
      if (state.summary || state.streamingId || foregroundRun) return;
      const pdf = getActiveDocument();
      if (!pdf) {
        get().notify("PDF 还没有加载完成", "error");
        return;
      }

      const hash = state.boundDocHash || viewer.docHash;
      const controller = new AbortController();
      const run = beginForeground("summary", hash, controller);
      if (!run) return;
      const stale = () =>
        !isForegroundCurrent(run) ||
        docEpoch !== run.epoch ||
        get().boundDocHash !== run.hash;

      if (get().status !== "open") set({ status: "open", origin: null, toast: null });
      const allPages = Array.from({ length: viewer.numPages }, (_, index) => index + 1);
      const now = Date.now();
      const userId = `u_${now.toString(36)}`;
      const assistantId = `a_${now.toString(36)}`;
      const model = state.model;
      const effort = state.thinking;
      const userMessage: ChatMessage = {
        id: userId,
        role: "user",
        content: "请总结整份文档",
        status: "done",
        createdAt: now,
        note: `整本总结 · ${viewer.numPages} 页`,
      };
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: now + 1,
        model,
        allowedPages: allPages,
      };
      const nextMessages = [...state.messages, userMessage];
      set((prev) => ({
        messages: nextMessages,
        sessions: prev.sessions.map((session) =>
          session.id === prev.activeSessionId
            ? {
                ...session,
                messages: nextMessages,
                title: session.title === "新对话" ? "整本总结" : session.title,
                model,
                updatedAt: Date.now(),
              }
            : session,
        ),
        streamingId: null,
        error: null,
        sendError: null,
        boundDocHash: hash,
        summary: { stage: "reading", done: 0, total: allPages.length },
        contextCollapseAt: Date.now(),
      }));
      saveChatNow(get());
      summaryAbort = controller;

      const addAssistant = () => {
        const messages = [...get().messages, assistantMessage];
        set((prev) => ({
          messages,
          sessions: prev.sessions.map((session) =>
            session.id === prev.activeSessionId
              ? { ...session, messages, updatedAt: Date.now() }
              : session,
          ),
          streamingId: assistantId,
        }));
      };

      let sectionUsage: UsageBuckets = { ...EMPTY_USAGE };
      let hasSectionUsage = false;

      const runSection = async (
        messages: ApiMessage[],
        sectionEffort: ThinkingEffort,
      ): Promise<string> => {
        let content = "";
        let usageRaw: unknown = null;
        await streamChat(
          messages,
          model,
          sectionEffort,
          {
            onDelta: (delta) => {
              content += delta;
            },
            onReasoning: () => undefined,
            onUsage: (usage) => {
              usageRaw = usage;
            },
          },
          controller.signal,
        );
        if (controller.signal.aborted || stale()) {
          throw new DOMException("aborted", "AbortError");
        }
        const usage = usageFromProvider(usageRaw);
        if (usage) {
          sectionUsage = addUsage(sectionUsage, usage);
          hasSectionUsage = true;
        }
        return content.trim();
      };

      try {
        // Collect page text in ~30k-character chunks; no giant all-pages string
        // is kept for big documents.
        const chunks: Array<{ start: number; end: number; text: string }> = [];
        let pending: string[] = [];
        let pendingPages: number[] = [];
        let pendingChars = 0;
        let readableChars = 0;
        await useOcr.getState().hydratePages(allPages);
        if (stale()) throw new DOMException("aborted", "AbortError");
        for (let index = 0; index < allPages.length; index += 1) {
          if (controller.signal.aborted || stale()) {
            throw new DOMException("aborted", "AbortError");
          }
          const page = allPages[index];
          const text = await getPageText(pdf, page);
          if (stale()) throw new DOMException("aborted", "AbortError");
          readableChars += text.trim().length;
          if (pendingPages.length && pendingChars + text.length > SUMMARY_CHUNK_CHARS) {
            chunks.push({
              start: pendingPages[0],
              end: pendingPages[pendingPages.length - 1],
              text: pending.join("\n\n"),
            });
            pending = [];
            pendingPages = [];
            pendingChars = 0;
          }
          pendingPages.push(page);
          pendingChars += text.length;
          pending.push(
            `<<<PAGE ${page}>>>\n${text.trim() || "（本页没有可提取文字，可能是扫描页。）"}`,
          );
          if (index % 4 === 3 || index === allPages.length - 1) {
            set((prev) => ({
              summary: prev.summary
                ? { ...prev.summary, stage: "reading", done: index + 1, total: allPages.length }
                : prev.summary,
            }));
          }
        }
        if (pendingPages.length) {
          chunks.push({
            start: pendingPages[0],
            end: pendingPages[pendingPages.length - 1],
            text: pending.join("\n\n"),
          });
        }

        const totalChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
        if (!chunks.length || readableChars < 20) {
          addAssistant();
          patchMessage(assistantId, {
            status: "done",
            content:
              "这份 PDF 没有可提取的文字，可能是扫描件。请先在页面提示条中识别当前页，或使用整页截图提问。",
            allowedPages: allPages,
          });
          set({ summary: null, streamingId: null });
          saveChatNow(get());
          return;
        }

        const direct = chunks.length === 1 && totalChars <= SUMMARY_DIRECT_CHARS;
        const sectionSummaries: string[] = [];
        const cacheRecord: SummaryRecord =
          (await loadSummaryRecord(hash)) ?? { hash, chunks: {} };
        if (stale()) throw new DOMException("aborted", "AbortError");
        const cached = cacheRecord.chunks;

        if (direct) {
          sectionSummaries.push(chunks[0].text);
          set({
            summary: { stage: "writing", done: 0, total: 1 },
          });
          addAssistant();
        } else {
          for (let index = 0; index < chunks.length; index += 1) {
            if (controller.signal.aborted || stale()) {
              throw new DOMException("aborted", "AbortError");
            }
            const chunk = chunks[index];
            const key = `${model}:${chunk.start}-${chunk.end}`;
            const hit = cached[key];
            if (hit?.text) {
              sectionSummaries.push(hit.text);
            } else {
              const text = await runSection(
                [
                  { role: "system", content: SUMMARY_MAP_SYSTEM },
                  {
                    role: "user",
                    content: `<context>\n${chunk.text}\n</context>\n\n${summaryMapQuestion(chunk.start, chunk.end)}`,
                  },
                ],
                "low",
              );
              const summary = text || `第 ${chunk.start}–${chunk.end} 页没有可总结的文字。`;
              sectionSummaries.push(summary);
              cached[key] = {
                start: chunk.start,
                end: chunk.end,
                text: summary,
                updatedAt: Date.now(),
              };
              await saveSummaryRecord(cacheRecord);
              if (stale()) throw new DOMException("aborted", "AbortError");
            }
            set((prev) => ({
              summary: prev.summary
                ? { ...prev.summary, stage: "mapping", done: index + 1, total: chunks.length }
                : prev.summary,
            }));
          }

          // Hierarchical reduce for documents whose section summaries are still
          // too large for one prompt.
          let merged = sectionSummaries;
          let round = 0;
          while (merged.length > 1 && round < 6) {
            const batches = reduceBatches(merged);
            if (batches.length === 1 && merged.join("\n\n").length <= SUMMARY_REDUCE_CHARS) break;
            const next: string[] = [];
            for (let index = 0; index < batches.length; index += 1) {
              if (controller.signal.aborted || stale()) {
                throw new DOMException("aborted", "AbortError");
              }
              const text = await runSection(
                [
                  { role: "system", content: SUMMARY_FINAL_SYSTEM },
                  {
                    role: "user",
                    content: `${joinSectionSummaries(batches[index])}\n\n请把这些分段摘要压缩成一组要点，保留页码引用，不要写总览。`,
                  },
                ],
                "low",
              );
              next.push(text);
              set((prev) => ({
                summary: prev.summary
                  ? {
                      ...prev.summary,
                      stage: "reducing",
                      done: index + 1 + round * batches.length,
                      total: batches.length + round * batches.length,
                    }
                  : prev.summary,
              }));
            }
            merged = next;
            round += 1;
          }
          sectionSummaries.splice(0, sectionSummaries.length, ...merged);
          set({ summary: { stage: "writing", done: 0, total: 1 } });
          addAssistant();
        }

        const material = direct
          ? chunks[0].text
          : joinSectionSummaries(sectionSummaries);
        const question = direct
          ? summaryDirectQuestion(viewer.numPages)
          : summaryFinalQuestion(viewer.numPages, chunks.length);

        let content = "";
        let usageRaw: unknown = null;
        let lastFlush = 0;
        if (stale()) throw new DOMException("aborted", "AbortError");
        const result = await streamChat(
          [
            { role: "system", content: SUMMARY_FINAL_SYSTEM },
            { role: "user", content: `<context>\n${material}\n</context>\n\n${question}` },
          ],
          model,
          effort,
          {
            onDelta: (delta) => {
              if (stale()) return;
              content += delta;
              const now = Date.now();
              if (now - lastFlush < 60) return;
              lastFlush = now;
              patchMessage(assistantId, {
                content,
                reasoning: undefined,
              });
            },
            onReasoning: () => undefined,
            onUsage: (usage) => {
              usageRaw = usage;
            },
          },
          controller.signal,
        );
        if (stale()) return;
        if (result.usage) usageRaw = result.usage;

        if (result.aborted) {
          patchMessage(assistantId, {
            status: "stopped",
            content: content || "（已停止）",
          });
        } else {
          const finalUsage = usageFromProvider(usageRaw);
          const buckets = finalUsage ? addUsage(sectionUsage, finalUsage) : sectionUsage;
          const hasUsage = Boolean(finalUsage) || hasSectionUsage;
          const cited = [
            ...new Set(
              [...content.matchAll(/\[\[p\.(\d+)\]\]|\[p\.(\d+)\]/g)].map((match) =>
                Number(match[1] ?? match[2]),
              ),
            ),
          ];
          patchMessage(assistantId, {
            status: "done",
            content: content.trim() || "（模型没有返回内容）",
            citedPages: cited,
            usage: hasUsage ? buckets : undefined,
            note: direct ? "整本总结" : `整本总结 · ${chunks.length} 段`,
          });
          if (hasUsage) {
            const anchor: Anchor = {
              envelopeHash: currentHash(model, get().config?.baseUrlHost ?? ""),
              promptTokens: buckets.uncachedInput + buckets.cacheRead + buckets.cacheWrite,
              surfaceEstimate: get().surface,
              usage: buckets,
              at: Date.now(),
            };
            set((prev) => ({
              anchor,
              usage: buckets,
              sessions: prev.sessions.map((session) =>
                session.id === prev.activeSessionId
                  ? { ...session, anchor, model, updatedAt: Date.now() }
                  : session,
              ),
            }));
          }
        }
        if (stale()) return;
        set({ summary: null, streamingId: null });
        saveChatNow(get());
        get().refreshEstimate();
      } catch (error) {
        if (stale()) return;
        const aborted =
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError");
        if (!aborted) {
          const info = describeError(error);
          set({
            error: {
              code: (error as AiError)?.code ?? "summary_error",
              message: info.message,
              hint: info.hint,
            },
          });
          if (get().streamingId) {
            patchMessage(assistantId, {
              status: "error",
              content: "",
              error: info.message,
              errorHint: info.hint,
            });
          }
          get().notify(`整本总结失败：${info.message}`, "error");
        }
        set({ summary: null, streamingId: null });
        saveChatNow(get());
      } finally {
        if (!isForegroundCurrent(run)) return;
        endForeground(run);
        summaryAbort = null;
        if (get().summary) set({ summary: null });
      }
    },

    retry: async (messageId) => {
      const messages = get().messages;
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      let question = "";
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (messages[cursor].role === "user") {
          question = messages[cursor].content;
          break;
        }
      }
      if (!question) return;
      const trimmed = messages.slice(0, index);
      set((state) => ({
        messages: trimmed,
        sessions: state.sessions.map((session) =>
          session.id === state.activeSessionId
            ? { ...session, messages: trimmed, updatedAt: Date.now() }
            : session,
        ),
      }));
      await get().send(question);
    },

    clearAll: () => {
      foregroundRun?.controller.abort();
      foregroundRun = null;
      docEpoch += 1;
      streamAbort?.abort();
      streamAbort = null;
      summaryAbort?.abort();
      summaryAbort = null;
      pageToken += 1;
      filterToken += 1;
      set((state) => ({
        messages: [],
        sessions: state.sessions.map((session) =>
          session.id === state.activeSessionId
            ? {
                ...session,
                messages: [],
                title: "新对话",
                anchor: null,
                updatedAt: Date.now(),
              }
            : session,
        ),
        context: { ...EMPTY_CONTEXT },
        draft: "",
        streamingId: null,
        anchor: null,
        usage: null,
        surface: 0,
        projected: 0,
        error: null,
        sendError: null,
        autoCurrentPage: true,
        clearConfirm: false,
        scannedPages: [],
        filtering: null,
        summary: null,
      }));
      const viewer = useViewer.getState();
      if (viewer.docHash) saveChatNow(get());
      const page = viewer.currentPage;
      if (page) void get().syncCurrentPage(page);
      get().notify("当前对话与上下文已清空", "success");
    },

    refreshEstimate: recalc,
  };
});

export function useContextCount(): number {
  return useAssistant((state) => contextCount(state.context, state.autoCurrentPage));
}
