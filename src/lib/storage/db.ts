import { clear, get, set } from "idb-keyval";
import type { ColorMode } from "../reading/color";
import type { OcrModelId } from "../ocr/client";
import type { ShortcutBinding } from "../shortcuts";

export type DocumentRecord = {
  hash: string;
  name: string;
  pages: number;
  lastPage: number;
  zoom: number;
  /** New records store CSS-scale (100% = 96dpi). Older ones used viewport scale. */
  zoomUnits?: "css";
  scrollTop: number;
  updatedAt?: number;
};

export type StoredChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: unknown[];
  model: string;
  anchor: unknown;
};

export type ChatRecord = {
  hash: string;
  sessions?: StoredChatSession[];
  activeId?: string;
  /** Legacy single-session fields; read for migration only. */
  messages?: unknown[];
  model?: string;
  anchor?: unknown;
  updatedAt?: number;
};

export type OcrRecord = {
  hash: string;
  pages: Record<string, string>;
  updatedAt?: number;
};

/** One OCR line, normalized to 0–1 inside the rendered page. */
export type StoredOcrLine = {
  text: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OcrPageRecord = {
  hash: string;
  page: number;
  text: string;
  lines: StoredOcrLine[];
  model: string;
  /** Dimensions of the image used for OCR; useful for debugging alignment. */
  imageWidth: number;
  imageHeight: number;
  updatedAt?: number;
};

export type OcrIndexRecord = {
  hash: string;
  pages: number[];
  updatedAt?: number;
};

export type PageMetricsRecord = {
  hash: string;
  /** [width, height] in PDF units, one entry per page. */
  sizes: Array<[number, number]>;
  updatedAt?: number;
};

export type RecentDocumentRecord = {
  hash: string;
  name: string;
  pages: number;
  size: number;
  updatedAt: number;
  /** Cached bytes for small files, so they can be reopened without a picker. */
  data?: ArrayBuffer;
};

export type RecentDocumentMeta = Omit<RecentDocumentRecord, "data">;

export type SummaryChunk = {
  start: number;
  end: number;
  text: string;
  updatedAt: number;
};

export type SummaryRecord = {
  hash: string;
  /** Keyed by model + page range so switching models doesn't reuse stale text. */
  chunks: Record<string, SummaryChunk>;
  updatedAt?: number;
};

export type StoredHighlight = {
  id: string;
  page: number;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  text: string;
  source?: "ocr" | "mixed";
  createdAt: number;
};

export type HighlightsRecord = {
  hash: string;
  highlights: StoredHighlight[];
  updatedAt?: number;
};

const docKey = (hash: string) => `doc:${hash}`;
const chatKey = (hash: string) => `chat:${hash}`;
const ocrKey = (hash: string) => `ocr:${hash}`;
const ocrPageKey = (hash: string, page: number) => `ocrpage:${hash}:${page}`;
const ocrIndexKey = (hash: string) => `ocrindex:${hash}`;
const pageMetricsKey = (hash: string) => `metrics:${hash}`;
const recentKey = "recent:documents:v1";
const summaryKey = (hash: string) => `summary:${hash}`;
const highlightsKey = (hash: string) => `highlights:${hash}`;

export async function loadDocumentRecord(hash: string): Promise<DocumentRecord | null> {
  return (await get<DocumentRecord>(docKey(hash))) ?? null;
}

export async function saveDocumentRecord(record: DocumentRecord): Promise<void> {
  await set(docKey(record.hash), { ...record, updatedAt: Date.now() });
}

export async function loadChatRecord(hash: string): Promise<ChatRecord | null> {
  return (await get<ChatRecord>(chatKey(hash))) ?? null;
}

export async function saveChatRecord(record: ChatRecord): Promise<void> {
  await set(chatKey(record.hash), { ...record, updatedAt: Date.now() });
}

export async function clearChatRecord(hash: string): Promise<void> {
  await set(chatKey(hash), null);
}

export async function loadOcrRecord(hash: string): Promise<OcrRecord | null> {
  return (await get<OcrRecord>(ocrKey(hash))) ?? null;
}

export async function saveOcrRecord(record: OcrRecord): Promise<void> {
  await set(ocrKey(record.hash), { ...record, updatedAt: Date.now() });
}

export async function loadOcrPage(hash: string, page: number): Promise<OcrPageRecord | null> {
  return (await get<OcrPageRecord>(ocrPageKey(hash, page))) ?? null;
}

export async function loadOcrIndex(hash: string): Promise<OcrIndexRecord | null> {
  return (await get<OcrIndexRecord>(ocrIndexKey(hash))) ?? null;
}

export async function saveOcrPage(record: OcrPageRecord): Promise<void> {
  await set(ocrPageKey(record.hash, record.page), {
    ...record,
    updatedAt: Date.now(),
  });
  const index = (await loadOcrIndex(record.hash)) ?? { hash: record.hash, pages: [] };
  if (!index.pages.includes(record.page)) {
    await set(ocrIndexKey(record.hash), {
      hash: record.hash,
      pages: [...index.pages, record.page].sort((a, b) => a - b),
      updatedAt: Date.now(),
    });
  }
}

export async function loadPageMetrics(hash: string): Promise<PageMetricsRecord | null> {
  return (await get<PageMetricsRecord>(pageMetricsKey(hash))) ?? null;
}

export async function savePageMetrics(record: PageMetricsRecord): Promise<void> {
  await set(pageMetricsKey(record.hash), { ...record, updatedAt: Date.now() });
}

export async function loadRecentDocuments(): Promise<RecentDocumentRecord[]> {
  return (await get<RecentDocumentRecord[]>(recentKey)) ?? [];
}

export async function saveRecentDocuments(records: RecentDocumentRecord[]): Promise<void> {
  await set(recentKey, records);
}

export async function recordRecentDocument(
  record: RecentDocumentRecord,
): Promise<RecentDocumentRecord[]> {
  const current = await loadRecentDocuments();
  const next = [record, ...current.filter((item) => item.hash !== record.hash)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);
  const fitted = fitRecentBudget(next);
  await saveRecentDocuments(fitted);
  return fitted;
}

export const RECENT_TOTAL_BUDGET = 64 * 1024 * 1024;

/**
 * Keeps the newest eight records, then drops cached bytes from the oldest
 * entries until the total cache fits the 64 MB budget. Metadata stays so the
 * document still appears in the recent list and can ask for a fresh pick.
 */
export function fitRecentBudget(
  records: RecentDocumentRecord[],
  budget = RECENT_TOTAL_BUDGET,
): RecentDocumentRecord[] {
  const next = records.map((item) => ({ ...item }));
  let total = next.reduce((sum, item) => sum + (item.data?.byteLength ?? 0), 0);
  for (let index = next.length - 1; index >= 0 && total > budget; index -= 1) {
    const data = next[index].data;
    if (!data) continue;
    total -= data.byteLength;
    delete next[index].data;
  }
  return next;
}

export async function loadRecentBytes(hash: string): Promise<RecentDocumentRecord | null> {
  const records = await loadRecentDocuments();
  return records.find((item) => item.hash === hash) ?? null;
}

export async function loadSummaryRecord(hash: string): Promise<SummaryRecord | null> {
  return (await get<SummaryRecord>(summaryKey(hash))) ?? null;
}

export async function saveSummaryRecord(record: SummaryRecord): Promise<void> {
  await set(summaryKey(record.hash), { ...record, updatedAt: Date.now() });
}

export async function clearSummaryRecord(hash: string): Promise<void> {
  await set(summaryKey(hash), null);
}

export async function loadHighlightsRecord(hash: string): Promise<HighlightsRecord | null> {
  return (await get<HighlightsRecord>(highlightsKey(hash))) ?? null;
}

export async function saveHighlightsRecord(record: HighlightsRecord): Promise<void> {
  await set(highlightsKey(record.hash), { ...record, updatedAt: Date.now() });
}

export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const SETTINGS_KEY = "pdf-ai-reader:settings:v1";
export const DB_VERSION = 2;
const DB_META_KEY = "meta:db";

export type DbMeta = { version: number; updatedAt: number };

export async function loadDbMeta(): Promise<DbMeta | null> {
  return (await get<DbMeta>(DB_META_KEY)) ?? null;
}

export async function saveDbMeta(meta: DbMeta): Promise<void> {
  await set(DB_META_KEY, meta);
}

/**
 * Bump-only migration. Version 2 trims the recent-document cache to the 64MB
 * budget and records the schema version; version 1 had no metadata key.
 */
export async function migrateLocalData(): Promise<void> {
  const meta = await loadDbMeta();
  if (meta && meta.version >= DB_VERSION) return;
  const recent = await loadRecentDocuments();
  await saveRecentDocuments(fitRecentBudget(recent));
  await saveDbMeta({ version: DB_VERSION, updatedAt: Date.now() });
}

export type StoredSettings = {
  assistantStatus?: "minimized" | "closed";
  assistantMode?: "float" | "sidebar";
  panel?: { left: number; top: number; width: number; height: number; docked: boolean };
  model?: string;
  /** Legacy reading theme, migrated to colorMode on load. */
  theme?: "paper" | "eye" | "night";
  colorMode?: ColorMode;
  colorIntensity?: number;
  thinking?: "none" | "low" | "high" | "max";
  contextBudget?: number;
  historyLimit?: number;
  pricing?: { inputMiss: number; inputHit: number; output: number };
  shortcuts?: Partial<Record<string, ShortcutBinding[]>>;
  showShortcuts?: boolean;
  ocrTextLayer?: boolean;
  ocrModel?: OcrModelId;
};

export function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as StoredSettings) : {};
  } catch {
    return {};
  }
}

export function saveSettings(patch: StoredSettings): void {
  try {
    const next = { ...loadSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // storage may be unavailable in private mode; ignore.
  }
}

export async function clearAllLocalData(): Promise<void> {
  await clear();
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // ignore
  }
  window.location.reload();
}
