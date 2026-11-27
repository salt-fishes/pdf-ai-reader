import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export const PDF_ASSETS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  iccUrl: "/pdfjs/iccs/",
};

type Pdfjs = typeof import("pdfjs-dist");
type LoadingTask = { destroy: () => Promise<void> };
type TextLayerHandle = { cancel: () => void };

let pdfjs: Pdfjs | null = null;

async function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjs) {
    pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }
  return pdfjs;
}

let session: {
  doc: PDFDocumentProxy;
  task: LoadingTask;
} | null = null;

let generation = 0;

const nativeTextCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<string>>>();
const ocrTextCache = new WeakMap<PDFDocumentProxy, Map<number, string>>();
const pageSizeCache = new WeakMap<
  PDFDocumentProxy,
  Map<number, { width: number; height: number }>
>();
const thumbCache = new WeakMap<PDFDocumentProxy, Map<number, string>>();
const THUMB_CACHE_LIMIT = 160;

function clearDocumentCaches(doc: PDFDocumentProxy) {
  nativeTextCache.get(doc)?.clear();
  ocrTextCache.get(doc)?.clear();
  pageSizeCache.get(doc)?.clear();
  thumbCache.get(doc)?.clear();
}

export function getActiveDocument(): PDFDocumentProxy | null {
  return session?.doc ?? null;
}

export async function openPdf(bytes: ArrayBuffer, password?: string): Promise<PDFDocumentProxy> {
  const mine = ++generation;
  const { getDocument } = await loadPdfjs();
  const loadingTask = getDocument({
    // pdf.js transfers this view to its worker. The caller keeps the File (not
    // the ArrayBuffer), so password retries can read a fresh copy only when needed.
    data: new Uint8Array(bytes),
    ...PDF_ASSETS,
    useSystemFonts: true,
  });
  let passwordRejected: Promise<never> | null = null;
  if (password !== undefined) {
    let attempts = 0;
    let rejectPassword: ((error: Error) => void) | null = null;
    passwordRejected = new Promise<never>((_, reject) => {
      rejectPassword = reject;
    });
    loadingTask.onPassword = (updatePassword: (value: string) => void) => {
      attempts += 1;
      if (attempts > 1) {
        const error = new DOMException("密码不正确", "PasswordException");
        rejectPassword?.(error);
        void loadingTask.destroy().catch(() => undefined);
        return;
      }
      updatePassword(password);
    };
  }
  const doc = await (
    passwordRejected ? Promise.race([loadingTask.promise, passwordRejected]) : loadingTask.promise
  ).catch((error) => {
    void loadingTask.destroy().catch(() => undefined);
    throw error;
  });
  if (mine !== generation) {
    // Another document was opened while this one was parsing.
    loadingTask.destroy().catch(() => {});
    throw new DOMException("Superseded by a newer document", "AbortError");
  }
  if (session) {
    clearDocumentCaches(session.doc);
    session.task.destroy().catch(() => {});
  }
  session = { doc, task: loadingTask };
  return doc;
}

export async function closePdf(): Promise<void> {
  generation += 1;
  const current = session;
  session = null;
  if (current) {
    clearDocumentCaches(current.doc);
    await current.task.destroy().catch(() => {});
  }
}

export async function getPage(pdf: PDFDocumentProxy, pageNumber: number): Promise<PDFPageProxy> {
  return pdf.getPage(pageNumber);
}

export async function getPageSize(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<{ width: number; height: number }> {
  let cache = pageSizeCache.get(pdf);
  if (!cache) {
    cache = new Map();
    pageSizeCache.set(pdf, cache);
  }
  const hit = cache.get(pageNumber);
  if (hit) return hit;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const size = { width: viewport.width, height: viewport.height };
  cache.set(pageNumber, size);
  return size;
}

function normalizeText(raw: string): string {
  return (
    raw
      // PDF text objects legitimately contain NUL padding.
      // eslint-disable-next-line no-control-regex
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

export function getNativePageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  let cache = nativeTextCache.get(pdf);
  if (!cache) {
    cache = new Map();
    nativeTextCache.set(pdf, cache);
  }
  const hit = cache.get(pageNumber);
  if (hit) return hit;

  const pending = pdf
    .getPage(pageNumber)
    .then((page) => page.getTextContent())
    .then((content) => {
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        if (item.hasEOL) text += "\n";
      }
      const normalized = normalizeText(text);
      cache.set(pageNumber, Promise.resolve(normalized));
      return normalized;
    });
  cache.set(pageNumber, pending);
  void pending.catch(() => {
    if (cache.get(pageNumber) === pending) cache.delete(pageNumber);
  });
  return pending;
}

export async function getPageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const ocr = ocrTextCache.get(pdf)?.get(pageNumber);
  if (ocr != null) return ocr;
  return getNativePageText(pdf, pageNumber);
}

