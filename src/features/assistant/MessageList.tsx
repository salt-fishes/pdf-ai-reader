import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ChatMessage } from "../../lib/ai/types";
import { QuoteIcon, SparkleIcon } from "../../components/icons/SparkleIcon";
import { WinIcon } from "../../components/icons/WinIcon";
import { formatTokens } from "../../lib/tokens/estimate";
import { useViewer } from "../viewer/useViewerStore";
import { useAssistant, useContextCount } from "./useAssistantStore";
import { MessageView } from "./MessageView";
import styles from "./Assistant.module.css";

type MenuState = { x: number; y: number; message: ChatMessage } | null;

export function MessageList() {
  const messages = useAssistant((state) => state.messages);
  const loadingChat = useAssistant((state) => state.loadingChat);
  const streamingId = useAssistant((state) => state.streamingId);
  const toggleQuote = useAssistant((state) => state.toggleQuote);
  const toggleExclude = useAssistant((state) => state.toggleExclude);
  const isQuoted = useAssistant((state) => state.isQuoted);
  const send = useAssistant((state) => state.send);
  const summarizeDocument = useAssistant((state) => state.summarizeDocument);
  const summary = useAssistant((state) => state.summary);
  const stopSummary = useAssistant((state) => state.stopSummary);
  const context = useAssistant((state) => state.context);
  const projected = useAssistant((state) => state.projected);
  const boostContext = useAssistant((state) => state.boostContext);
  const count = useContextCount();
  const docName = useViewer((state) => state.docName);
  const numPages = useViewer((state) => state.numPages);

  const suggestions = useMemo(() => {
    if (!docName) return [];
    const list: string[] = [];
    if (context.screenshots.length) list.push("这张截图里有什么？");
    if (context.selection) list.push("解释这段选中文字");
    if (context.smart) list.push("概括筛选出的内容");
    if (context.pageRange || context.currentPage) list.push("总结当前页的要点");
    list.push("当前页有哪些关键概念？");
    return [...new Set(list)].slice(0, 2);
  }, [
    context.screenshots.length,
    context.selection,
    context.smart,
    context.pageRange,
    context.currentPage,
    docName,
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const previousStreaming = useRef<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (stickRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (streamingId) {
      stickRef.current = true;
    } else if (previousStreaming.current) {
      const answers = element.querySelectorAll<HTMLElement>('[class*="assistantMessage"]');
      const last = answers[answers.length - 1];
      if (last) {
        const messageHeight = last.getBoundingClientRect().height;
        if (messageHeight > element.clientHeight - 24) {
          const questions = element.querySelectorAll<HTMLElement>('[class*="userRow"]');
          const anchor = questions[questions.length - 1] ?? last;
          const top =
            anchor.getBoundingClientRect().top -
            element.getBoundingClientRect().top +
            element.scrollTop -
            4;
          element.scrollTop = Math.max(0, top);
        }
      }
    }
    previousStreaming.current = streamingId;
  }, [streamingId]);

  useEffect(() => {
    if (!menu) return;
    const onPointer = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setMenu(null);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  const openMenu = (event: ReactMouseEvent, message: ChatMessage) => {
    event.preventDefault();
    const width = 200;
    const height = 82;
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
      message,
    });
  };

  const summarize = () => {
    if (summary || streamingId || !numPages) return;
    void summarizeDocument();
  };

  const summaryLabel = summary
    ? summary.stage === "reading"
      ? `正在读取 ${summary.done}/${summary.total} 页`
      : summary.stage === "mapping"
        ? `正在总结 ${summary.done}/${summary.total} 段`
        : summary.stage === "reducing"
          ? `正在合并 ${summary.done}/${summary.total} 段`
          : "正在写总结…"
    : "";

  return (
    <>
      <div
        className={styles.messages}
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
        }}
      >
        {summary ? (
          <div className={styles.summaryStatus} role="status" aria-live="polite">
            <span className="spin" />
            <span>{summaryLabel}</span>
            <button className={styles.summaryStop} onClick={stopSummary}>
              取消
            </button>
          </div>
        ) : null}
        {loadingChat ? (
          <div className={styles.emptyState}>
            <div className="spin" style={{ margin: "0 auto" }} />
          </div>
        ) : messages.length === 0 ? (
          boostContext && count > 0 ? (
            <div className={styles.emptyCompact}>上下文已就绪，直接提问即可。</div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <SparkleIcon size={20} />
              </div>
              <div className={styles.emptyTitle}>
                {count > 0 ? "上下文已就绪" : "从眼前的内容开始"}
              </div>
              <div className={styles.emptyText}>
                {count > 0 ? (
                  <>
                    {count} 个来源 · ≈ {formatTokens(projected)} token
                    <br />
                    直接提问，或从下面开始。
                  </>
                ) : (
                  <>
                    选中文字引用、截一张图，或限定页码，
                    <br />
                    再问任何你想问的。
                  </>
                )}
              </div>
              {suggestions.length || numPages > 0 ? (
                <div className={styles.suggestions}>
                  {numPages > 0 ? (
                    <button
                      className={`${styles.suggestion} ${styles.summarySuggestion}`}
                      onClick={summarize}
                      disabled={Boolean(summary) || Boolean(streamingId)}
                    >
                      <span className={styles.summaryText}>
                        <span>总结整份文档</span>
                        <small>
                          {summary ? summaryLabel : `全文 ${numPages} 页 · 自动分段`}
                        </small>
                      </span>
                      <span aria-hidden="true">→</span>
                    </button>
                  ) : null}
                  {suggestions.map((text) => (
                    <button
                      key={text}
                      className={styles.suggestion}
                      onClick={() => void send(text)}
                      disabled={Boolean(summary)}
                    >
                      {text}
                      <span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        ) : (
          messages.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              onQuote={(item) => toggleQuote(item)}
              onContextMenu={openMenu}
            />
          ))
        )}
      </div>

      {menu ? (
        <div
          className={styles.menu}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className={styles.menuItem}
            role="menuitem"
            onClick={() => {
              toggleQuote(menu.message);
              setMenu(null);
            }}
          >
            <QuoteIcon size={14} />
            {isQuoted(menu.message.id) ? "取消引用" : "引用为上下文"}
            <span className={styles.menuHint}>上下文</span>
          </button>
          <button
            className={styles.menuItem}
            role="menuitem"
            onClick={() => {
              toggleExclude(menu.message.id);
              setMenu(null);
            }}
          >
            <WinIcon glyph={menu.message.excluded ? "check" : "clear"} size={13} />
            {menu.message.excluded ? "恢复到上下文" : "从上下文移除"}
            <span className={styles.menuHint}>中键</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
