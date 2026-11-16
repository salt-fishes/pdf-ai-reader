import { useEffect, useRef } from "react";
import { WinIcon } from "../components/icons/WinIcon";
import { useViewer } from "../features/viewer/useViewerStore";
import { useOcr } from "../features/ocr/useOcrStore";
import styles from "./Chrome.module.css";

export function SearchOverlay() {
  const open = useViewer((state) => state.searchOpen);
  const query = useViewer((state) => state.searchQuery);
  const results = useViewer((state) => state.searchResults);
  const busy = useViewer((state) => state.searchBusy);
  const progress = useViewer((state) => state.searchProgress);
  const setQuery = useViewer((state) => state.setSearchQuery);
  const runSearch = useViewer((state) => state.runSearch);
  const closeSearch = useViewer((state) => state.closeSearch);
  const focusSearchResult = useViewer((state) => state.focusSearchResult);
  const textVersion = useOcr((state) => state.textVersion);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) closeSearch();
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open, closeSearch]);

  useEffect(() => {
    if (!open) return;
    // Re-run after an OCR page lands so newly recognized text joins results.
    const timer = setTimeout(() => void runSearch(), 420);
    return () => clearTimeout(timer);
  }, [query, open, runSearch, textVersion]);

  if (!open) return null;

  return (
    <div className={styles.search} ref={boxRef} role="dialog" aria-label="搜索文档">
      <div className={styles.searchBar}>
        <WinIcon glyph="search" size={15} />
        <input
          ref={inputRef}
          className={styles.searchInput}
          value={query}
          placeholder="搜索全文，至少 2 个字符"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runSearch();
            if (event.key === "Escape") {
              event.stopPropagation();
              closeSearch();
            }
          }}
        />
        <span className={styles.searchHint}>
          {busy && progress
            ? `${progress.done}/${progress.total}`
            : results.length
              ? `${results.length} 处`
              : "Esc 关闭"}
        </span>
      </div>
      <div className={styles.searchBody}>
        {results.length ? (
          results.map((result, index) => (
            <button
              key={`${result.page}_${result.index}_${index}`}
              className={styles.searchResult}
              onClick={() => focusSearchResult(result.page, result.occurrence, query.trim())}
            >
              <span className={styles.searchPage}>
                P{result.page}
                {result.source ? <span className={styles.searchOcr}>OCR</span> : null}
              </span>
              <span className={styles.searchExcerpt}>{result.excerpt}</span>
            </button>
          ))
        ) : (
          <div className={styles.searchEmpty}>
            {query.trim().length < 2
              ? "输入关键词后自动检索"
              : busy
                ? "正在检索全文…"
                : "没有找到匹配内容"}
          </div>
        )}
      </div>
    </div>
  );
}
