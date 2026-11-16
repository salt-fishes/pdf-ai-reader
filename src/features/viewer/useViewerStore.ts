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
import { hashBytes, loadDocumentRecord, loadHighlightsRecord, loadOcrRecord, saveDocumentRecord, saveHighlightsRecord } from "../../lib/storage/db";
import { PDF_TO_CSS_UNITS } from "../../lib/pdf/units";
import { loadSettings, saveSettings } from "../../lib/storage/db";
import {
  clampIntensity,
  colorModeFromTheme,
  isColorMode,
  type ColorMode,
} from "../../lib/reading/color";

export type NormalizedRect = { x: number; y: number; w: number; h: number };

export type SelectionState = {
  page: number;
  text: string;
  toolbar: { x: number; y: number };
  rects: NormalizedRect[];
  pages?: Array<{ page: number; text: string; rects: NormalizedRect[] }>;
};

export type Highlight = {
  id: string;
  page: number;
  rects: NormalizedRect[];
  text: string;
  createdAt: number;
};

export type SearchResult = {
  page: number;
  excerpt: string;
  index: number;
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
  outline: FlatOutlineItem[];
  outlineBusy: boolean;
  selection: SelectionState | null;
  highlights: Highlight[];
  colorMode: ColorMode;
  colorIntensity: number;
  sidebar: "pages" | "outline" | "highlights" | null;
  scrollTarget: { page: number; at: number } | null;
  searchOpen: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  searchBusy: boolean;
  searchProgress: { done: number; total: number } | null;
  regionPage: number | null;

  openFile: (file: File) => Promise<void>;
  closeDocument: () => Promise<void>;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number, mode?: "width" | "page" | "custom") => void;
  requestFit: (mode: "width" | "page") => void;
  zoomBy: (delta: number) => void;
  resetZoom: () => void;
  requestScroll: (page: number) => void;
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
  savePosition: (scrollTop: number) => void;
  startRegion: (page: number) => void;
  cancelRegion: () => void;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let scrollTopMemory = 0;
let searchToken = 0;

function persistHighlights(hash: string, highlights: Highlight[]) {
  if (!hash) return;
  void saveHighlightsRecord({ hash, highlights });
}

const settings = loadSettings();
const initialColorMode: ColorMode = isColorMode(settings.colorMode)
  ? settings.colorMode
  : colorModeFromTheme(settings.theme);

export const useViewer = create<ViewerState>((set, get) => ({
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
  outline: [],
  outlineBusy: false,
  selection: null,
  highlights: [],
  colorMode: initialColorMode,
  colorIntensity: clampIntensity(settings.colorIntensity ?? 100),
  sidebar: null,
  scrollTarget: null,
  searchOpen: false,
  searchQuery: "",
  searchResults: [],
  searchBusy: false,
  searchProgress: null,
  regionPage: null,

  openFile: async (file) => {
    set({ loading: true, progress: 0.08, error: null, selection: null, searchResults: [] });
    try {
      const bytes = await file.arrayBuffer();
      set({ progress: 0.22 });
      const hash = await hashBytes(bytes);
      set({ progress: 0.38 });
      const pdf = await openPdf(bytes);
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

      set({
        docName: file.name,
        docHash: hash,
        numPages: pdf.numPages,
        currentPage: savedPage,
        zoom: restoredZoom,
        fitMode: saved ? "custom" : "width",
        loading: false,
        progress: 1,
        highlights:
          savedHighlights?.highlights.filter(
            (highlight) => highlight.page >= 1 && highlight.page <= pdf.numPages,
          ) ?? [],
        sidebar: null,
        outline: [],
        regionPage: null,
      });

      if (saved) {
        scrollTopMemory = saved.scrollTop;
      }
      get().requestScroll(savedPage);

      set({ outlineBusy: true });
      try {
        const outline = await getOutline(pdf);
        set({ outline });
      } catch {
        set({ outline: [] });
      } finally {
        set({ outlineBusy: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法打开该 PDF";
      set({ loading: false, error: message, progress: 0 });
    }
  },

  closeDocument: async () => {
    await closePdf();
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
      outline: [],
      selection: null,
      highlights: [],
      sidebar: null,
      scrollTarget: null,
      searchOpen: false,
      searchResults: [],
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

  requestScroll: (page) => set({ scrollTarget: { page, at: Date.now() } }),

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
    set({ searchOpen: false, searchBusy: false, searchProgress: null });
  },
  setSearchQuery: (query) => {
    searchToken += 1;
    set({ searchQuery: query, searchResults: [], searchBusy: false, searchProgress: null });
  },

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

    try {
      for (let page = 1; page <= numPages; page += 1) {
        if (mine !== searchToken) return;
        const text = await getPageText(pdf, page);
        const haystack = text.toLocaleLowerCase("zh-CN");
        let index = haystack.indexOf(lower);
        while (index !== -1 && results.length < 200) {
          const start = Math.max(0, index - 24);
          const excerpt = text
            .slice(start, Math.min(text.length, index + query.length + 34))
            .replace(/\s+/g, " ")
            .trim();
          results.push({ page, excerpt, index });
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
}));
