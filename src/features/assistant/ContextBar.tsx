import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, StateIcon } from "../../components/icons/Icon";
import { copyImage, copyText, downloadDataUrl } from "../../lib/clipboard";
import { formatPageList } from "../../lib/pdf/range";
import { useViewer } from "../viewer/useViewerStore";
import { useOcr } from "../ocr/useOcrStore";
import { useAssistant, useContextCount } from "./useAssistantStore";
import styles from "./Assistant.module.css";

export function ContextBar() {
  const context = useAssistant((state) => state.context);
  const autoCurrentPage = useAssistant((state) => state.autoCurrentPage);
  const scannedPages = useAssistant((state) => state.scannedPages);
  const removeCurrentPage = useAssistant((state) => state.removeCurrentPage);
  const addCurrentPage = useAssistant((state) => state.addCurrentPage);
  const removePageRange = useAssistant((state) => state.removePageRange);
  const removeSmartFilter = useAssistant((state) => state.removeSmartFilter);
  const removeSelection = useAssistant((state) => state.removeSelection);
  const removeScreenshot = useAssistant((state) => state.removeScreenshot);
  const removeAttachment = useAssistant((state) => state.removeAttachment);
  const removeQuote = useAssistant((state) => state.removeQuote);
  const setBoostContext = useAssistant((state) => state.setBoostContext);
  const collapseAt = useAssistant((state) => state.contextCollapseAt);
  const ocrEnabled = useOcr((state) => state.enabled);
  const ocrRunning = useOcr((state) => state.running);
  const ocrPreparing = useOcr((state) => state.phase === "preparing");
  const ocrQueued = useOcr((state) =>
    state.queue.some((item) => item.page === context.currentPage),
  );

  const count = useContextCount();
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    if (!collapseAt) return;
    setExpanded(false);
    setBoostContext(false);
  }, [collapseAt, setBoostContext]);

  useEffect(() => {
    if (!preview && !textPreview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPreview(null);
      setTextPreview(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [preview, textPreview]);

  const jump = (page: number) => useViewer.getState().requestScroll(page);
  const selectionPages = context.selection?.pages?.map((page) => page.page) ?? [];
  const selectionLabel =
    selectionPages.length > 1
      ? `P${Math.min(...selectionPages)}–P${Math.max(...selectionPages)}`
      : `P${context.selection?.page ?? 1}`;
  const primaryLabel = context.pageRange
    ? formatPageList(context.pageRange)
    : context.smart
      ? "智能筛选"
      : autoCurrentPage && context.currentPage
        ? `P${context.currentPage} 当前页`
        : context.selection
          ? `选中 · ${selectionLabel}`
          : count > 0
            ? `${count} 项上下文`
            : "未添加上下文";
  const primaryCount =
    context.pageRange || context.smart || context.selection
      ? 1
      : autoCurrentPage && context.currentPage
        ? 1
        : 0;
  const extraCount = Math.max(0, count - primaryCount);
  const summary = extraCount > 0 ? `${primaryLabel} · 另 ${extraCount} 项` : primaryLabel;

  return (
    <div className={styles.context}>
      {autoCurrentPage && context.currentPage && scannedPages.includes(context.currentPage) ? (
        <div className={styles.scannedBanner}>
          <Icon name="info" size={14} />
          <span>
            {!ocrEnabled
              ? `第 ${context.currentPage} 页没有文字层；OCR 文本层已在设置中关闭。`
              : ocrRunning === context.currentPage
                ? `第 ${context.currentPage} 页正在后台识别文字…`
                : ocrPreparing
                  ? "正在准备 OCR 模型…"
                  : ocrQueued
                    ? `第 ${context.currentPage} 页已加入后台识别队列。`
                    : `第 ${context.currentPage} 页没有文字层，扫描件可自动识别。`}
          </span>
        </div>
      ) : null}

      <div className={styles.contextTop}>
        <button
          className={styles.contextRow}
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            setBoostContext(next);
          }}
          aria-expanded={expanded}
          aria-label="上下文来源"
          title="查看本次上下文来源"
        >
          <span className={styles.sourceStack} aria-hidden="true">
            <span className={styles.sourceIcon}>
              <Icon
                name={
                  context.selection
                    ? "highlight"
                    : context.screenshots.length
                      ? "camera"
                      : context.attachments.length
                        ? "attach"
                        : context.smart
                          ? "search"
                          : "page"
                }
                size={14}
              />
            </span>
          </span>
          <span className={styles.contextSummary}>{summary}</span>
          <span className="visually-hidden">{count} 个来源</span>
          <span className={styles.contextSpacer} />
          <span className={styles.chevron}>
            <StateIcon
              off="chevronDown"
              on="chevronUp"
              active={expanded}
              size={14}
              strokeWidth={2}
            />
          </span>
        </button>
        <button
          className={`${styles.followButton} ${autoCurrentPage ? styles.followActive : ""}`}
          onClick={() => (autoCurrentPage ? removeCurrentPage() : void addCurrentPage())}
          aria-label={autoCurrentPage ? "停止跟随当前页" : "跟随当前页"}
          aria-pressed={autoCurrentPage}
          title={autoCurrentPage ? "跟随当前页：开" : "跟随当前页：关"}
        >
          <Icon name="pin" size={15} />
        </button>
      </div>

      {expanded ? (
        <div className={styles.contextExpanded}>
          <div className={styles.chips}>
            {autoCurrentPage && context.currentPage ? (
              <span className={styles.chip}>
                <button
                  className={styles.chipLabel}
                  onClick={() => jump(context.currentPage!)}
                  title="跳到当前页"
                >
                  P{context.currentPage} 当前页
                </button>
                <button
                  className={styles.chipRemove}
                  onClick={removeCurrentPage}
                  aria-label="移除当前页"
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ) : null}

            {context.pageRange ? (
              <span className={styles.chip}>
                <button
                  className={styles.chipLabel}
                  onClick={() => jump(context.pageRange![0])}
                  title="跳到页码范围首页"
                >
                  {formatPageList(context.pageRange)}
                </button>
                <button
                  className={styles.chipRemove}
                  onClick={removePageRange}
                  aria-label="移除页码"
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ) : null}

            {context.smart ? (
              <span className={styles.chip}>
                <button
                  className={styles.chipLabel}
                  onClick={() => jump(context.smart!.pages[0] ?? 1)}
                  title={`智能筛选问题：${context.smart.query}`}
                >
                  智能筛选 · {context.smart.chunks} 段 / {context.smart.pages.length} 页
                </button>
                <button
                  className={styles.chipRemove}
                  onClick={removeSmartFilter}
                  aria-label="移除智能筛选"
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ) : null}

            {context.selection ? (
              <span className={styles.chip}>
                <button
                  className={styles.chipLabel}
                  onClick={() => jump(context.selection!.page)}
                  title={context.selection.text}
                >
                  选中{context.selection.source ? "（OCR）" : ""} · {selectionLabel}
                </button>
                <button
                  className={styles.chipRemove}
                  onClick={removeSelection}
                  aria-label="移除选中文字"
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ) : null}

            {context.screenshots.map((shot) => (
              <span key={shot.id} className={styles.chip}>
                <button
                  className={styles.chipLabel}
                  onClick={() => setPreview(shot.dataUrl)}
                  title="预览截图"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <img className={styles.chipThumb} src={shot.dataUrl} alt="" />P{shot.page}{" "}
                  {shot.kind === "region" ? "框选" : "截图"}
                </button>
                <button
                  className={styles.chipRemove}
                  onClick={() => removeScreenshot(shot.id)}
                  aria-label="移除截图"
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}

            {context.attachments.map((file) => (
              <span key={file.id} className={styles.chip}>
                <button
                  className={styles.chipLabel}
                  onClick={() => {
                    if (file.kind === "image" && file.dataUrl) {
                      setPreview(file.dataUrl);
                    } else {
                      setTextPreview({
                        title: file.name,
                        body:
                          file.text?.slice(0, 6000) ||
                          `PDF · ${file.pages ?? "?"} 页 · ${file.chars ?? 0} 字`,
                      });
                    }
                  }}
                  title={`${file.name}${file.pages ? ` · ${file.pages} 页` : ""}`}
                >
                  {file.kind === "image" ? "图片" : file.kind === "pdf" ? "PDF" : "文本"} ·{" "}
                  {file.name}
                </button>
                <button
                  className={styles.chipRemove}
                  onClick={() => removeAttachment(file.id)}
                  aria-label="移除附件"
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}

            {context.quotes.map((quote) => (
              <span key={quote.id} className={styles.chip}>
                <span className={styles.chipLabel} title={quote.text}>
                  引用 · {quote.role === "assistant" ? "回答" : "提问"}
                </span>
                <button
                  className={styles.chipRemove}
                  onClick={() => removeQuote(quote.messageId)}
                  aria-label="取消引用"
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}

            {count === 0 ? (
              <div className={styles.chipEmpty}>还没有上下文。选中文字、截图或指定页码。</div>
            ) : null}
          </div>

          {context.smart ? (
            <div
              className={styles.smartNote}
              title={context.smart.query ? `匹配问题：${context.smart.query}` : undefined}
            >
              <span className={styles.smartText}>
                已从 {context.smart.scannedPages} 页筛出 {context.smart.chunks} 段
                {context.smart.scannedPages < context.smart.totalPages
                  ? ` · 扫描前 ${context.smart.scannedPages}/${context.smart.totalPages} 页`
                  : ""}
              </span>
              <span className={styles.smartPages}>
                {context.smart.pages.map((page) => (
                  <button key={page} className={styles.smartPage} onClick={() => jump(page)}>
                    P{page}
                  </button>
                ))}
                <button className={styles.smartPage} onClick={removeSmartFilter}>
                  移除
                </button>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {preview
        ? createPortal(
            <div
              className={styles.previewBackdrop}
              onClick={() => setPreview(null)}
              role="dialog"
              aria-modal="true"
              aria-label="截图预览"
            >
              <img
                className={styles.previewImage}
                src={preview}
                alt="截图预览"
                onClick={(event) => event.stopPropagation()}
              />
              <div className={styles.previewActions} onClick={(event) => event.stopPropagation()}>
                <button
                  className={styles.previewButton}
                  onClick={async () => {
                    const ok = await copyImage(preview);
                    useAssistant
                      .getState()
                      .notify(
                        ok ? "图片已复制" : "无法复制图片，可改为下载",
                        ok ? "success" : "error",
                      );
                  }}
                >
                  复制图片
                </button>
                <button
                  className={styles.previewButton}
                  onClick={() => downloadDataUrl(preview, "pdf-page.jpg")}
                >
                  下载
                </button>
              </div>
              <button
                className={styles.previewClose}
                aria-label="关闭预览"
                onClick={() => setPreview(null)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>,
            document.body,
          )
        : null}

      {textPreview
        ? createPortal(
            <div
              className={styles.previewBackdrop}
              onClick={() => setTextPreview(null)}
              role="dialog"
              aria-modal="true"
              aria-label="文本预览"
            >
              <div className={styles.textPreviewCard} onClick={(event) => event.stopPropagation()}>
                <div className={styles.textPreviewTitle}>{textPreview.title}</div>
                <pre className={styles.textPreviewBody}>{textPreview.body}</pre>
                <div className={styles.previewActions} onClick={(event) => event.stopPropagation()}>
                  <button
                    className={styles.previewButton}
                    onClick={async () => {
                      const ok = await copyText(textPreview.body);
                      useAssistant
                        .getState()
                        .notify(ok ? "已复制" : "复制失败", ok ? "success" : "error");
                    }}
                  >
                    复制文本
                  </button>
                  <button className={styles.previewButton} onClick={() => setTextPreview(null)}>
                    关闭
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
