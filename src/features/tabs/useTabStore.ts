import { create } from "zustand";
import type { ColorMode } from "../../lib/reading/color";
import { colorModeFromTheme, clampIntensity, isColorMode } from "../../lib/reading/color";
import { loadSettings } from "../../lib/storage/db";
import { pickPdfFile } from "../../lib/openFile";
import { loadTabSnapshot, saveTabSnapshot } from "./tabStorage";
import { useViewer } from "../viewer/useViewerStore";

export const SHARED_AI_WORKSPACE_ID = "workspace:shared";

export type PdfTabSource =
  | { kind: "file"; file: File; previousHash?: string }
  | { kind: "recent"; hash: string; name: string }
  | { kind: "relink"; name: string; previousHash?: string };

export type PdfTabReading = {
  lastPage: number;
  scrollTop: number;
  zoom: number;
  fitMode: "width" | "page" | "custom";
  colorMode: ColorMode;
  colorIntensity: number;
};

export type PdfTab = {
  id: string;
  name: string;
  docHash?: string;
  pages: number;
  source: PdfTabSource;
  reading: PdfTabReading;
  aiMode: "inherit" | "isolated" | "shared";
  workspaceId: string;
  status: "loading" | "ready" | "password" | "error" | "relink";
  loadedOnce: boolean;
  createdAt: number;
  lastActivatedAt: number;
};

type TabState = {
  tabs: PdfTab[];
  activeTabId: string | null;
  openFileTab: (file: File) => string;
  openRecentTab: (hash: string, name: string) => Promise<string | null>;
  activateTab: (id: string) => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  setTabAiMode: (id: string, mode: PdfTab["aiMode"]) => void;
  restoreTabs: () => Promise<void>;
  relinkTab: (id: string, file: File) => void;
  clearTabs: () => Promise<void>;
};

const settings = loadSettings();
let tabSequence = 0;
let activationEpoch = 0;

function tabId() {
  tabSequence += 1;
  return `tab_${Date.now().toString(36)}_${tabSequence.toString(36)}`;
}

function defaultReading(): PdfTabReading {
  return {
    lastPage: 1,
    scrollTop: 0,
    zoom: 1,
    fitMode: "width",
    colorMode: isColorMode(settings.colorMode)
      ? settings.colorMode
      : colorModeFromTheme(settings.theme),
    colorIntensity: clampIntensity(settings.colorIntensity ?? 100),
  };
}

