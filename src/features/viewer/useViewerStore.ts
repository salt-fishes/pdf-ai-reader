import { create } from "zustand";
import {
  closePdf,
  getActiveDocument,
  getOutline,
  getPageText,
  openPdf,
  setPageText,
  type FlatOutlineItem,
} from "../../lib/pdf/pdf";
import {
  hashBytes,
  loadDocumentRecord,
  loadHighlightsRecord,
  loadOcrIndex,
  loadOcrPage,
  loadOcrRecord,
  loadRecentBytes,
  loadRecentDocuments,
  recordRecentDocument,
  saveDocumentRecord,
  saveHighlightsRecord,
  type RecentDocumentMeta,
} from "../../lib/storage/db";
import { PDF_TO_CSS_UNITS } from "../../lib/pdf/units";
import { loadSettings, saveSettings } from "../../lib/storage/db";
import {
  clampIntensity,
  colorModeFromTheme,
  isColorMode,
  type ColorMode,
} from "../../lib/reading/color";

export type NormalizedRect = { x: number; y: number; w: number; h: number };

export type SelectionSource = "ocr" | "mixed";

export type SelectionState = {
  page: number;
  text: string;
  toolbar: { x: number; y: number };
  rects: NormalizedRect[];
  source?: SelectionSource;
  pages?: Array<{
    page: number;
    text: string;
    rects: NormalizedRect[];
    source?: SelectionSource;
  }>;
};

export type Highlight = {
  id: string;
  page: number;
  rects: NormalizedRect[];
  text: string;
  source?: SelectionSource;
  createdAt: number;
};

export type LocationTarget = {
  page: number;
  /** Normalized y inside the page (0 = top, 1 = bottom). */
  y?: number;
  /** Highlight to pulse after the jump. */
  focusId?: string;
  align?: "top" | "center";
  at: number;
};

export type SearchResult = {
  page: number;
  excerpt: string;
  index: number;
  /** 0-based occurrence on this page, used for exact scroll. */
  occurrence: number;
  source?: "ocr";
};

export type SearchFocus = {
  page: number;
  occurrence: number;
  query: string;
  at: number;
};

type ViewerState = {
  docName: string;
  docHash: string;
  numPages: number;
  currentPage: number;
  zoom: number;
  fitMode: "width" | "page" | "custom";
  fitNonce: number;
  loading: boolean;
  progress: number;
  error: string | null;
  passwordRequired: boolean;
  passwordError: string | null;
  recent: RecentDocumentMeta[];
  outline: FlatOutlineItem[];
  outlineBusy: boolean;
  selection: SelectionState | null;
  highlights: Highlight[];
  colorMode: ColorMode;
  colorIntensity: number;
  sidebar: "pages" | "outline" | "highlights" | null;
  scrollTarget: LocationTarget | null;
  focusedHighlight: { id: string; at: number } | null;
  restoreScrollTop: number | null;
  searchOpen: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  searchBusy: boolean;
  searchProgress: { done: number; total: number } | null;
  searchFocus: SearchFocus | null;
  regionPage: number | null;

  openFile: (file: File) => Promise<void>;
  openRecent: (hash: string) => Promise<void>;
  refreshRecent: () => Promise<void>;
  submitPassword: (password: string) => Promise<void>;
  cancelPassword: () => void;
  closeDocument: () => Promise<void>;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number, mode?: "width" | "page" | "custom") => void;
  requestFit: (mode: "width" | "page") => void;
  zoomBy: (delta: number) => void;
  resetZoom: () => void;
  requestScroll: (page: number) => void;
  requestLocation: (target: Omit<LocationTarget, "at">) => void;
  requestCitation: (page: number) => void;
  clearRestoreScroll: () => void;
  setSelection: (selection: SelectionState | null) => void;
  addHighlight: (selection: SelectionState) => void;
  removeHighlight: (id: string) => void;
  toggleSidebar: (panel: "pages" | "outline" | "highlights") => void;
  setColorMode: (mode: ColorMode) => void;
  setColorIntensity: (value: number) => void;
  cycleColorMode: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  runSearch: () => Promise<void>;
  focusSearchResult: (page: number, occurrence: number, query: string) => void;
  clearSearchFocus: () => void;
  savePosition: (scrollTop: number) => void;
  startRegion: (page: number) => void;
  cancelRegion: () => void;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let focusTimer: ReturnType<typeof setTimeout> | null = null;
let scrollTopMemory = 0;
let searchToken = 0;
let pendingOpen: { file: File; bytes: ArrayBuffer } | null = null;
/** Last normalized reading position per page, used by citation jumps. */
export const pageAnchorMemory: Record<number, number> = {};

