import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ChatMessage } from "../../lib/ai/types";
import { QuoteIcon, SparkleIcon } from "../../components/icons/SparkleIcon";
import { Icon, type IconName } from "../../components/icons/Icon";
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
  const boostContext = useAssistant((state) => state.boostContext);
  const count = useContextCount();
  const docName = useViewer((state) => state.docName);
  const numPages = useViewer((state) => state.numPages);
  const currentPage = useViewer((state) => state.currentPage);

  const suggestions = useMemo<Array<{ text: string; label: string; icon: IconName }>>(() => {
    if (!docName) return [];
    const list: Array<{ text: string; label: string; icon: IconName }> = [];
    if (context.screenshots.length)
      list.push({ text: "这张截图里有什么？", label: "看图", icon: "camera" });
    if (context.selection)
      list.push({ text: "解释这段选中文字", label: "解释选中", icon: "highlight" });
    if (context.smart) list.push({ text: "概括筛选出的内容", label: "概括筛选", icon: "search" });
    if (context.pageRange || context.currentPage)
      list.push({ text: "总结当前页的要点", label: "总结本页", icon: "page" });
    list.push({ text: "当前页有哪些关键概念？", label: "关键概念", icon: "outline" });
    return [...new Map(list.map((item) => [item.text, item])).values()].slice(0, 3);
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
  const lastTopRef = useRef(0);
  const previousStreaming = useRef<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (stickRef.current) {
      element.scrollTop = element.scrollHeight;
      setAtBottom(true);
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
      <div className={styles.messageArea}>
        <div
          className={`${styles.messages} ${messages.length === 0 ? styles.messagesEmpty : ""}`}
          ref={scrollRef}
          tabIndex={0}
          aria-label="对话消息"
          onScroll={(event) => {
            const element = event.currentTarget;
            const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
            if (bottom) stickRef.current = true;
            else if (element.scrollTop < lastTopRef.current - 2) stickRef.current = false;
            lastTopRef.current = element.scrollTop;
            setAtBottom(bottom);
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
                <div className={styles.emptyHero}>
                  <div className={styles.emptyIcon}>
                    <SparkleIcon size={20} />
                  </div>
                  {docName ? (
                    <div className={styles.docChip} title={docName}>
                      <Icon name="page" size={12} />
                      <span className={styles.docName}>{docName}</span>
                      <span className={styles.docMeta}>
                        {numPages} 页 · P{currentPage}
                      </span>
                    </div>
                  ) : null}
                  <div className={styles.emptyTitle}>
                    {count > 0 ? "上下文已就绪" : "从这一页开始"}
                  </div>
                  <div className={styles.emptyText}>
                    {count > 0 ? "直接提问，或从下面开始。" : "选中文字、截图或指定页码，再提问。"}
                  </div>
                </div>
                {suggestions.length || numPages > 0 ? (
                  <div className={styles.emptyActions}>
                    {numPages > 0 ? (
                      <button
                        className={`${styles.emptyAction} ${styles.summarySuggestion}`}
                        onClick={summarize}
                        disabled={Boolean(summary) || Boolean(streamingId)}
                        title={`总结整份文档 · 全文 ${numPages} 页，自动分段`}
                      >
                        <span className={styles.emptyActionIcon}>
                          <Icon name="outline" size={17} />
                        </span>
                        <span className={styles.emptyActionText}>
                          <span className={styles.emptyActionLabel}>总结全文</span>
                          <span className={styles.emptyActionMeta}>
                            {summary ? summaryLabel : `${numPages} 页`}
                          </span>
                        </span>
                      </button>
                    ) : null}
                    {suggestions.map((item) => (
                      <button
                        key={item.text}
                        className={styles.emptyAction}
                        onClick={() => void send(item.text)}
                        disabled={Boolean(summary)}
                        title={item.text}
                      >
                        <span className={styles.emptyActionIcon}>
                          <Icon name={item.icon} size={17} />
                        </span>
                        <span className={styles.emptyActionText}>
                          <span className={styles.emptyActionLabel}>{item.label}</span>
                        </span>
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
        {!atBottom && messages.length ? (
          <button
            className={styles.jumpLatest}
            onClick={() => {
              const element = scrollRef.current;
              if (!element) return;
              stickRef.current = true;
              setAtBottom(true);
              element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
            }}
            aria-label="回到最新"
            title="回到最新"
          >
            <Icon name="down" size={16} />
            {streamingId ? <span className={styles.jumpDot} aria-hidden="true" /> : null}
          </button>
        ) : null}
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
            <Icon name={menu.message.excluded ? "check" : "clear"} size={14} />
            {menu.message.excluded ? "恢复到上下文" : "从上下文移除"}
            <span className={styles.menuHint}>中键</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
