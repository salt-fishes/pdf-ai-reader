import { useEffect, useMemo, useRef, useState } from "react";
import { WinIcon } from "../components/icons/WinIcon";
import { getActiveDocument, renderPageThumbnail } from "../lib/pdf/pdf";
import { chapterRanges } from "../lib/pdf/chapters";
import { downloadText, safeFileName } from "../lib/download";
import { useAssistant } from "../features/assistant/useAssistantStore";
import { useViewer } from "../features/viewer/useViewerStore";
import styles from "./Chrome.module.css";

function PageThumb({
  page,
  active,
  onSelect,
}: {
  page: number;
  active: boolean;
  onSelect: () => void;
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
      { rootMargin: "360px 0px" },
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
      onClick={onSelect}
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

export function Sidebar() {
  const sidebar = useViewer((state) => state.sidebar);
  const numPages = useViewer((state) => state.numPages);
  const docName = useViewer((state) => state.docName);
  const docHash = useViewer((state) => state.docHash);
  const currentPage = useViewer((state) => state.currentPage);
  const outline = useViewer((state) => state.outline);
  const highlights = useViewer((state) => state.highlights);
  const requestScroll = useViewer((state) => state.requestScroll);
  const removeHighlight = useViewer((state) => state.removeHighlight);
  const setPageRange = useAssistant((state) => state.setPageRange);
  const chapters = useMemo(() => chapterRanges(outline, numPages), [outline, numPages]);
  const rangesByStart = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.start, chapter])),
    [chapters],
  );

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
    const sorted = [...highlights].sort(
      (a, b) => a.page - b.page || a.createdAt - b.createdAt,
    );
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
          lines.push(`> ${item.text.replace(/\n+/g, "\n> ")}`, "");
        }
      }
      downloadText(`${safeFileName(docName)}-highlights.md`, lines.join("\n"), "text/markdown;charset=utf-8");
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
      <div className={styles.sidebarBody}>
        {sidebar === "pages" ? (
          <div className={styles.thumbGrid}>
            {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
              <PageThumb
                key={`${docHash}_${page}`}
                page={page}
                active={page === currentPage}
                onSelect={() => requestScroll(page)}
              />
            ))}
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
            <div className={styles.emptySidebar}>这份文档没有目录。</div>
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
              {highlights.map((highlight) => (
                <div
                  key={highlight.id}
                  className={styles.highlightItem}
                  role="button"
                  tabIndex={0}
                  onClick={() => requestScroll(highlight.page)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") requestScroll(highlight.page);
                  }}
                >
                  <div className={styles.highlightText}>{highlight.text}</div>
                  <div className={styles.highlightMeta}>
                    <span>第 {highlight.page} 页</span>
                    <button
                      aria-label="删除高亮"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeHighlight(highlight.id);
                      }}
                    >
                      <WinIcon glyph="clear" size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptySidebar}>
              还没有高亮。选中文字后点“高亮”，就会出现在这里。
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}
