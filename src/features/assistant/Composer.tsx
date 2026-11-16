import { useEffect, useRef, useState } from "react";
import { Icon, StateIcon } from "../../components/icons/Icon";
import { formatTokens } from "../../lib/tokens/estimate";
import { useViewer } from "../viewer/useViewerStore";
import { PagePicker } from "./PagePicker";
import { useAssistant } from "./useAssistantStore";
import styles from "./Assistant.module.css";

export function Composer() {
  const draft = useAssistant((state) => state.draft);
  const setDraft = useAssistant((state) => state.setDraft);
  const send = useAssistant((state) => state.send);
  const stop = useAssistant((state) => state.stop);
  const streaming = useAssistant((state) => Boolean(state.streamingId));
  const projected = useAssistant((state) => state.projected);
  const budget = useAssistant((state) => state.budget);
  const sendError = useAssistant((state) => state.sendError);
  const attaching = useAssistant((state) => state.attaching);
  const capturingPage = useAssistant((state) => state.capturingPage);
  const addAttachment = useAssistant((state) => state.addAttachment);
  const capturePage = useAssistant((state) => state.capturePage);
  const startRegionCapture = useAssistant((state) => state.startRegionCapture);
  const summarizeDocument = useAssistant((state) => state.summarizeDocument);
  const summary = useAssistant((state) => state.summary);
  const smartFilter = useAssistant((state) => state.smartFilter);
  const filtering = useAssistant((state) => state.filtering);
  const numPages = useViewer((state) => state.numPages);
  const notify = useAssistant((state) => state.notify);
  const focusAt = useAssistant((state) => state.focusInputAt);
  const context = useAssistant((state) => state.context);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pageOpen, setPageOpen] = useState(false);

  useEffect(() => {
    if (focusAt) inputRef.current?.focus();
  }, [focusAt]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "30px";
    element.style.height = `${Math.min(92, element.scrollHeight)}px`;
  }, [draft]);

  const submit = () => {
    if (streaming) {
      stop();
      return;
    }
    if (filtering || !draft.trim()) return;
    void send(draft);
  };

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of [...files]) {
      const result = await addAttachment(file);
      if (!result.ok) notify(result.message ?? "附件失败", "error");
    }
  };

  const overBudget = projected * 1.15 > budget;

  return (
    <div
      className={styles.composer}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.files.length) void handleFiles(event.dataTransfer.files);
      }}
    >
      <textarea
        ref={inputRef}
        className={styles.input}
        value={draft}
        rows={1}
        placeholder="就这份文档提问…"
        aria-label="提问"
        onChange={(event) => setDraft(event.target.value)}
        onPaste={(event) => {
          const files = [...event.clipboardData.items]
            .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
          if (files.length) {
            event.preventDefault();
            void handleFiles(files);
          }
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />

      {filtering ? (
        <div className={styles.filterProgress} role="status">
          <span className="spin" />
          正在本地筛选 {filtering.done}/{filtering.total} 页…
        </div>
      ) : null}

      {sendError ? (
        <div className={styles.exceeded}>
          <span>{sendError}</span>
          {draft.trim() && numPages >= 8 ? (
            <button
              className={styles.exceededAction}
              onClick={() => void smartFilter()}
              disabled={Boolean(filtering)}
            >
              智能筛选全文
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.composerRow}>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept=".pdf,application/pdf,image/*,.txt,.md,.markdown,.csv,.json"
          onChange={(event) => {
            if (event.target.files) void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          className={styles.toolButton}
          onClick={() => fileRef.current?.click()}
          disabled={attaching}
          title="添加附件（PDF / 图片 / 文本）"
          aria-label="添加附件"
        >
          {attaching ? <span className="spin" /> : <Icon name="attach" size={16} />}
        </button>
        <button
          className={styles.toolButton}
          onClick={() => {
            const page = useViewer.getState().currentPage;
            void capturePage(page);
          }}
          disabled={capturingPage !== null || !useViewer.getState().docHash}
          title="截取当前页"
          aria-label="截取当前页"
          aria-keyshortcuts="Control+Alt+S"
        >
          {capturingPage !== null ? <span className="spin" /> : <Icon name="camera" size={16} />}
        </button>
        <button
          className={styles.toolButton}
          onClick={() => {
            const page = useViewer.getState().currentPage;
            startRegionCapture(page);
          }}
          disabled={capturingPage !== null || !useViewer.getState().docHash}
          title="框选截图（在页面上拖拽）"
          aria-label="框选截图"
          aria-keyshortcuts="Control+Alt+R"
        >
          {capturingPage !== null ? <span className="spin" /> : <Icon name="crop" size={16} />}
        </button>
        <button
          className={styles.toolButton}
          onClick={() => void summarizeDocument()}
          disabled={Boolean(summary) || streaming || !useViewer.getState().docHash}
          title="总结整份文档（自动分段，不把全部页面塞进当前上下文）"
          aria-label="总结整份文档"
        >
          {summary ? <span className="spin" /> : <Icon name="outline" size={16} />}
        </button>
        <button
          className={`${styles.toolButton} ${pageOpen ? styles.actionActive : ""}`}
          onClick={() => setPageOpen((open) => !open)}
          title="限定页码"
          aria-label="限定页码"
          aria-expanded={pageOpen}
        >
          <Icon name="page" size={16} />
        </button>

        <div className={styles.composerSpacer} />

        <span
          className={`${styles.tokenHint} ${overBudget ? styles.tokenWarn : ""}`}
          title="本次发送的 token 估算"
        >
          ≈ {formatTokens(projected)}
          {context.screenshots.length ? ` · ${context.screenshots.length} 图` : ""}
        </span>
        <button
          className={`${styles.sendButton} ${streaming ? styles.stop : ""}`}
          onClick={submit}
          disabled={!streaming && (!draft.trim() || Boolean(filtering))}
          aria-label={streaming ? "停止生成" : "发送"}
          title={streaming ? "停止生成" : "发送（Enter）"}
        >
          <StateIcon off="send" on="stop" active={streaming} size={16} strokeWidth={2} />
        </button>
      </div>

      {pageOpen ? (
        <div className={`${styles.popover} ${styles.popoverWide}`}>
          <PagePicker onClose={() => setPageOpen(false)} showSmart />
        </div>
      ) : null}
    </div>
  );
}
