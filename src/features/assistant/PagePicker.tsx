import { useEffect, useMemo, useRef, useState } from "react";
import { WinIcon } from "../../components/icons/WinIcon";
import { chapterRanges } from "../../lib/pdf/chapters";
import { formatPageList, parsePageRange } from "../../lib/pdf/range";
import { useViewer } from "../viewer/useViewerStore";
import { useAssistant } from "./useAssistantStore";
import styles from "./Assistant.module.css";

type Props = {
  onClose: () => void;
  showSmart?: boolean;
};

type Scope = "current" | "all" | "custom";

function compactPages(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const page = sorted[index];
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    if (start !== undefined) {
      parts.push(start === previous ? String(start) : `${start}-${previous}`);
    }
    start = page;
    previous = page;
  }
  return parts.join(",");
}

export function PagePicker({ onClose, showSmart = false }: Props) {
  const numPages = useViewer((state) => state.numPages);
  const currentPage = useViewer((state) => state.currentPage);
  const outline = useViewer((state) => state.outline);
  const context = useAssistant((state) => state.context);
  const autoCurrentPage = useAssistant((state) => state.autoCurrentPage);
  const addCurrentPage = useAssistant((state) => state.addCurrentPage);
  const addPageRange = useAssistant((state) => state.addPageRange);
  const setPageRange = useAssistant((state) => state.setPageRange);
  const addAllPages = useAssistant((state) => state.addAllPages);
  const removePageRange = useAssistant((state) => state.removePageRange);
  const allPagesBusy = useAssistant((state) => state.allPagesBusy);
  const filtering = useAssistant((state) => state.filtering);
  const smartFilter = useAssistant((state) => state.smartFilter);
  const draft = useAssistant((state) => state.draft);

  const hasRange = Boolean(context.pageRange?.length);
  const coversAll = hasRange && context.pageRange!.length === numPages;
  const initialScope: Scope = coversAll ? "all" : hasRange ? "custom" : "current";
  const [scope, setScope] = useState<Scope>(initialScope);
  const [rangeDraft, setRangeDraft] = useState(() =>
    context.pageRange ? compactPages(context.pageRange) : "",
  );
  const [rangeError, setRangeError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const chapters = useMemo(() => chapterRanges(outline, numPages), [outline, numPages]);

  const applyRange = async (pages: number[] | null) => {
    if (!pages) {
      setRangeError(`页码不合法，应在 1–${numPages} 之间`);
      return;
    }
    setBusy(true);
    setRangeError("");
    try {
      await setPageRange(pages);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const submitCustom = async () => {
    if (!rangeDraft.trim()) return;
    setBusy(true);
    try {
      const result = await addPageRange(rangeDraft);
      if (!result.ok) {
        setRangeError(result.message ?? "页码不合法");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const chooseCurrent = async () => {
    setScope("current");
    if (hasRange) removePageRange();
    else await addCurrentPage();
    onClose();
  };

  const chooseAll = async () => {
    setScope("all");
    await addAllPages();
    onClose();
  };

  const disabled = busy || allPagesBusy || filtering !== null;
  const exampleRange = numPages >= 12 ? "2,5,9-12" : numPages >= 5 ? "2,4-5" : "1";
  const exampleSpan = numPages >= 7 ? "3-7" : numPages >= 4 ? "2-3" : "1";
  const exampleSingle = numPages > 1 ? `2-${Math.min(4, numPages)}` : "1";
  const scopeLabel = coversAll
    ? `全部 ${numPages} 页`
    : context.pageRange
      ? formatPageList(context.pageRange)
      : autoCurrentPage
        ? `当前页 P${currentPage}`
        : "未选择页面";

  return (
    <div className={styles.pagePicker}>
      <div className={styles.pagePickerHead}>
        <span className={styles.pagePickerTitle}>发送哪些页面</span>
        <span className={styles.pagePickerCurrent}>{scopeLabel}</span>
      </div>

      <div className={styles.pageScopeRow} role="group" aria-label="页面范围">
        <button
          className={`${styles.pageScopeButton} ${scope === "current" && !hasRange && autoCurrentPage ? styles.pageScopeActive : ""}`}
          onClick={() => void chooseCurrent()}
          disabled={disabled}
        >
          当前页
          <span>P{currentPage}</span>
        </button>
        <button
          className={`${styles.pageScopeButton} ${scope === "all" ? styles.pageScopeActive : ""}`}
          onClick={() => void chooseAll()}
          disabled={disabled}
          title="把整份文档加入上下文"
        >
          全部页
          <span>{numPages}</span>
        </button>
        <button
          className={`${styles.pageScopeButton} ${scope === "custom" ? styles.pageScopeActive : ""}`}
          onClick={() => {
            setScope("custom");
            inputRef.current?.focus();
          }}
          disabled={disabled}
        >
          自定义
          <span>输入或目录</span>
        </button>
      </div>

      <div className={styles.pageCustom}>
        <div className={styles.pageInputRow}>
          <input
            ref={inputRef}
            className={styles.pagePickerInput}
            value={rangeDraft}
            placeholder={`例如 ${exampleSingle} 或 ${exampleRange}`}
            aria-label="页码范围"
            onChange={(event) => {
              const next = event.target.value;
              setScope("custom");
              setRangeDraft(next);
              setRangeError(
                next.trim() && !parsePageRange(next, numPages)
                  ? `页码不合法，应在 1–${numPages} 之间`
                  : "",
              );
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submitCustom();
              if (event.key === "Escape") onClose();
            }}
          />
          <button className={styles.pageApply} onClick={() => void submitCustom()} disabled={disabled}>
            确定
          </button>
        </div>
        {rangeError ? <div className={styles.pagePickerError}>{rangeError}</div> : null}
        <div className={styles.pagePickerHint}>
          支持 <code>{exampleSingle}</code>、<code>{exampleSpan}</code>、<code>{exampleRange}</code>，也可以直接点下方目录。
        </div>
      </div>

      {chapters.length ? (
        <div className={styles.pageToc}>
          <div className={styles.pageTocHead}>
            <span>从目录选择</span>
            <span>{chapters.length} 章</span>
          </div>
          <div className={styles.pageTocList}>
            {chapters.map((chapter, index) => (
              <button
                key={`${chapter.title}_${chapter.start}_${index}`}
                className={styles.pageTocItem}
                style={{ paddingLeft: 8 + chapter.depth * 10 }}
                onClick={() => void applyRange(
                  Array.from(
                    { length: chapter.end - chapter.start + 1 },
                    (_, index) => chapter.start + index,
                  ),
                )}
                disabled={disabled}
                title={`加入 ${chapter.title}（P${chapter.start}–P${chapter.end}）`}
              >
                <span className={styles.pageTocName}>{chapter.title}</span>
                <span className={styles.pageTocRange}>
                  {chapter.start === chapter.end
                    ? `P${chapter.start}`
                    : `P${chapter.start}–${chapter.end}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.pagePickerHint}>这份 PDF 没有目录，可直接在上方输入页码范围。</div>
      )}

      {showSmart && numPages >= 8 ? (
        <button
          className={styles.pageSmart}
          onClick={() => {
            onClose();
            void smartFilter();
          }}
          disabled={disabled || !draft.trim()}
          title="按当前问题在本地检索最相关的段落，不把整本 PDF 发出去"
        >
          <WinIcon glyph="search" size={13} />
          <span>智能筛选全文</span>
          <span className={styles.pageSmartHint}>{draft.trim() ? "按问题筛选" : "先输入问题"}</span>
        </button>
      ) : null}

      <div className={styles.pagePickerFoot}>
        <span>PDF 文件本身不会上传；全文较长时受上下文预算限制。</span>
        <button className={styles.pageCancel} onClick={onClose}>
          取消
        </button>
      </div>
      {busy || allPagesBusy ? (
        <div className={styles.pagePickerBusy} role="status">
          <span className="spin" />
          {allPagesBusy ? `正在读取全部 ${numPages} 页…` : "正在读取所选页面…"}
        </div>
      ) : null}
    </div>
  );
}