/** OCR text overrides the native layer for search, prompts and BM25. */
export function setPageText(pdf: PDFDocumentProxy, pageNumber: number, text: string): void {
  let cache = ocrTextCache.get(pdf);
  if (!cache) {
    cache = new Map();
    ocrTextCache.set(pdf, cache);
  }
  cache.set(pageNumber, normalizeText(text));
}

export async function getPagesText(
  pdf: PDFDocumentProxy,
  pages: number[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ text: string; chars: number; pages: number[] }> {
  const ordered = [...pages].sort((a, b) => a - b);
  const parts: string[] = [];
  let done = 0;
  let chars = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const number = ordered[index];
    const text = await getPageText(pdf, number);
    parts.push(`<<<PAGE ${number}>>>\n${text}`);
    chars += text.length;
    done += 1;
    onProgress?.(done, ordered.length);
    if (index % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { text: parts.join("\n\n"), chars, pages: ordered };
}

export type RenderResult = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
};

export async function renderPageToCanvas(
  page: PDFPageProxy,
  scale: number,
  dpr = Math.min(window.devicePixelRatio || 1, 2),
): Promise<RenderResult> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
  canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("无法创建 Canvas 上下文");
  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    background: "#ffffff",
  }).promise;
  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    cssWidth: viewport.width,
    cssHeight: viewport.height,
  };
}

export async function attachTextLayer(
  page: PDFPageProxy,
  container: HTMLElement,
  viewport: PageViewport,
): Promise<TextLayerHandle> {
  const { TextLayer } = await loadPdfjs();
  container.replaceChildren();
  // pdf.js viewer normally inherits these from .page; without them the text
  // layer keeps the UI font size (13px) and selection boxes drift from the
  // rendered glyphs.
  container.style.setProperty("--total-scale-factor", String(viewport.scale));
  container.style.setProperty("--scale-round-x", "1px");
  container.style.setProperty("--scale-round-y", "1px");
  const layer = new TextLayer({
    textContentSource: page.streamTextContent({ includeMarkedContent: true }),
    container,
    viewport,
  });
  await layer.render();
  return layer;
}

export async function renderPageImage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxEdge = 1568,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.2, Math.max(1, maxEdge / Math.max(base.width, base.height)));
  const result = await renderPageToCanvas(page, scale, 1);
  const dataUrl = result.canvas.toDataURL("image/jpeg", 0.86);
  return { dataUrl, width: result.canvas.width, height: result.canvas.height };
}

/**
 * Render a page to a JPEG Blob for the OCR endpoint. Blob uploads avoid the
 * base64 expansion and let the server transfer the bytes to its worker.
 */
export async function renderPageImageBlob(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxEdge = 1600,
): Promise<{ blob: Blob; width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.2, Math.max(1, maxEdge / Math.max(base.width, base.height)));
  const result = await renderPageToCanvas(page, scale, 1);
  const blob = await new Promise<Blob | null>((resolve) => {
    result.canvas.toBlob(resolve, "image/jpeg", 0.86);
  });
  if (!blob) throw new Error("无法生成页面图片");
  return { blob, width: result.canvas.width, height: result.canvas.height };
}

export type PageLink = {
  id: string;
  /** Normalized 0–1 rectangle inside the rendered page. */
  rect: { x: number; y: number; w: number; h: number };
  url?: string;
  page?: number;
  title: string;
};

type RawAnnotation = {
  id?: string;
  subtype?: string;
  rect?: number[];
  url?: string;
  unsafeUrl?: string;
  dest?: string | unknown[] | null;
};

async function destinationPage(
  pdf: PDFDocumentProxy,
  dest: string | unknown[] | null | undefined,
): Promise<number | null> {
  if (!dest) return null;
  const resolved = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
  if (!Array.isArray(resolved) || !resolved.length) return null;
  const ref = resolved[0];
  if (!ref || typeof ref !== "object") return null;
  try {
    const index = await pdf.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
    return Number.isInteger(index) ? index + 1 : null;
  } catch {
    return null;
  }
}

function safeLinkUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^(https?:|mailto:)/i.test(value) ? value : undefined;
}