function persistHighlights(hash: string, highlights: Highlight[]) {
  if (!hash) return;
  void saveHighlightsRecord({ hash, highlights });
}

const settings = loadSettings();
const initialColorMode: ColorMode = isColorMode(settings.colorMode)
  ? settings.colorMode
  : colorModeFromTheme(settings.theme);

export const useViewer = create<ViewerState>((set, get) => {
  const loadOpenedPdf = async (
    file: File,
    bytes: ArrayBuffer,
    password?: string,
  ): Promise<void> => {
    set({ progress: 0.22 });
    const hash = await hashBytes(bytes);
    set({ progress: 0.38 });
    const pdf = await openPdf(bytes, password);
    const savedOcr = await loadOcrRecord(hash);
    if (savedOcr) {
      for (const [page, text] of Object.entries(savedOcr.pages)) {
        const pageNumber = Number(page);
        if (pageNumber >= 1 && pageNumber <= pdf.numPages && text) {
          setPageText(pdf, pageNumber, text);
        }
      }
    }

    // Read the saved position before exposing the document, otherwise a
    // slow IndexedDB read can overwrite a page jump made right after open.
    const saved = await loadDocumentRecord(hash);
    const savedHighlights = await loadHighlightsRecord(hash);
    const savedPage =
      saved && saved.lastPage >= 1 && saved.lastPage <= pdf.numPages ? saved.lastPage : 1;
    const savedZoom = saved
      ? saved.zoomUnits === "css"
        ? saved.zoom
        : saved.zoom / PDF_TO_CSS_UNITS
      : 1;
    const restoredZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, savedZoom));

    for (const key of Object.keys(pageAnchorMemory)) delete pageAnchorMemory[Number(key)];
    set({
      docName: file.name,
      docHash: hash,
      numPages: pdf.numPages,
      currentPage: savedPage,
      zoom: restoredZoom,
      fitMode: saved ? "custom" : "width",
      loading: false,
      progress: 1,
      passwordRequired: false,
      passwordError: null,
      highlights:
        savedHighlights?.highlights.filter(
          (highlight) => highlight.page >= 1 && highlight.page <= pdf.numPages,
        ) ?? [],
      sidebar: null,
      outline: [],
      regionPage: null,
    });

    if (bytes.byteLength <= 24 * 1024 * 1024) {
      void recordRecentDocument({
        hash,
        name: file.name,
        pages: pdf.numPages,
        size: bytes.byteLength,
        updatedAt: Date.now(),
        data: bytes.slice(0),
      })
        .then((records) =>
          set({
            recent: records.map(({ hash: itemHash, name, pages, size, updatedAt }) => ({
              hash: itemHash,
              name,
              pages,
              size,
              updatedAt,
            })),
          }),
        )
        .catch(() => undefined);
    }

    if (saved) {
      scrollTopMemory = saved.scrollTop;
    }
    set({ restoreScrollTop: saved?.scrollTop && saved.scrollTop > 0 ? saved.scrollTop : null });
    if (!saved?.scrollTop) get().requestScroll(savedPage);

    set({ outlineBusy: true });
    try {
      const outline = await getOutline(pdf);
      set({ outline });
    } catch {
      set({ outline: [] });
    } finally {
      set({ outlineBusy: false });
    }
  };

  return {
    docName: "",
    docHash: "",
    numPages: 0,
    currentPage: 1,
    zoom: 1,
    fitMode: "width",
    fitNonce: 0,
    loading: false,
    progress: 0,
    error: null,
    passwordRequired: false,
    passwordError: null,
    recent: [],
    outline: [],
    outlineBusy: false,
    selection: null,
    highlights: [],
    colorMode: initialColorMode,
    colorIntensity: clampIntensity(settings.colorIntensity ?? 100),
    sidebar: null,
    scrollTarget: null,
    focusedHighlight: null,
    restoreScrollTop: null,
    searchOpen: false,
    searchQuery: "",
    searchResults: [],
    searchBusy: false,
    searchProgress: null,
    searchFocus: null,
    regionPage: null,

    openFile: async (file) => {
      set({
        loading: true,
        progress: 0.08,
        error: null,
        passwordRequired: false,
        passwordError: null,
        selection: null,
        searchResults: [],
        searchFocus: null,
        scrollTarget: null,
        focusedHighlight: null,
      });
      try {
        const bytes = await file.arrayBuffer();
        pendingOpen = { file, bytes };
        await loadOpenedPdf(file, bytes);
        pendingOpen = null;
      } catch (error) {
        const name = (error as { name?: string })?.name;
        if (name === "PasswordException") {
          set({
            loading: false,
            progress: 0,
            passwordRequired: true,
            passwordError: null,
            error: null,
          });
          return;
        }
        pendingOpen = null;
        const message = error instanceof Error ? error.message : "无法打开该 PDF";
        set({ loading: false, error: message, progress: 0 });
        if (get().docName) {
          void import("../assistant/useAssistantStore").then(({ useAssistant }) => {
            useAssistant.getState().notify(`打开失败：${message}`, "error");
          });
        }
      }
    },

    openRecent: async (hash) => {
      const record = await loadRecentBytes(hash).catch(() => null);
      if (!record?.data) {
        void import("../assistant/useAssistantStore").then(({ useAssistant }) => {
          useAssistant.getState().notify("该文件没有本地缓存，请重新选择文件", "error");
        });
        return;
      }
      const file = new File([record.data], record.name, { type: "application/pdf" });
      await get().openFile(file);
    },

    refreshRecent: async () => {
      const records = await loadRecentDocuments().catch(() => []);
      set({
        recent: records.map(({ hash, name, pages, size, updatedAt }) => ({
          hash,
          name,
          pages,
          size,
          updatedAt,
        })),
      });
    },

    submitPassword: async (password) => {
      const pending = pendingOpen;
      if (!pending) {
        set({ passwordRequired: false, passwordError: null });
        return;
      }
      set({ loading: true, progress: 0.2, passwordRequired: false, passwordError: null });
      try {
        await loadOpenedPdf(pending.file, pending.bytes, password);
        pendingOpen = null;
      } catch (error) {
        const name = (error as { name?: string })?.name;
        if (name === "PasswordException") {
          set({
            loading: false,
            progress: 0,
            passwordRequired: true,
            passwordError: "密码不正确，请重试",
            error: null,
          });
          return;
        }
        pendingOpen = null;
        const message = error instanceof Error ? error.message : "无法打开该 PDF";
        set({ loading: false, passwordRequired: false, error: message, progress: 0 });
      }
    },

    cancelPassword: () => {
      pendingOpen = null;
      set({
        passwordRequired: false,
        passwordError: null,
        loading: false,
        progress: 0,
        error: null,
      });
    },

    closeDocument: async () => {
      await closePdf();
      for (const key of Object.keys(pageAnchorMemory)) delete pageAnchorMemory[Number(key)];
      if (saveTimer) clearTimeout(saveTimer);
      set({
        docName: "",
        docHash: "",
        numPages: 0,
        currentPage: 1,
        zoom: 1,
        loading: false,
        progress: 0,
        error: null,
        passwordRequired: false,
        passwordError: null,
        outline: [],
        selection: null,
        highlights: [],
        sidebar: null,
        scrollTarget: null,
        focusedHighlight: null,
        restoreScrollTop: null,
        searchOpen: false,
        searchResults: [],
        searchFocus: null,
        regionPage: null,
      });
    },

    setCurrentPage: (page) => {
      const { numPages, currentPage } = get();
      if (page < 1 || page > numPages || page === currentPage) return;
      set({ currentPage: page });
      const { docHash, docName, zoom } = get();
      if (!docHash) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void saveDocumentRecord({
          hash: docHash,
          name: docName,
          pages: numPages,
          lastPage: page,
          zoom,
          zoomUnits: "css",
          scrollTop: scrollTopMemory,
        });
      }, 500);
    },

    setZoom: (zoom, mode = "custom") => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoom.toFixed(3))));
      set({ zoom: clamped, fitMode: mode });
    },

    requestFit: (mode) => set({ fitMode: mode, fitNonce: Date.now() }),

    zoomBy: (delta) => {
      const { zoom, setZoom } = get();
      setZoom(zoom + delta, "custom");
    },

    resetZoom: () => get().setZoom(1, "custom"),

    requestScroll: (page) => get().requestLocation({ page }),

    requestCitation: (page) => {
      const y = pageAnchorMemory[page];
      if (y !== undefined) {
        get().requestLocation({ page, y, align: "top" });
      } else {
        get().requestScroll(page);
      }
    },

    requestLocation: (target) => {
      const at = Date.now();
      set({ scrollTarget: { ...target, at } });
      if (focusTimer) clearTimeout(focusTimer);
      if (!target.focusId) {
        set({ focusedHighlight: null });
        return;
      }
      set({ focusedHighlight: { id: target.focusId, at } });
      focusTimer = setTimeout(() => {
        if (useViewer.getState().focusedHighlight?.id === target.focusId) {
          set({ focusedHighlight: null });
        }
      }, 1800);
    },

    clearRestoreScroll: () => set({ restoreScrollTop: null }),

    setSelection: (selection) => set({ selection }),

    addHighlight: (selection) => {
      const pages = selection.pages?.length
        ? selection.pages
        : [{ page: selection.page, text: selection.text, rects: selection.rects }];
      const now = Date.now();
      const highlights: Highlight[] = pages.map((page, index) => ({
        id: `hl_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}_${index}`,
        page: page.page,
        rects: page.rects,
        text: page.text,
        source: page.source ?? selection.source,
        createdAt: now + index,
      }));
      set({ highlights: [...get().highlights, ...highlights] });
      persistHighlights(get().docHash, get().highlights);
    },

    removeHighlight: (id) => {
      set({ highlights: get().highlights.filter((item) => item.id !== id) });
      persistHighlights(get().docHash, get().highlights);
    },

    toggleSidebar: (panel) => set({ sidebar: get().sidebar === panel ? null : panel }),

    setColorMode: (colorMode) => {
      set({ colorMode });
      saveSettings({ colorMode });
    },

    setColorIntensity: (value) => {
      const colorIntensity = clampIntensity(value);
      set({ colorIntensity });
      saveSettings({ colorIntensity });
    },

    cycleColorMode: () => {
      const order: ColorMode[] = ["original", "invert", "smart", "grayscale", "eye"];
      const index = order.indexOf(get().colorMode);
      get().setColorMode(order[(index + 1) % order.length]);
    },

    openSearch: () => set({ searchOpen: true }),
    closeSearch: () => {
      searchToken += 1;
      set({
        searchOpen: false,
        searchBusy: false,
        searchProgress: null,
        searchFocus: null,
      });
    },
    setSearchQuery: (query) => {
      searchToken += 1;
      set({
        searchQuery: query,
        searchResults: [],
        searchBusy: false,
        searchProgress: null,
        searchFocus: null,
      });
    },

    focusSearchResult: (page, occurrence, query) => {
      set({ searchFocus: { page, occurrence, query, at: Date.now() } });
      get().requestLocation({ page, align: "top" });
    },

    clearSearchFocus: () => set({ searchFocus: null }),

    runSearch: async () => {
      const { searchQuery, numPages } = get();
      const query = searchQuery.trim();
      if (query.length < 2 || !numPages) {
        set({ searchResults: [], searchBusy: false });
        return;
      }
      const pdf = getActiveDocument();
      if (!pdf) return;

      const mine = ++searchToken;
      set({ searchBusy: true, searchProgress: { done: 0, total: numPages }, searchResults: [] });
      const results: SearchResult[] = [];
      const lower = query.toLocaleLowerCase("zh-CN");
      let ocrPages: Record<number, unknown> = {};
      const ocrIndex = new Set<number>();
      const hash = get().docHash;
      try {
        const module = await import("../ocr/useOcrStore");
        ocrPages = module.useOcr.getState().pages;
      } catch {
        // OCR is optional; search native text only.
      }
      if (hash) {
        const index = await loadOcrIndex(hash);
        for (const page of index?.pages ?? []) ocrIndex.add(page);
      }

      try {
        for (let page = 1; page <= numPages; page += 1) {
          if (mine !== searchToken) return;
          let text = await getPageText(pdf, page);
          if (hash && ocrIndex.has(page) && text.replace(/\s+/g, "").length < 20) {
            const record = await loadOcrPage(hash, page);
            if (record) {
              setPageText(pdf, page, record.text);
              text = record.text;
            }
          }
          const haystack = text.toLocaleLowerCase("zh-CN");
          let index = haystack.indexOf(lower);
          let occurrence = 0;
          while (index !== -1 && results.length < 200) {
            const start = Math.max(0, index - 24);
            const excerpt = text
              .slice(start, Math.min(text.length, index + query.length + 34))
              .replace(/\s+/g, " ")
              .trim();
            results.push({
              page,
              excerpt,
              index,
              occurrence,
              source: ocrPages[page] ? "ocr" : undefined,
            });
            occurrence += 1;
            index = haystack.indexOf(lower, index + lower.length);
          }
          set({ searchProgress: { done: page, total: numPages }, searchResults: [...results] });
          if (results.length >= 200) break;
        }
      } finally {
        if (mine === searchToken) set({ searchBusy: false, searchProgress: null });
      }
    },

    savePosition: (scrollTop) => {
      scrollTopMemory = scrollTop;
      const { docHash, docName, numPages, currentPage, zoom } = get();
      if (!docHash) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void saveDocumentRecord({
          hash: docHash,
          name: docName,
          pages: numPages,
          lastPage: currentPage,
          zoom,
          zoomUnits: "css",
          scrollTop,
        });
      }, 600);
    },

    startRegion: (page) => {
      const { numPages } = get();
      if (page < 1 || page > numPages) return;
      set({ regionPage: page, selection: null });
    },

    cancelRegion: () => set({ regionPage: null }),
  };
});
