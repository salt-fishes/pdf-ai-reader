import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getActiveDocument, getPageSize } from "../../lib/pdf/pdf";
import { PDF_TO_CSS_UNITS } from "../../lib/pdf/units";
import { loadPageMetrics, savePageMetrics } from "../../lib/storage/db";
import { pickPdfFile } from "../../lib/openFile";
import { BrandMark } from "../../components/icons/SparkleIcon";
import { useOcr } from "../ocr/useOcrStore";
import { pageAnchorMemory, useViewer } from "./useViewerStore";
import { PageView } from "./PageView";
import styles from "./PdfViewer.module.css";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PAGE_GAP = 28;
const PADDING_TOP = 28;
const OVERSCAN = 4800;

function pageOfNode(node: Node): HTMLElement | null {
  const element =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null);
  return element?.closest<HTMLElement>("[data-page]") ?? null;
}

function selectionPageRects(
  range: Range,
  pageElement: HTMLElement,
): Array<{ x: number; y: number; w: number; h: number }> {
  const pageRect = pageElement.getBoundingClientRect();
  if (!pageRect.width || !pageRect.height) return [];
  return [...range.getClientRects()]
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => ({
      x: (rect.left - pageRect.left) / pageRect.width,
      y: (rect.top - pageRect.top) / pageRect.height,
      w: rect.width / pageRect.width,
      h: rect.height / pageRect.height,
    }))
    .filter((rect) => rect.x > -0.05 && rect.x < 1.05 && rect.y > -0.05 && rect.y < 1.05);
}

type PageSelection = {
  page: number;
  text: string;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  source?: "ocr" | "mixed";
};

function mergeSource(
  current: PageSelection["source"],
  next: PageSelection["source"],
): PageSelection["source"] {
  if (!current) return next;
  if (!next || current === next) return current;
  return "mixed";
}

