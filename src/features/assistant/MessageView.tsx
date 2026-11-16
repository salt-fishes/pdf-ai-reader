import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { MorphIcon } from "morphicons/react";
import { Check, Copy, RotateCcw } from "lucide";
import type { ChatMessage } from "../../lib/ai/types";
import { countInvalidCitations, extractCitedPages } from "../../lib/ai/citations";
import { copyText } from "../../lib/clipboard";
import { useViewer } from "../viewer/useViewerStore";
import { QuoteIcon } from "../../components/icons/SparkleIcon";
import { WinIcon } from "../../components/icons/WinIcon";
import { useAssistant } from "./useAssistantStore";
import styles from "./Assistant.module.css";

type Props = {
  message: ChatMessage;
  onQuote: (message: ChatMessage) => void;
  onContextMenu: (event: ReactMouseEvent, message: ChatMessage) => void;
};

function markdownWithCitations(markdown: string, allowed: Set<number>): string {
  const parts = markdown.split(/(```[\s\S]*?```|`[^`]*`)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(/\[\[p\.(\d+)\]\]|\[p\.(\d+)\]/g, (raw, first, second) => {
        const page = Number(first ?? second);
        return allowed.has(page) ? `[p.${page}](cite:${page})` : raw;
      });
    })
    .join("");
}

function normalizeMath(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?```|`[^`]*`)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/\$\$([\s\S]*?)\$\$/g, (_, body: string) => `\n$$\n${body.trim()}\n$$\n`)
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, body: string) => `\n$$\n${body.trim()}\n$$\n`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, body: string) => `$${body.trim()}$`);
    })
    .join("");
}

export function MessageView({ message, onQuote, onContextMenu }: Props) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isQuoted = useAssistant((state) => state.isQuoted(message.id));
  const retry = useAssistant((state) => state.retry);
  const notify = useAssistant((state) => state.notify);
  const streamingId = useAssistant((state) => state.streamingId);
  const setBoostAnswer = useAssistant((state) => state.setBoostAnswer);

  const allowed = useMemo(
    () => new Set(message.allowedPages ?? message.citedPages ?? extractCitedPages(message.content)),
    [message.allowedPages, message.citedPages, message.content],
  );

  const cited = useMemo(() => extractCitedPages(message.content), [message.content]);
  const invalid = useMemo(
    () => (message.role === "assistant" ? countInvalidCitations(message.content, allowed) : 0),
    [message.content, allowed, message.role],
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    const ok = await copyText(message.content);
    setCopied(ok);
    notify(ok ? "已复制" : "复制失败", ok ? "success" : "error");
  };

  const jump = (page: number) => {
    useViewer.getState().requestScroll(page);
  };

  const markdown = message.role === "assistant" ? normalizeMath(markdownWithCitations(message.content, allowed)) : "";
  const showToggle = message.role === "assistant" && message.content.length > 220;

  if (message.role === "user") {
    return (
      <div
        className={`${styles.userRow} ${message.excluded ? styles.excluded : ""}`}
        onContextMenu={(event) => onContextMenu(event, message)}
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault();
            useAssistant.getState().toggleExclude(message.id);
          }
        }}
      >
        <div className={styles.userMessage}>{message.content}</div>
        {message.note ? <div className={styles.excludedTag}>{message.note}</div> : null}
        {message.excluded ? <div className={styles.excludedTag}>已从上下文移除</div> : null}
        <div className={styles.messageActions}>
          <button className={styles.actionButton} onClick={handleCopy} title="复制">
            <MorphIcon icon={copied ? Check : Copy} size={13} strokeWidth={1.7} spring="snappy" reducedMotion="user" />
          </button>
          <button
            className={`${styles.actionButton} ${isQuoted ? styles.actionActive : ""}`}
            onClick={() => onQuote(message)}
            title={isQuoted ? "取消引用" : "引用为上下文"}
            aria-pressed={isQuoted}
          >
            <QuoteIcon size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.assistantMessage} ${message.excluded ? styles.excluded : ""}`}
      onContextMenu={(event) => onContextMenu(event, message)}
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          useAssistant.getState().toggleExclude(message.id);
        }
      }}
    >
      {message.reasoning ? (
        <details className={styles.thinking}>
          <summary>
            思考过程
            {message.status === "streaming" ? (
              <span className={styles.thinkingLive}> · 生成中</span>
            ) : (
              <span className={styles.thinkingMeta}>
                {" "}
                · {message.reasoning.length.toLocaleString("zh-CN")} 字
              </span>
            )}
          </summary>
          <pre>{message.reasoning}</pre>
        </details>
      ) : null}

      {message.content ? (
        <div className={`${styles.messageBody} ${showToggle && !expanded ? styles.clamped : ""}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, errorColor: "#d14d4d" }]]}
            urlTransform={(url) => (url.startsWith("cite:") ? url : defaultUrlTransform(url))}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith("cite:")) {
                  const page = Number(href.slice(5));
                  return (
                    <button
                      className={styles.cite}
                      onClick={() => jump(page)}
                      title={`跳到第 ${page} 页`}
                      aria-label={`引用第 ${page} 页`}
                    >
                      p.{page}
                    </button>
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer noopener">
                    {children}
                  </a>
                );
              },
            }}
          >
            {markdown}
          </ReactMarkdown>
          {message.status === "streaming" ? <span className={styles.streamingCaret} /> : null}
        </div>
      ) : message.status === "streaming" ? (
        <div className={styles.messageBody}>
          {message.reasoning ? (
            <>
              正在思考<span className={styles.streamingCaret} />
            </>
          ) : (
            <>
              正在阅读上下文<span className={styles.streamingCaret} />
            </>
          )}
        </div>
      ) : null}

      {showToggle ? (
        <button
          className={styles.expandButton}
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            setBoostAnswer(next);
          }}
        >
          {expanded ? "收起" : "展开全文"}
        </button>
      ) : null}

      {message.status === "error" ? (
        <div className={styles.errorNote}>
          <div>{message.error ?? "生成失败"}</div>
          {message.errorHint ? <div className={styles.errorHint}>{message.errorHint}</div> : null}
        </div>
      ) : null}

      {invalid > 0 ? (
        <div className={styles.invalidCite}>
          有 {invalid} 处引用不在本次上下文中，已按普通文本显示。
        </div>
      ) : null}

      {message.status === "stopped" ? (
        <div className={styles.excludedTag}>已停止生成</div>
      ) : null}

      <div className={styles.messageActions}>
        <button className={styles.actionButton} onClick={handleCopy} title="复制回答">
          <MorphIcon icon={copied ? Check : Copy} size={13} strokeWidth={1.7} spring="snappy" reducedMotion="user" />
          <span>复制</span>
        </button>
        <button
          className={styles.actionButton}
          onClick={() => void retry(message.id)}
          disabled={Boolean(streamingId)}
          title="重新生成"
        >
          <MorphIcon icon={RotateCcw} size={13} strokeWidth={1.7} reducedMotion="user" />
          <span>重试</span>
        </button>
        <button
          className={`${styles.actionButton} ${isQuoted ? styles.actionActive : ""}`}
          onClick={() => onQuote(message)}
          title={isQuoted ? "取消引用" : "引用为上下文"}
          aria-pressed={isQuoted}
        >
          <QuoteIcon size={13} />
          <span>引用</span>
        </button>
        {cited.length ? (
          <span className={styles.actionButton} aria-hidden="true">
            <WinIcon glyph="page" size={11} />
            {cited.join(", ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
