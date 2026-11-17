import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Icon, StateIcon } from "../../components/icons/Icon";
import type { ChatMessage } from "../../lib/ai/types";
import {
  countInvalidCitations,
  extractCitations,
  findQuoteLine,
  mapCitations,
  type Citation,
} from "../../lib/ai/citations";
import { getActiveDocument, getPageText } from "../../lib/pdf/pdf";
import { copyText } from "../../lib/clipboard";
import { useViewer } from "../viewer/useViewerStore";
import { QuoteIcon } from "../../components/icons/SparkleIcon";
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
      return mapCitations(part, (citation) => {
        if (!allowed.has(citation.page)) return citation.raw;
        const quote = citation.quote ? `|${encodeURIComponent(citation.quote)}` : "";
        return `[p.${citation.page}](cite:${citation.page}${quote})`;
      });
    })
    .join("");
}

function parseCiteHref(href: string): Citation | null {
  if (!href.startsWith("cite:")) return null;
  const [pagePart, encoded] = href.slice(5).split("|");
  const page = Number(pagePart);
  if (!Number.isInteger(page) || page < 1) return null;
  let quote: string | undefined;
  if (encoded) {
    try {
      quote = decodeURIComponent(encoded);
    } catch {
      quote = undefined;
    }
  }
  return { page, quote, raw: href };
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
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [lineHints, setLineHints] = useState<Record<string, number>>({});
  const citationRef = useRef<HTMLDivElement>(null);
  const isQuoted = useAssistant((state) => state.isQuoted(message.id));
  const retry = useAssistant((state) => state.retry);
  const notify = useAssistant((state) => state.notify);
  const streamingId = useAssistant((state) => state.streamingId);
  const setBoostAnswer = useAssistant((state) => state.setBoostAnswer);

  const citations = useMemo(() => extractCitations(message.content), [message.content]);
  const allowed = useMemo(
    () => new Set(message.allowedPages ?? message.citedPages ?? citations.map((item) => item.page)),
    [message.allowedPages, message.citedPages, citations],
  );

  const cited = useMemo(
    () => [...new Set(citations.map((citation) => citation.page))],
    [citations],
  );
  const invalid = useMemo(
    () => (message.role === "assistant" ? countInvalidCitations(message.content, allowed) : 0),
    [message.content, allowed, message.role],
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!citationsOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!citationRef.current?.contains(event.target as Node)) setCitationsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setCitationsOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [citationsOpen]);

  useEffect(() => {
    if (!citationsOpen || !citations.length) return;
    const pdf = getActiveDocument();
    if (!pdf) return;
    let alive = true;
    const targets = citations.filter((citation) => citation.quote);
    if (!targets.length) return;
    void Promise.all(
      targets.map(async (citation) => {
        const text = await getPageText(pdf, citation.page).catch(() => "");
        return [
          `${citation.page}|${citation.quote ?? ""}`,
          findQuoteLine(text, citation.quote ?? ""),
        ] as const;
      }),
    ).then((entries) => {
      if (!alive) return;
      const next: Record<string, number> = {};
      for (const [key, line] of entries) {
        if (line) next[key] = line;
      }
      setLineHints(next);
    });
    return () => {
      alive = false;
    };
  }, [citationsOpen, citations]);

  const handleCopy = async () => {
    const ok = await copyText(message.content);
    setCopied(ok);
    notify(ok ? "已复制" : "复制失败", ok ? "success" : "error");
  };

  const jump = (citation: Citation) => {
    useViewer.getState().requestCitation(citation.page, citation.quote);
    setCitationsOpen(false);
  };

  const markdown =
    message.role === "assistant"
      ? normalizeMath(markdownWithCitations(message.content, allowed))
      : "";
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
            <StateIcon off="copy" on="check" active={copied} size={14} />
          </button>
          <button
            className={`${styles.actionButton} ${isQuoted ? styles.actionActive : ""}`}
            onClick={() => onQuote(message)}
            title={isQuoted ? "取消引用" : "引用为上下文"}
            aria-pressed={isQuoted}
          >
            <QuoteIcon size={14} />
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

      {message.tools?.length ? (
        <div className={styles.toolList} aria-label="外部工具调用">
          {message.tools.map((tool) => (
            <details
              className={`${styles.toolCard} ${tool.phase === "error" ? styles.toolCardError : ""}`}
              key={tool.id}
              data-tool-phase={tool.phase}
            >
              <summary>
                <Icon
                  name={
                    tool.phase === "start" ? "search" : tool.phase === "error" ? "error" : "check"
                  }
                  size={13}
                />
                <span className={styles.toolLabel}>{tool.label}</span>
                <span className={styles.toolMeta}>
                  {tool.phase === "start"
                    ? "调用中…"
                    : tool.phase === "error"
                      ? "失败"
                      : (tool.summary ?? "完成")}
                  {tool.durationMs
                    ? ` · ${(tool.durationMs / 1000).toFixed(tool.durationMs < 10_000 ? 1 : 0)}s`
                    : ""}
                </span>
              </summary>
              {tool.args ? (
                <pre className={styles.toolArgs}>{JSON.stringify(tool.args, null, 2)}</pre>
              ) : null}
              {tool.error ? <div className={styles.toolError}>{tool.error}</div> : null}
            </details>
          ))}
        </div>
      ) : null}

      {citations.length ? (
        <div className={styles.citationDock} ref={citationRef}>
          <button
            className={styles.citationBadge}
            onClick={() => setCitationsOpen((open) => !open)}
            aria-label="查看引用"
            aria-expanded={citationsOpen}
            title="查看引用来源"
          >
            <Icon name="page" size={10} />
            引用 {citations.length}
          </button>
          {citationsOpen ? (
            <div className={styles.citationPopover} role="menu" aria-label="引用来源">
              {citations.map((citation, index) => {
                const line = lineHints[`${citation.page}|${citation.quote ?? ""}`];
                return (
                  <button
                    className={styles.citationItem}
                    role="menuitem"
                    key={`${citation.raw}_${index}`}
                    onClick={() => jump(citation)}
                    title={citation.quote ?? `跳到第 ${citation.page} 页`}
                  >
                    <span className={styles.citationWhere}>
                      p.{citation.page}
                      {line ? ` · 第 ${line} 行` : ""}
                    </span>
                    <span className={styles.citationText}>
                      {citation.quote ? `“${citation.quote}”` : "跳到本页上次阅读位置"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {message.content ? (
        <div className={`${styles.messageBody} ${showToggle && !expanded ? styles.clamped : ""}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[
              [rehypeKatex, { throwOnError: false, strict: false, errorColor: "#d14d4d" }],
            ]}
            urlTransform={(url) => (url.startsWith("cite:") ? url : defaultUrlTransform(url))}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith("cite:")) {
                  const citation = parseCiteHref(href);
                  if (!citation) return <>{children}</>;
                  return (
                    <button
                      className={styles.cite}
                      onClick={() => jump(citation)}
                      title={
                        citation.quote
                          ? `p.${citation.page} · ${citation.quote}`
                          : `跳到第 ${citation.page} 页`
                      }
                      aria-label={`引用第 ${citation.page} 页`}
                    >
                      p.{citation.page}
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
              正在思考
              <span className={styles.streamingCaret} />
            </>
          ) : (
            <>
              正在阅读上下文
              <span className={styles.streamingCaret} />
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

      {message.status === "stopped" ? <div className={styles.excludedTag}>已停止生成</div> : null}

      <div className={styles.messageActions}>
        <button className={styles.actionButton} onClick={handleCopy} title="复制回答">
          <StateIcon off="copy" on="check" active={copied} size={14} />
          <span>复制</span>
        </button>
        <button
          className={styles.actionButton}
          onClick={() => void retry(message.id)}
          disabled={Boolean(streamingId)}
          title="重新生成"
        >
          <Icon name="retry" size={14} />
          <span>重试</span>
        </button>
        <button
          className={`${styles.actionButton} ${isQuoted ? styles.actionActive : ""}`}
          onClick={() => onQuote(message)}
          title={isQuoted ? "取消引用" : "引用为上下文"}
          aria-pressed={isQuoted}
        >
          <QuoteIcon size={14} />
          <span>引用</span>
        </button>
        {cited.length ? (
          <span className={styles.actionButton} aria-hidden="true">
            <Icon name="page" size={14} />
            {cited.join(", ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