export const useTabs = create<TabState>((set, get) => {
  const patchTab = (id: string, patch: Partial<PdfTab>) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    }));
  };

  const captureTab = (id: string) => {
    const tab = get().tabs.find((item) => item.id === id);
    const viewer = useViewer.getState();
    if (!tab || !tab.docHash || tab.docHash !== viewer.docHash) return;
    patchTab(id, {
      pages: viewer.numPages,
      reading: {
        lastPage: viewer.currentPage,
        scrollTop: viewer.scrollTop,
        zoom: viewer.zoom,
        fitMode: viewer.fitMode,
        colorMode: viewer.colorMode,
        colorIntensity: viewer.colorIntensity,
      },
    });
  };

  const restoreReading = (tab: PdfTab, numPages: number) => {
    const reading = tab.reading;
    const lastPage = Math.max(1, Math.min(numPages, reading.lastPage));
    useViewer.setState({
      currentPage: lastPage,
      scrollTop: reading.scrollTop,
      zoom: reading.zoom,
      fitMode: reading.fitMode,
      colorMode: reading.colorMode,
      colorIntensity: reading.colorIntensity,
      restoreScrollTop: reading.scrollTop > 0 ? reading.scrollTop : null,
      scrollTarget: null,
    });
    if (reading.scrollTop <= 0) useViewer.getState().requestScroll(lastPage);
  };

  const activateTab = async (id: string) => {
    const state = get();
    const tab = state.tabs.find((item) => item.id === id);
    if (!tab) return;
    const viewer = useViewer.getState();
    if (tab.source.kind === "relink") {
      if (state.activeTabId && state.activeTabId !== id) captureTab(state.activeTabId);
      const mine = ++activationEpoch;
      set((current) => ({
        activeTabId: id,
        tabs: current.tabs.map((item) =>
          item.id === id ? { ...item, status: "relink", lastActivatedAt: Date.now() } : item,
        ),
      }));
      useViewer.getState().flushPosition();
      await useViewer.getState().closeDocument();
      if (mine !== activationEpoch) return;
      pickPdfFile((file) => get().relinkTab(id, file));
      return;
    }
    if (
      state.activeTabId === id &&
      tab.docHash &&
      tab.docHash === viewer.docHash &&
      !viewer.loading
    ) {
      return;
    }

    if (state.activeTabId && state.activeTabId !== id) captureTab(state.activeTabId);
    const mine = ++activationEpoch;
    set((current) => ({
      activeTabId: id,
      tabs: current.tabs.map((item) =>
        item.id === id ? { ...item, status: "loading", lastActivatedAt: Date.now() } : item,
      ),
    }));

    useViewer.getState().flushPosition();
    await useViewer.getState().closeDocument();
    if (mine !== activationEpoch) return;

    let hash: string | null = null;
    try {
      hash =
        tab.source.kind === "file"
          ? await useViewer.getState().openFile(tab.source.file)
          : await useViewer.getState().openRecent(tab.source.hash);
    } catch {
      hash = null;
    }
    if (mine !== activationEpoch) return;
    if (!hash) {
      const password = useViewer.getState().passwordRequired;
      const source: PdfTabSource =
        !password && tab.source.kind === "recent"
          ? { kind: "relink", name: tab.name, previousHash: tab.source.hash }
          : tab.source;
      patchTab(id, {
        source,
        status: password ? "password" : source.kind === "relink" ? "relink" : "error",
      });
      return;
    }

    const opened = useViewer.getState();
    const sourceHash =
      tab.source.kind === "file"
        ? tab.source.previousHash
        : tab.source.kind === "recent"
          ? tab.source.hash
          : undefined;
    const sameDocument = tab.loadedOnce && (!sourceHash || sourceHash === hash);
    const reading: PdfTabReading =
      tab.loadedOnce && sameDocument
        ? {
            ...tab.reading,
            lastPage: Math.max(1, Math.min(opened.numPages, tab.reading.lastPage)),
          }
        : {
            lastPage: opened.currentPage,
            scrollTop: opened.scrollTop,
            zoom: opened.zoom,
            fitMode: opened.fitMode,
            colorMode: opened.colorMode,
            colorIntensity: opened.colorIntensity,
          };
    const next: PdfTab = {
      ...tab,
      source: tab.source.kind === "file" ? { kind: "file", file: tab.source.file } : tab.source,
      docHash: hash,
      pages: opened.numPages,
      reading,
      status: "ready",
      loadedOnce: true,
    };
    patchTab(id, {
      source: next.source,
      docHash: hash,
      pages: opened.numPages,
      reading,
      status: "ready",
      loadedOnce: true,
    });
    if (tab.loadedOnce && sameDocument) restoreReading(next, opened.numPages);
  };

  return {
    tabs: [],
    activeTabId: null,

    restoreTabs: async () => {
      if (get().tabs.length) return;
      const snapshot = loadTabSnapshot();
      if (!snapshot?.tabs.length) return;
      if (get().tabs.length) return;
      set({ tabs: snapshot.tabs, activeTabId: snapshot.activeTabId });
      const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId);
      if (active?.source.kind === "recent") await activateTab(active.id);
    },

    relinkTab: (id, file) => {
      const tab = get().tabs.find((item) => item.id === id);
      if (!tab) return;
      patchTab(id, {
        name: file.name,
        docHash: undefined,
        pages: 0,
        source: { kind: "file", file, previousHash: tab.docHash },
        status: "loading",
      });
      void activateTab(id);
    },

    clearTabs: async () => {
      activationEpoch += 1;
      set({ tabs: [], activeTabId: null });
      await useViewer.getState().closeDocument();
      saveTabSnapshot([], null);
    },

    openFileTab: (file) => {
      const id = tabId();
      const previous = get().activeTabId;
      if (previous) captureTab(previous);
      const tab: PdfTab = {
        id,
        name: file.name,
        pages: 0,
        source: { kind: "file", file },
        reading: defaultReading(),
        aiMode: "inherit",
        workspaceId: `workspace:${id}`,
        status: "loading",
        loadedOnce: false,
        createdAt: Date.now(),
        lastActivatedAt: Date.now(),
      };
      set((state) => ({ tabs: [...state.tabs, tab], activeTabId: id }));
      void activateTab(id);
      return id;
    },

    openRecentTab: async (hash, name) => {
      const existing = get().tabs.find(
        (tab) =>
          tab.docHash === hash ||
          (tab.source.kind === "recent" && tab.source.hash === hash) ||
          (tab.source.kind === "relink" && tab.source.previousHash === hash),
      );
      if (existing) {
        if (existing.source.kind === "relink") {
          patchTab(existing.id, {
            name,
            source: { kind: "recent", hash, name },
            status: "loading",
          });
        }
        await get().activateTab(existing.id);
        return existing.id;
      }
      const id = tabId();
      const previous = get().activeTabId;
      if (previous) captureTab(previous);
      const tab: PdfTab = {
        id,
        name,
        docHash: hash,
        pages: 0,
        source: { kind: "recent", hash, name },
        reading: defaultReading(),
        aiMode: "inherit",
        workspaceId: `workspace:${id}`,
        status: "loading",
        loadedOnce: false,
        createdAt: Date.now(),
        lastActivatedAt: Date.now(),
      };
      set((state) => ({ tabs: [...state.tabs, tab], activeTabId: id }));
      await activateTab(id);
      return id;
    },

    activateTab,

    closeTab: async (id) => {
      const state = get();
      const index = state.tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return;
      if (state.activeTabId === id) captureTab(id);
      const remaining = state.tabs.filter((item) => item.id !== id);
      if (state.activeTabId !== id) {
        set({ tabs: remaining });
        return;
      }

      const next = remaining[Math.min(index, remaining.length - 1)] ?? null;
      activationEpoch += 1;
      const mine = activationEpoch;
      set({ tabs: remaining, activeTabId: next?.id ?? null });
      await useViewer.getState().closeDocument();
      if (mine !== activationEpoch) return;
      if (next) await get().activateTab(next.id);
    },

    setTabAiMode: (id, aiMode) => {
      const tab = get().tabs.find((item) => item.id === id);
      if (!tab || tab.aiMode === aiMode) return;
      patchTab(id, {
        aiMode,
        workspaceId: aiMode === "shared" ? SHARED_AI_WORKSPACE_ID : `workspace:${id}`,
      });
    },
  };
});