function collectPageSelection(range: Range): PageSelection[] {
  const root = range.commonAncestorContainer;
  const rootElement =
    root.nodeType === Node.TEXT_NODE ? root.parentElement : (root as HTMLElement | null);
  if (!rootElement) return [];
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
  const byPage = new Map<number, PageSelection>();
  let node: Node | null;
  let lastOcrLine: Element | null = null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    if (!textNode.nodeValue || !range.intersectsNode(textNode)) continue;
    const pageElement = pageOfNode(textNode);
    const page = Number(pageElement?.dataset.page);
    if (!pageElement || !page) continue;
    const start = textNode === range.startContainer ? range.startOffset : 0;
    const end = textNode === range.endContainer ? range.endOffset : textNode.nodeValue.length;
    if (end <= start) continue;
    const sub = document.createRange();
    sub.setStart(textNode, Math.max(0, Math.min(start, textNode.nodeValue.length)));
    sub.setEnd(textNode, Math.max(0, Math.min(end, textNode.nodeValue.length)));
    const text = sub.toString();
    if (!text) continue;

    const ocrLine = textNode.parentElement?.closest("[data-ocr-line]") ?? null;
    const source: PageSelection["source"] = ocrLine ? "ocr" : undefined;
    const prefix = ocrLine && lastOcrLine && ocrLine !== lastOcrLine ? "\n" : "";
    lastOcrLine = ocrLine;

    const existing = byPage.get(page);
    if (existing) {
      existing.text += `${prefix}${text}`;
      existing.rects.push(...selectionPageRects(sub, pageElement));
      existing.source = mergeSource(existing.source, source);
    } else {
      byPage.set(page, {
        page,
        text,
        rects: selectionPageRects(sub, pageElement),
        source,
      });
    }
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

export function PdfViewer() {
  const docName = useViewer((state) => state.docName);
  const docHash = useViewer((state) => state.docHash);
  const numPages = useViewer((state) => state.numPages);
  const zoom = useViewer((state) => state.zoom);
  const fitMode = useViewer((state) => state.fitMode);
  const loading = useViewer((state) => state.loading);
  const progress = useViewer((state) => state.progress);
  const error = useViewer((state) => state.error);
  const colorMode = useViewer((state) => state.colorMode);
  const surface =
    colorMode === "eye"
      ? styles.eye
      : colorMode === "grayscale"
        ? styles.gray
        : colorMode === "invert" || colorMode === "smart"
          ? styles.night
          : "";
  const scrollTarget = useViewer((state) => state.scrollTarget);
  const restoreScrollTop = useViewer((state) => state.restoreScrollTop);
  const clearRestoreScroll = useViewer((state) => state.clearRestoreScroll);
  const currentPage = useViewer((state) => state.currentPage);
  const regionPage = useViewer((state) => state.regionPage);
  const ocrInit = useOcr((state) => state.init);
  const openFile = useViewer((state) => state.openFile);
  const recent = useViewer((state) => state.recent);
  const openRecent = useViewer((state) => state.openRecent);
  const refreshRecent = useViewer((state) => state.refreshRecent);
  const setZoom = useViewer((state) => state.setZoom);
  const setCurrentPage = useViewer((state) => state.setCurrentPage);
  const savePosition = useViewer((state) => state.savePosition);
  const setSelection = useViewer((state) => state.setSelection);

  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const scrollRaf = useRef(0);
  const [sizeHint, setSizeHint] = useState({ width: 612, height: 792 });
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);
  const pageSizesRef = useRef<Array<{ width: number; height: number }>>([]);
  const pendingShift = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const applyPageSizes = useCallback(
    (next: Array<{ width: number; height: number }>) => {
      const previous = pageSizesRef.current;
      if (previous.length === next.length && viewportRef.current) {
        const index = Math.max(0, useViewer.getState().currentPage - 1);
        const scale = useViewer.getState().zoom * PDF_TO_CSS_UNITS;
        let delta = 0;
        for (let i = 0; i < index; i += 1) {
          delta += (next[i].height - previous[i].height) * scale;
        }
        if (delta !== 0) pendingShift.current += delta;
      }
      pageSizesRef.current = next;
      setPageSizes(next);
    },
    [],
  );

  useEffect(() => {
    void ocrInit();
    void refreshRecent();
  }, [ocrInit, refreshRecent]);

  useEffect(() => {
    if (!docHash) return;
    useOcr.getState().reset(docHash);
  }, [docHash]);

  // Load cached page sizes first, then measure the rest in small background
  // batches. The prefix sums feed both virtualization and exact jumps.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = 0;
      setScrollTop(0);
      setViewportHeight(viewport.clientHeight);
    }
    if (!docHash || !numPages) {
      pageSizesRef.current = [];
      setPageSizes([]);
      return;
    }
    const pdf = getActiveDocument();
    if (!pdf) return;

    let alive = true;
    const uniform = Array.from({ length: numPages }, () => ({
      width: sizeHint.width,
      height: sizeHint.height,
    }));
    pageSizesRef.current = uniform;
    setPageSizes(uniform);

    void (async () => {
      const first = await getPageSize(pdf, 1).catch(() => sizeHint);
      if (!alive) return;
      setSizeHint(first);
      let sizes = uniform.map(() => ({ ...first }));

      const cached = await loadPageMetrics(docHash).catch(() => null);
      if (!alive) return;
      if (cached && cached.sizes.length === numPages) {
        sizes = cached.sizes.map(([width, height]) => ({ width, height }));
        applyPageSizes(sizes);
        return;
      }
      applyPageSizes(sizes);

      const measured = sizes.slice();
      for (let start = 0; start < numPages; start += 48) {
        if (!alive) return;
        const count = Math.min(48, numPages - start);
        const chunk = await Promise.all(
          Array.from({ length: count }, (_, offset) =>
            getPageSize(pdf, start + offset + 1).catch(() => first),
          ),
        );
        if (!alive) return;
        for (let index = 0; index < chunk.length; index += 1) {
          measured[start + index] = chunk[index];
        }
        applyPageSizes(measured.slice());
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (alive) {
        void savePageMetrics({
          hash: docHash,
          sizes: measured.map((size) => [size.width, size.height]),
        }).catch(() => undefined);
      }
    })();

    return () => {
      alive = false;
    };
  }, [docHash, numPages, applyPageSizes]);

  const scale = zoom * PDF_TO_CSS_UNITS;
  const layout = useMemo(() => {
    const heights = Array.from(
      { length: numPages },
      (_, index) => (pageSizes[index]?.height ?? sizeHint.height) * scale,
    );
    const itemHeights = heights.map((height) => height + PAGE_GAP);
    const prefix = new Array<number>(numPages + 1).fill(0);
    for (let index = 0; index < numPages; index += 1) {
      prefix[index + 1] = prefix[index] + itemHeights[index];
    }
    return { heights, itemHeights, prefix, total: prefix[numPages] };
  }, [pageSizes, numPages, scale, sizeHint.height]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !pendingShift.current) return;
    viewport.scrollTop += pendingShift.current;
    pendingShift.current = 0;
  }, [pageSizes]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      setViewportHeight(viewport.clientHeight);
    });
    observer.observe(viewport);
    setViewportHeight(viewport.clientHeight);
    return () => observer.disconnect();
  }, []);

  const fitNonce = useViewer((state) => state.fitNonce);

  useEffect(() => {
    if ((fitMode !== "width" && fitMode !== "page") || !numPages) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    let alive = true;

    const apply = async () => {
      const pdf = getActiveDocument();
      if (!pdf) return;
      const size = await getPageSize(pdf, 1);
      if (!alive) return;
      const availableWidth = Math.max(280, viewport.clientWidth - 88);
      const availableHeight = Math.max(280, viewport.clientHeight - 88);
      const widthScale = availableWidth / size.width / PDF_TO_CSS_UNITS;
      const heightScale = availableHeight / size.height / PDF_TO_CSS_UNITS;
      const scale = fitMode === "width" ? widthScale : Math.min(widthScale, heightScale);
      setZoom(Math.min(3, Math.max(0.5, scale)), fitMode);
    };

    void apply();
    const observer = new ResizeObserver(() => void apply());
    observer.observe(viewport);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [fitMode, fitNonce, numPages, docHash, setZoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onScroll = () => {
      if (scrollRaf.current) return;
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = 0;
        const top = viewport.scrollTop;
        setScrollTop(top);
        const { prefix, itemHeights } = layoutRef.current;
        const n = itemHeights.length;
        let best = 1;
        if (n) {
          const target = top + 12 - PADDING_TOP;
          let low = 0;
          let high = n - 1;
          let index = 0;
          while (low <= high) {
            const mid = (low + high) >> 1;
            if (prefix[mid] <= target) {
              index = mid;
              low = mid + 1;
            } else {
              high = mid - 1;
            }
          }
          if (index < n - 1 && prefix[index] + itemHeights[index] <= target) {
            index += 1;
          }
          best = index + 1;
          const pageTop = PADDING_TOP + prefix[index];
          const pageHeight = layoutRef.current.heights[index] ?? 1;
          const anchor = (top + viewport.clientHeight * 0.28 - pageTop) / pageHeight;
          pageAnchorMemory[best] = Math.max(0, Math.min(1, anchor));
        }
        setCurrentPage(best);
        savePosition(top);
      });
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [numPages, docHash, setCurrentPage, savePosition]);

  useEffect(() => {
    if (!scrollTarget) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { prefix, heights } = layoutRef.current;
    const index = Math.max(0, Math.min(numPages - 1, scrollTarget.page - 1));
    const pageTop = PADDING_TOP + prefix[index];
    const pageHeight = heights[index] ?? sizeHint.height * scale;
    const raw =
      scrollTarget.y === undefined
        ? pageTop - 8
        : pageTop + scrollTarget.y * pageHeight - viewport.clientHeight * 0.28;
    const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const top = Math.max(0, Math.min(max, raw));
    const distance = Math.abs(top - viewport.scrollTop);
    viewport.scrollTo({
      top,
      // Long jumps mount far fewer pages when they are instant; short jumps
      // keep the smooth motion readers expect.
      behavior:
        reducedMotion() || distance > viewport.clientHeight * 3 ? "auto" : "smooth",
    });
  }, [scrollTarget, numPages, sizeHint.height, scale]);

  useEffect(() => {
    if (restoreScrollTop == null) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    let stopped = false;
    const apply = () => {
      if (!stopped) viewport.scrollTop = restoreScrollTop;
    };
    apply();
    const frame = requestAnimationFrame(apply);
    const container = pagesRef.current;
    const observer = container ? new ResizeObserver(apply) : null;
    if (container && observer) observer.observe(container);

    const stop = () => {
      if (stopped) return;
      stopped = true;
      observer?.disconnect();
      clearRestoreScroll();
    };
    const timer = setTimeout(stop, 1200);
    const onUserScroll = () => {
      if (Math.abs(viewport.scrollTop - restoreScrollTop) > 4) stop();
    };
    viewport.addEventListener("wheel", onUserScroll, { passive: true, once: true });
    viewport.addEventListener("touchstart", onUserScroll, { passive: true, once: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      observer?.disconnect();
      viewport.removeEventListener("wheel", onUserScroll);
      viewport.removeEventListener("touchstart", onUserScroll);
    };
  }, [restoreScrollTop, docHash, clearRestoreScroll]);

  useEffect(() => {
    if (!docHash || !numPages) return;
    const timer = setTimeout(() => {
      useOcr.getState().observe(currentPage, "high");
    }, 650);
    return () => clearTimeout(timer);
  }, [currentPage, docHash, numPages]);

  const windowRange = useMemo(() => {
    const n = layout.itemHeights.length;
    if (!n) return { start: 0, end: 0 };
    const limitTop = scrollTop - OVERSCAN;
    let low = 0;
    let high = n - 1;
    let start = n - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (PADDING_TOP + layout.prefix[mid] + layout.itemHeights[mid] >= limitTop) {
        start = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    let end = start;
    const limitBottom = scrollTop + Math.max(viewportHeight, 600) + OVERSCAN;
    while (end < n && PADDING_TOP + layout.prefix[end] < limitBottom) end += 1;
    if (end <= start) end = Math.min(n, start + 1);
    return { start, end };
  }, [layout, scrollTop, viewportHeight]);

  const beforeHeight = layout.prefix[windowRange.start] ?? 0;
  const afterHeight = layout.total - (layout.prefix[windowRange.end] ?? layout.total);

  const handleSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelection(null);
      return;
    }
    const rawText = selection.toString().replace(/\s+\n/g, "\n").trim();
    if (!rawText) {
      setSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const pages = collectPageSelection(range).map((item) => ({
      ...item,
      text: item.text.slice(0, 6000),
    }));
    if (!pages.length) return;
    const cleanText = pages
      .map((item) => item.text)
      .join("\n\n")
      .replace(/\s+\n/g, "\n")
      .trim()
      .slice(0, 6000);
    if (!cleanText) {
      setSelection(null);
      return;
    }

    const bounds = range.getBoundingClientRect();
    const x = Math.min(Math.max(bounds.left + bounds.width / 2, 132), window.innerWidth - 132);
    const y = Math.max(58, bounds.top - 46);

    const hasOcr = pages.some((page) => page.source === "ocr" || page.source === "mixed");
    const onlyOcr = pages.every((page) => page.source === "ocr" || page.source === "mixed");
    const source = hasOcr ? (onlyOcr ? "ocr" : "mixed") : undefined;

    setSelection({
      page: pages[0].page,
      text: cleanText,
      toolbar: { x, y },
      rects: pages[0].rects,
      source,
      pages: pages.length > 1 ? pages : undefined,
    });

    if (source && docHash) {
      try {
        const key = `pdf-ai-reader:ocr-notice:${docHash}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          void import("../assistant/useAssistantStore").then(({ useAssistant }) => {
            useAssistant
              .getState()
              .notify("这是 OCR 识别的文字，可能有误差；可复制、引用或高亮", "info");
          });
        }
      } catch {
        // Private mode may disable localStorage; the badge still explains it.
      }
    }
  };

  if (!docName && !loading) {
    return (
      <div className={styles.empty}>
        <div className={styles.dropCard}>
          <div className={styles.mark}>
            <BrandMark size={28} />
          </div>
          <h1>打开 PDF 开始阅读</h1>
          <p>
            文件只在浏览器本地解析，不会上传。
            <br />
            只有你明确选中的页、文字与截图才会发给模型。
          </p>
          <button className={styles.primary} onClick={() => pickPdfFile((file) => void openFile(file))}>
            选择 PDF 文件
          </button>
          <div className={styles.hint}>也可以把 PDF 拖到这里 · Ctrl + O</div>
          {error ? <div className={styles.errorBox}>{error}</div> : null}
          {recent.length ? (
            <div className={styles.recent}>
              <div className={styles.recentTitle}>最近文档</div>
              {recent.slice(0, 5).map((item) => (
                <button
                  key={item.hash}
                  className={styles.recentItem}
                  onClick={() => void openRecent(item.hash)}
                  title={item.name}
                >
                  <span className={styles.recentName}>{item.name}</span>
                  <span className={styles.recentMeta}>
                    {item.pages} 页 · {new Date(item.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingInner}>
          <div className="spin" style={{ margin: "0 auto 12px", width: 20, height: 20 }} />
          正在解析文档…
          <div className={styles.progress}>
            <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      className={`${styles.viewport} ${surface} ${regionPage ? styles.regionMode : ""}`}
      data-reader
      onMouseUp={() => {
        if (!useViewer.getState().regionPage) handleSelection();
      }}
      onMouseDown={() => {
        if (!useViewer.getState().regionPage) setSelection(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setSelection(null);
      }}
      tabIndex={-1}
    >
      <div ref={pagesRef} className={styles.pages} aria-label={`${docName}，共 ${numPages} 页`}>
        {beforeHeight > 0 ? (
          <div aria-hidden="true" style={{ height: beforeHeight }} />
        ) : null}
        {Array.from({ length: windowRange.end - windowRange.start }, (_, index) => {
          const page = windowRange.start + index + 1;
          return (
            <PageView
              key={`${docHash}_${page}`}
              pageNumber={page}
              zoom={zoom}
              visible
              sizeHint={pageSizes[page - 1] ?? sizeHint}
            />
          );
        })}
        {afterHeight > 0 ? (
          <div aria-hidden="true" style={{ height: afterHeight }} />
        ) : null}
      </div>
      <span className="visually-hidden">当前第 {currentPage} 页，共 {numPages} 页</span>
    </div>
  );
}
