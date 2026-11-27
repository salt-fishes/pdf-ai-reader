import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/icons/Icon";
import { getActiveDocument, renderPageThumbnail } from "../lib/pdf/pdf";
import { chapterRanges } from "../lib/pdf/chapters";
import { downloadText, safeFileName } from "../lib/download";
import { useAssistant } from "../features/assistant/useAssistantStore";
import { useViewer } from "../features/viewer/useViewerStore";
import styles from "./Chrome.module.css";

function PageThumbBase({
  page,
  active,
  onSelect,
}: {
  page: number;
  active: boolean;
  onSelect: (page: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let alive = true;
    let started = false;

    const load = async () => {
      if (started) return;
      started = true;
      const pdf = getActiveDocument();
      if (!pdf) return;
      try {
        const url = await renderPageThumbnail(pdf, page);
        if (alive) setSrc(url);
      } catch {
        // A single page may fail to render; keep the placeholder.
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      void load();
      return () => {
        alive = false;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "96px 0px" },
    );
    observer.observe(element);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [page]);

  return (
    <button
      ref={ref}
      className={`${styles.thumb} ${active ? styles.thumbActive : ""}`}
      onClick={() => onSelect(page)}
      aria-label={`第 ${page} 页`}
      aria-current={active ? "page" : undefined}
    >
      <span className={styles.thumbFrame}>
        {src ? (
          <img src={src} alt="" draggable={false} />
        ) : (
          <span className={styles.thumbSkeleton} aria-hidden="true" />
        )}
      </span>
      <span className={styles.thumbLabel}>{page}</span>
    </button>
  );
}

export const PageThumb = memo(PageThumbBase);

const PAGE_ROW_HEIGHT = 164;
const PAGE_OVERSCAN_ROWS = 1;

export function Sidebar() {
  const sidebar = useViewer((state) => state.sidebar);
  const numPages = useViewer((state) => state.numPages);
  const docName = useViewer((state) => state.docName);
  const docHash = useViewer((state) => state.docHash);
  const currentPage = useViewer((state) => state.currentPage);
  const outline = useViewer((state) => state.outline);
  const highlights = useViewer((state) => state.highlights);
  const requestScroll = useViewer((state) => state.requestScroll);
  const selectPage = useCallback((page: number) => requestScroll(page), [requestScroll]);
  const requestLocation = useViewer((state) => state.requestLocation);
  const removeHighlight = useViewer((state) => state.removeHighlight);
  const setPageRange = useAssistant((state) => state.setPageRange);
  const chapters = useMemo(() => chapterRanges(outline, numPages), [outline, numPages]);
  const rangesByStart = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.start, chapter])),
    [chapters],
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyScrollTop, setBodyScrollTop] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(600);

  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!sidebar || !element) return;
    const update = () => {
      setBodyScrollTop(element.scrollTop);
      setBodyHeight(element.clientHeight);
    };
    update();
    if (sidebar === "pages") {
      const activeRow = Math.floor((currentPage - 1) / 2);
      element.scrollTop = Math.max(0, activeRow * PAGE_ROW_HEIGHT - element.clientHeight / 3);
      setBodyScrollTop(element.scrollTop);
    }
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
    // Recenter only when a panel is opened; reading must not yank the sidebar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebar]);

  const pageRows = Math.ceil(numPages / 2);
  const visibleRowCount = Math.ceil(bodyHeight / PAGE_ROW_HEIGHT);
  const firstVisibleRow = Math.max(
    0,
    Math.floor(bodyScrollTop / PAGE_ROW_HEIGHT) - PAGE_OVERSCAN_ROWS,
  );
  const lastVisibleRow = Math.min(
    pageRows,
    firstVisibleRow + visibleRowCount + PAGE_OVERSCAN_ROWS * 2,
  );
  const visiblePages: number[] = [];
  for (let row = firstVisibleRow; row < lastVisibleRow; row += 1) {
    visiblePages.push(row * 2 + 1);
    if (row * 2 + 2 <= numPages) visiblePages.push(row * 2 + 2);
  }

  if (!sidebar) return null;

  const addChapter = async (title: string, start: number, end: number) => {
    const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    await setPageRange(pages);
    useAssistant
      .getState()
      .notify(`已加入上下文：${title} · 第 ${start}${end > start ? `–${end}` : ""} 页`, "success");
  };

  const exportHighlights = (format: "md" | "json") => {
    if (!highlights.length) return;
    const sorted = [...highlights].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
    if (format === "json") {
      const payload = {
        document: docName,
        exportedAt: new Date().toISOString(),
        highlights: sorted,
      };
      downloadText(
        `${safeFileName(docName)}-highlights.json`,
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8",
      );
    } else {
      const byPage = new Map<number, typeof sorted>();
      for (const highlight of sorted) {
        const list = byPage.get(highlight.page) ?? [];
        list.push(highlight);
        byPage.set(highlight.page, list);
      }
      const lines = [`# ${docName} · 高亮`, ""];
      for (const [page, items] of byPage) {
        lines.push(`## 第 ${page} 页`, "");
        for (const item of items) {
          const label = item.source ? `[${item.source === "ocr" ? "OCR" : "OCR 混合"}]\n` : "";
          lines.push(`> ${label}${item.text.replace(/\n+/g, "\n> ")}`, "");
        }
      }
      downloadText(
        `${safeFileName(docName)}-highlights.md`,
        lines.join("\n"),
        "text/markdown;charset=utf-8",
      );
    }
    useAssistant.getState().notify(`已导出 ${sorted.length} 条高亮`, "success");
  };

  const title = sidebar === "pages" ? "页面" : sidebar === "outline" ? "目录" : "高亮";
  const count =
    sidebar === "pages" ? numPages : sidebar === "outline" ? outline.length : highlights.length;

  return (
    <aside className={styles.sidebar} aria-label={title}>
      <div className={styles.sidebarHead}>
        <span className={styles.sidebarTitle}>{title}</span>
        <span className={styles.sidebarCount}>{count}</span>
      </div>
      <div
        className={styles.sidebarBody}
        ref={bodyRef}
        onScroll={(event) => setBodyScrollTop(event.currentTarget.scrollTop)}
      >
        {sidebar === "pages" ? (
          <div className={styles.thumbWindow} style={{ height: pageRows * PAGE_ROW_HEIGHT + 8 }}>
            {visiblePages.map((page) => {
              const row = Math.floor((page - 1) / 2);
              const column = (page - 1) % 2;
              return (
                <div
                  className={styles.thumbCell}
                  style={{
                    top: row * PAGE_ROW_HEIGHT,
                    left: column === 0 ? 0 : "calc(50% + 4px)",
                  }}
                  key={`${docHash}_${page}`}
                >
                  <PageThumb page={page} active={page === currentPage} onSelect={selectPage} />
                </div>
              );
            })}
          </div>
        ) : null}

        {sidebar === "outline" ? (
          outline.length ? (
            <div>
              {outline.map((item, index) => (
                <div
                  key={`${item.title}_${index}`}
                  className={styles.outlineItem}
                  style={{ paddingLeft: 8 + item.depth * 12 }}
                >
                  <button
                    className={styles.outlineNav}
                    onClick={() => item.page && requestScroll(item.page)}
                    disabled={!item.page}
                    title={item.title}
                  >
                    {item.title}
                  </button>
                  {item.page ? (
                    <button
                      className={styles.outlinePage}
                      onClick={() => {
                        const range = rangesByStart.get(item.page!);
                        if (range) void addChapter(range.title, range.start, range.end);
                      }}
                      title={`将“${item.title}”加入上下文`}
                      aria-label={`将 ${item.title} 加入上下文`}
                    >
                      {item.page}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptySidebar}>
              <Icon name="outline" size={22} />
              <span>这份文档没有目录。</span>
            </div>
          )
        ) : null}

        {sidebar === "highlights" ? (
          highlights.length ? (
            <div>
              <div className={styles.highlightTools}>
                <span>共 {highlights.length} 条</span>
                <button onClick={() => exportHighlights("md")}>Markdown</button>
                <button onClick={() => exportHighlights("json")}>JSON</button>
              </div>
              {highlights.map((highlight) => {
                const top = highlight.rects.length
                  ? Math.max(0, Math.min(...highlight.rects.map((rect) => rect.y)))
                  : undefined;
                const jump = () =>
                  requestLocation({
                    page: highlight.page,
                    y: top,
                    focusId: highlight.id,
                    align: "top",
                  });
                return (
                  <div
                    key={highlight.id}
                    className={styles.highlightItem}
                    role="button"
                    tabIndex={0}
                    onClick={jump}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        jump();
                      }
                    }}
                  >
                    <div className={styles.highlightText}>{highlight.text}</div>
                    <div className={styles.highlightMeta}>
                      <span>
                        第 {highlight.page} 页
                        {highlight.source ? (
                          <span className={styles.highlightOcr} title="该高亮来自 OCR 识别文字">
                            OCR
                          </span>
                        ) : null}
                      </span>
                      <button
                        aria-label="删除高亮"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeHighlight(highlight.id);
                        }}
                      >
                        <Icon name="clear" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptySidebar}>
              <Icon name="highlightList" size={22} />
              <span>还没有高亮。选中文字后点“高亮”，就会出现在这里。</span>
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}
