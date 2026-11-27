import type { Anchor, UsageBuckets } from "../tokens/meter";

export type ChatRole = "user" | "assistant";

export type ThinkingEffort = "none" | "low" | "high" | "max";

export type ToolTrace = {
  id: string;
  name: string;
  label: string;
  phase: "start" | "end" | "error";
  args?: unknown;
  summary?: string;
  durationMs?: number;
  error?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  reasoning?: string;
  status: "streaming" | "done" | "error" | "stopped";
  error?: string;
  errorHint?: string;
  createdAt: number;
  model?: string;
  citedPages?: number[];
  allowedPages?: number[];
  usage?: UsageBuckets;
  /** External tool calls made while producing this answer. */
  tools?: ToolTrace[];
  /** Removed from the model context via right-click; still visible, dimmed. */
  excluded?: boolean;
  /** Textual note about images that were attached to this turn. */
  note?: string;
  /** Source document, used by shared AI workspaces for safe citation jumps. */
  docHash?: string;
  docName?: string;
  sourceTabId?: string;
};

export type Screenshot = {
  id: string;
  page: number;
  dataUrl: string;
  width: number;
  height: number;
  label: string;
  /** Page snapshot or a user-dragged region. */
  kind?: "page" | "region";
};

export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  text?: string;
  dataUrl?: string;
  pages?: number;
  chars?: number;
  kind: "pdf" | "image" | "text";
};

export type Quote = {
  id: string;
  messageId: string;
  role: ChatRole;
  text: string;
  /** Source document, so strict shared chats can reject cross-PDF quotes. */
  docHash?: string;
  docName?: string;
  sourceTabId?: string;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  model: string;
  anchor: Anchor | null;
};

export type SelectionSource = "ocr" | "mixed";

export type Selection = {
  page: number;
  text: string;
  /** Set when any part of the selection came from the OCR text layer. */
  source?: SelectionSource;
  /** Multiple pages when the browser selection crosses page boundaries. */
  pages?: Array<{ page: number; text: string; source?: SelectionSource }>;
};

/** Locally selected, question-relevant excerpts from a long document. */
export type SmartContext = {
  /** Pages that contributed at least one excerpt. */
  pages: number[];
  /** Prompt-ready text with <<<PAGE n>>> markers. */
  text: string;
  /** Number of ranked chunks kept (may be fewer after interval merging). */
  chunks: number;
  chars: number;
  /** Pages scanned by BM25 (capped for very long documents). */
  scannedPages: number;
  /** Total pages in the document when the filter ran. */
  totalPages: number;
  query: string;
};

export type ContextState = {
  currentPage: number | null;
  currentPageText: string;
  pageRange: number[] | null;
  pageRangeText: string;
  selection: Selection | null;
  screenshots: Screenshot[];
  attachments: Attachment[];
  quotes: Quote[];
  smart?: SmartContext | null;
};

export type ServerConfig = {
  mode: string;
  model: string;
  models: string[];
  baseUrlHost: string;
  baseUrl?: string;
  modelAllow?: string[];
  keyHint?: string;
  mock?: boolean;
  origin?: string;
  hasKey: boolean;
  budget: { input: number; output: number };
  contextWindow: number;
};

export type AiError = {
  code: string;
  message: string;
  hint?: string;
  status?: number;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "usage"; usage: unknown }
  | { type: "tool"; tool: ToolTrace }
  | { type: "done" }
  | { type: "error"; error: AiError };

export type ImagePart = { type: "image_url"; image_url: { url: string; detail?: string } };
export type TextPart = { type: "text"; text: string };
export type ContentPart = TextPart | ImagePart;

export type ApiMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export type BuiltRequest = {
  messages: ApiMessage[];
  allowedPages: number[];
  system: string;
  context: string;
  historyText: string[];
  question: string;
  imageCount: number;
};