let tabSaveTimer: ReturnType<typeof setTimeout> | null = null;
const persistTabs = () => {
  const state = useTabs.getState();
  saveTabSnapshot(state.tabs, state.activeTabId);
};
const persistTabsOnHide = () => {
  useViewer.getState().flushPosition();
  const state = useTabs.getState();
  const viewer = useViewer.getState();
  const tabs = state.tabs.map((tab) =>
    tab.id === state.activeTabId && tab.docHash && tab.docHash === viewer.docHash
      ? {
          ...tab,
          reading: {
            ...tab.reading,
            lastPage: viewer.currentPage,
            scrollTop: viewer.scrollTop,
            zoom: viewer.zoom,
            fitMode: viewer.fitMode,
            colorMode: viewer.colorMode,
            colorIntensity: viewer.colorIntensity,
          },
        }
      : tab,
  );
  saveTabSnapshot(tabs, state.activeTabId);
};
useTabs.subscribe((state, previous) => {
  if (state.tabs === previous.tabs && state.activeTabId === previous.activeTabId) return;
  if (tabSaveTimer) clearTimeout(tabSaveTimer);
  tabSaveTimer = setTimeout(() => {
    tabSaveTimer = null;
    persistTabs();
  }, 200);
});
window.addEventListener("pagehide", persistTabsOnHide);

useViewer.subscribe((state, previous) => {
  const activeTabId = useTabs.getState().activeTabId;
  if (!activeTabId) return;
  if (state.docHash && !state.loading && state.docHash !== previous.docHash) {
    useTabs.setState((tabs) => ({
      tabs: tabs.tabs.map((tab) =>
        tab.id === activeTabId
          ? { ...tab, docHash: state.docHash, pages: state.numPages, status: "ready" }
          : tab,
      ),
    }));
  }
  if (
    state.currentPage !== previous.currentPage ||
    state.scrollTop !== previous.scrollTop ||
    state.zoom !== previous.zoom ||
    state.fitMode !== previous.fitMode ||
    state.colorMode !== previous.colorMode ||
    state.colorIntensity !== previous.colorIntensity
  ) {
    const tab = useTabs.getState().tabs.find((item) => item.id === activeTabId);
    if (!tab?.docHash || tab.docHash !== state.docHash) return;
    useTabs.setState((tabs) => ({
      tabs: tabs.tabs.map((item) =>
        item.id === activeTabId
          ? {
              ...item,
              reading: {
                ...item.reading,
                lastPage: state.currentPage,
                scrollTop: state.scrollTop,
                zoom: state.zoom,
                fitMode: state.fitMode,
                colorMode: state.colorMode,
                colorIntensity: state.colorIntensity,
              },
            }
          : item,
      ),
    }));
  }
});
