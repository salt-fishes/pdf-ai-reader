import { isColorMode } from "../../lib/reading/color";
import type { PdfTab, PdfTabReading, PdfTabSource } from "./useTabStore";

const TABS_STORAGE_KEY = "pdf-ai-reader:tabs:v1";
const MAX_TABS = 20;

type StoredPdfTab = Omit<PdfTab, "source"> & {
  source: Extract<PdfTabSource, { kind: "recent" | "relink" }>;
};

type TabSnapshot = { tabs: StoredPdfTab[]; activeTabId: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readingFrom(value: unknown): PdfTabReading | null {
  if (!isRecord(value) || !isColorMode(value.colorMode)) return null;
  if (value.fitMode !== "width" && value.fitMode !== "page" && value.fitMode !== "custom") {
    return null;
  }
  return {
    lastPage: Math.max(1, Math.round(finiteNumber(value.lastPage, 1))),
    scrollTop: Math.max(0, finiteNumber(value.scrollTop, 0)),
    zoom: Math.max(0.1, finiteNumber(value.zoom, 1)),
    fitMode: value.fitMode,
    colorMode: value.colorMode,
    colorIntensity: Math.max(0, Math.min(100, finiteNumber(value.colorIntensity, 100))),
  };
}

function tabFrom(value: unknown): StoredPdfTab | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const reading = readingFrom(value.reading);
  if (!reading || !isRecord(value.source)) return null;
  let source: StoredPdfTab["source"];
  if (
    value.source.kind === "recent" &&
    typeof value.source.hash === "string" &&
    typeof value.source.name === "string"
  ) {
    source = { kind: "recent", hash: value.source.hash, name: value.source.name };
  } else if (value.source.kind === "relink" && typeof value.source.name === "string") {
    source = {
      kind: "relink",
      name: value.source.name,
      previousHash:
        typeof value.source.previousHash === "string" ? value.source.previousHash : undefined,
    };
  } else {
    return null;
  }
  const aiMode =
    value.aiMode === "isolated" || value.aiMode === "shared" ? value.aiMode : "inherit";
  return {
    id: value.id,
    name: value.name,
    docHash: typeof value.docHash === "string" ? value.docHash : undefined,
    pages: Math.max(0, Math.round(finiteNumber(value.pages, 0))),
    source,
    reading,
    aiMode,
    workspaceId:
      typeof value.workspaceId === "string" ? value.workspaceId : `workspace:${value.id}`,
    status: source.kind === "relink" ? "relink" : "ready",
    loadedOnce: value.loadedOnce !== false,
    createdAt: finiteNumber(value.createdAt, Date.now()),
    lastActivatedAt: finiteNumber(value.lastActivatedAt, Date.now()),
  };
}

export function loadTabSnapshot(): TabSnapshot | null {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs
      .slice(0, MAX_TABS)
      .map(tabFrom)
      .filter((tab): tab is StoredPdfTab => tab !== null);
    const activeTabId =
      typeof parsed.activeTabId === "string" && tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : (tabs[0]?.id ?? null);
    return { tabs, activeTabId };
  } catch {
    return null;
  }
}

export function saveTabSnapshot(tabs: PdfTab[], activeTabId: string | null): void {
  const stored: StoredPdfTab[] = tabs.slice(0, MAX_TABS).map((tab) => {
    let source: StoredPdfTab["source"];
    if (tab.source.kind === "recent") {
      source = tab.source;
    } else if (
      tab.source.kind === "file" &&
      tab.docHash &&
      tab.source.file.size <= 24 * 1024 * 1024
    ) {
      source = { kind: "recent", hash: tab.docHash, name: tab.name };
    } else {
      source = {
        kind: "relink",
        name: tab.name,
        previousHash:
          tab.source.kind === "file" ? (tab.source.previousHash ?? tab.docHash) : tab.docHash,
      };
    }
    return { ...tab, source };
  });
  try {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify({ tabs: stored, activeTabId }));
  } catch {
    // Tab recovery is best-effort when storage is unavailable.
  }
}

export function clearStoredTabs(): void {
  try {
    localStorage.removeItem(TABS_STORAGE_KEY);
  } catch {
    // ignore
  }
}
