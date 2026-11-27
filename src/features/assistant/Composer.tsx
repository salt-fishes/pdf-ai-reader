import { useEffect, useRef, useState } from "react";
import { Icon, StateIcon } from "../../components/icons/Icon";
import { useViewer } from "../viewer/useViewerStore";
import { ContextPicker } from "./ContextPicker";
import { useAssistant } from "./useAssistantStore";
import styles from "./Assistant.module.css";

export function Composer() {
  const draft = useAssistant((state) => state.draft);
  const setDraft = useAssistant((state) => state.setDraft);
  const send = useAssistant((state) => state.send);
  const stop = useAssistant((state) => state.stop);
  const streaming = useAssistant((state) => Boolean(state.streamingId));
  const sendError = useAssistant((state) => state.sendError);
  const addAttachment = useAssistant((state) => state.addAttachment);
  const smartFilter = useAssistant((state) => state.smartFilter);
  const filtering = useAssistant((state) => state.filtering);
  const numPages = useViewer((state) => state.numPages);
  const notify = useAssistant((state) => state.notify);
  const focusAt = useAssistant((state) => state.focusInputAt);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [contextOpen, setContextOpen] = useState(false);

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
      <div className={`${styles.inputCard} ${contextOpen ? styles.inputCardOpen : ""}`}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={draft}
          rows={1}
          placeholder="问这一页…"
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
          <button
            className={`${styles.contextAddButton} ${contextOpen ? styles.actionActive : ""}`}
            onClick={() => setContextOpen((open) => !open)}
            title="添加页面、截图、附件或总结"
            aria-label="添加上下文"
            aria-expanded={contextOpen}
          >
            <Icon name="plus" size={15} />
            添加上下文
          </button>

          <div className={styles.composerSpacer} />

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
      </div>

      {contextOpen ? (
        <div className={`${styles.popover} ${styles.popoverWide}`}>
          <ContextPicker onClose={() => setContextOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
