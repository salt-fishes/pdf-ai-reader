import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveDocument, getPageSize } from "../../lib/pdf/pdf";
import { PDF_TO_CSS_UNITS } from "../../lib/pdf/units";
import { pickPdfFile } from "../../lib/openFile";
import { BrandMark } from "../../components/icons/SparkleIcon";
import { useViewer } from "./useViewerStore";
import { PageView } from "./PageView";
import styles from "./PdfViewer.module.css";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
};

function collectPageSelection(range: Range): PageSelection[] {
  const root = range.commonAncestorContainer;
  const rootElement =
    root.nodeType === Node.TEXT_NODE ? root.parentElement : (root as HTMLElement | null);
  if (!rootElement) return [];
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
  const byPage = new Map<number, PageSelection>();
  let node: Node | null;
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
    const existing = byPage.get(page);
    if (existing) {
      existing.text += text;
      existing.rects.push(...selectionPageRects(sub, pageElement));
    } else {
      byPage.set(page, {
        page,
        text,
        rects: selectionPageRects(sub, pageElement),
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
  const currentPage = useViewer((state) => state.currentPage);
  const regionPage = useViewer((state) => state.regionPage);
  const openFile = useViewer((state) => state.openFile);
  const setZoom = useViewer((state) => state.setZoom);
  const setCurrentPage = useViewer((state) => state.setCurrentPage);
  const savePosition = useViewer((state) => state.savePosition);
  const setSelection = useViewer((state) => state.setSelection);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set([1, 2, 3]));
  const [sizeHint, setSizeHint] = useState({ width: 612, height: 792 });
  const scrollRaf = useRef(0);

  const pageNumbers = useMemo(
    () => Array.from({ length: numPages }, (_, index) => index + 1),
    [numPages],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !numPages) return;
    viewport.scrollTop = 0;
    setVisible(new Set([1, 2, 3]));

    const pdf = getActiveDocument();
    if (pdf) {
      void getPageSize(pdf, 1).then(setSizeHint);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.page);
            if (!page) continue;
            if (entry.isIntersecting) next.add(page);
            else next.delete(page);
          }
          return next;
        });
      },
      { root: viewport, rootMargin: "140% 0px", threshold: 0.01 },
    );

    for (const element of viewport.querySelectorAll("[data-page]")) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [numPages, docHash]);

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
        const top = viewport.getBoundingClientRect().top;
        let best = 1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const element of viewport.querySelectorAll<HTMLElement>("[data-page]")) {
          const rect = element.getBoundingClientRect();
          const distance = Math.abs(rect.top - top - 12);
          if (rect.bottom > top && distance < bestDistance) {
            bestDistance = distance;
            best = Number(element.dataset.page);
          }
        }
        if (best) setCurrentPage(best);
        savePosition(viewport.scrollTop);
      });
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [numPages, docHash, setCurrentPage, savePosition]);

  useEffect(() => {
    if (!scrollTarget) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const element = viewport.querySelector<HTMLElement>(`[data-page="${scrollTarget.page}"]`);
    if (!element) return;
    element.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    element.classList.remove(styles.flash);
    void element.offsetWidth;
    if (styles.flash) element.classList.add(styles.flash);
    const timeout = setTimeout(() => {
      if (styles.flash) element.classList.remove(styles.flash);
    }, 1200);
    return () => clearTimeout(timeout);
  }, [scrollTarget, numPages]);

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

    setSelection({
      page: pages[0].page,
      text: cleanText,
      toolbar: { x, y },
      rects: pages[0].rects,
      pages: pages.length > 1 ? pages : undefined,
    });
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
      <div className={styles.pages} aria-label={`${docName}，共 ${numPages} 页`}>
        {pageNumbers.map((page) => (
          <PageView
            key={`${docHash}_${page}`}
            pageNumber={page}
            zoom={zoom}
            visible={visible.has(page)}
            sizeHint={sizeHint}
          />
        ))}
      </div>
      <span className="visually-hidden">当前第 {currentPage} 页，共 {numPages} 页</span>
    </div>
  );
}