export async function getPageLinks(
  pdf: PDFDocumentProxy,
  page: PDFPageProxy,
  viewport: PageViewport,
): Promise<PageLink[]> {
  const annotations = (await page.getAnnotations({
    intent: "display",
  })) as unknown as RawAnnotation[];
  const links: PageLink[] = [];
  for (const annotation of annotations) {
    if (annotation.subtype !== "Link" || !annotation.rect) continue;
    const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
    const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    if (width < 1 || height < 1) continue;
    const url = safeLinkUrl(annotation.url ?? annotation.unsafeUrl);
    const target = await destinationPage(pdf, annotation.dest);
    if (!url && !target) continue;
    links.push({
      id: `${annotation.id ?? links.length}`,
      rect: {
        x: left / viewport.width,
        y: top / viewport.height,
        w: width / viewport.width,
        h: height / viewport.height,
      },
      url,
      page: target ?? undefined,
      title: url ?? (target ? `跳到第 ${target} 页` : "链接"),
    });
  }
  return links;
}

export type ImageRect = { x: number; y: number; w: number; h: number };

/** Small cached JPEG for the pages sidebar. */
export async function renderPageThumbnail(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxEdge = 220,
): Promise<string> {
  let cache = thumbCache.get(pdf);
  if (!cache) {
    cache = new Map();
    thumbCache.set(pdf, cache);
  }
  const hit = cache.get(pageNumber);
  if (hit) return hit;

  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1, maxEdge / Math.max(base.width, base.height));
  const result = await renderPageToCanvas(page, scale, 1);
  const dataUrl = result.canvas.toDataURL("image/jpeg", 0.72);
  cache.set(pageNumber, dataUrl);
  while (cache.size > THUMB_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return dataUrl;
}

/** Crop a normalized region out of a rendered page image. */
export async function cropImageDataUrl(
  dataUrl: string,
  rect: ImageRect,
  maxEdge = 1600,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const left = Math.min(Math.max(0, rect.x), 1);
  const top = Math.min(Math.max(0, rect.y), 1);
  const right = Math.min(1, left + Math.max(0.001, rect.w));
  const bottom = Math.min(1, top + Math.max(0.001, rect.h));

  const sx = Math.round(left * width);
  const sy = Math.round(top * height);
  const sw = Math.max(1, Math.min(width - sx, Math.round((right - left) * width)));
  const sh = Math.max(1, Math.min(height - sy, Math.round((bottom - top) * height)));

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const outWidth = Math.max(1, Math.round(sw * scale));
  const outHeight = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建裁剪画布");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, sw, sh, 0, 0, outWidth, outHeight);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    width: outWidth,
    height: outHeight,
  };
}

export type FlatOutlineItem = {
  title: string;
  page: number | null;
  depth: number;
};

export async function getOutline(pdf: PDFDocumentProxy): Promise<FlatOutlineItem[]> {
  const raw = await pdf.getOutline();
  if (!raw) return [];
  const flat: FlatOutlineItem[] = [];

  const resolve = async (dest: string | unknown[] | null): Promise<number | null> => {
    try {
      const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || explicit.length === 0) return null;
      const ref = explicit[0];
      const index = await pdf.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
      return index + 1;
    } catch {
      return null;
    }
  };

  const walk = async (
    items: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>,
    depth: number,
  ) => {
    if (!items) return;
    for (const item of items) {
      flat.push({ title: item.title, page: await resolve(item.dest), depth });
      if (item.items?.length) await walk(item.items, depth + 1);
    }
  };

  await walk(raw, 0);
  return flat;
}

export async function extractPdfText(
  bytes: ArrayBuffer,
  maxPages = 40,
): Promise<{ pages: number; chars: number; text: string; truncated: boolean }> {
  const { getDocument } = await loadPdfjs();
  const task = getDocument({ data: new Uint8Array(bytes), ...PDF_ASSETS, useSystemFonts: true });
  try {
    const doc = await task.promise;
    const count = Math.min(doc.numPages, maxPages);
    const chunks: string[] = [];
    let chars = 0;
    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      let raw = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        raw += item.str;
        if (item.hasEOL) raw += "\n";
      }
      const text = normalizeText(raw);
      chunks.push(`<<<PAGE ${pageNumber}>>>\n${text}`);
      chars += text.length;
    }
    return {
      pages: doc.numPages,
      chars,
      text: chunks.join("\n\n"),
      truncated: doc.numPages > count,
    };
  } finally {
    await task.destroy().catch(() => {});
  }
}
