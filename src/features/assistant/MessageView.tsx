import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
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
import { loadRecentBytes } from "../../lib/storage/db";
import { copyText } from "../../lib/clipboard";
import { useViewer } from "../viewer/useViewerStore";
import { useTabs } from "../tabs/useTabStore";
import { QuoteIcon, SparkleIcon } from "../../components/icons/SparkleIcon";
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

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const KATEX_PLUGINS: NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]> = [
  [rehypeKatex, { throwOnError: false, strict: false, errorColor: "#d14d4d" }],
];

function markdownUrlTransform(url: string): string {
  return url.startsWith("cite:") ? url : defaultUrlTransform(url);
}

function MessageViewBase({ message, onQuote, onContextMenu }: Props) {
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
  const aiMode = useAssistant((state) => state.aiMode);
  const activeDocHash = useViewer((state) => state.docHash);
  const sourceLabel =
    aiMode === "shared" && message.docHash && message.docHash !== activeDocHash ? (
      <div className={styles.documentSource} title="这条消息来自另一份 PDF">
        <Icon name="page" size={11} />
        <span>{message.docName ?? "另一份 PDF"}</span>
      </div>
    ) : null;

  const citations = useMemo(() => extractCitations(message.content), [message.content]);
  const allowed = useMemo(
    () => new Set(message.allowedPages ?? message.citedPages ?? citations.map((item) => item.page)),
    [message.allowedPages, message.citedPages, citations],
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
    if (message.docHash && message.docHash !== activeDocHash) return;
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
  }, [citationsOpen, citations, message.docHash, activeDocHash]);

  const handleCopy = async () => {
    const ok = await copyText(message.content);
    setCopied(ok);
    notify(ok ? "已复制" : "复制失败", ok ? "success" : "error");
  };

  const jump = useCallback(
    (citation: Citation) => {
      setCitationsOpen(false);
      void (async () => {
        const targetHash = message.docHash;
        if (targetHash && targetHash !== useViewer.getState().docHash) {
          const tabs = useTabs.getState();
          let sourceTab = message.sourceTabId
            ? tabs.tabs.find((tab) => tab.id === message.sourceTabId)
            : undefined;
          if (sourceTab && sourceTab.docHash && sourceTab.docHash !== targetHash) {
            sourceTab = undefined;
          }
          sourceTab ??= tabs.tabs.find((tab) => tab.docHash === targetHash);
          if (sourceTab) {
            await tabs.activateTab(sourceTab.id);
          } else {
            const cached = await loadRecentBytes(targetHash).catch(() => null);
            if (!cached?.data) {
              notify("来源 PDF 已不在本地缓存，请重新打开后再查看引用", "error");
              return;
            }
            await tabs.openRecentTab(targetHash, message.docName ?? cached.name);
          }
          if (useViewer.getState().docHash !== targetHash) {
            notify("来源 PDF 尚未打开，无法定位引用", "error");
            return;
          }
        }
        useViewer.getState().requestCitation(citation.page, citation.quote);
      })();
    },
    [message.docHash, message.docName, message.sourceTabId, notify],
  );

  const markdown = useMemo(
    () =>
      message.role === "assistant"
        ? normalizeMath(markdownWithCitations(message.content, allowed))
        : "",
    [message.role, message.content, allowed],
  );
  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
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
    }),
    [jump],
  );
  const showToggle = message.role === "assistant" && message.content.length > 900;
  const tools = message.tools?.length ?? 0;
  const general =
    message.role === "assistant" &&
    !citations.length &&
    !tools &&
    Boolean(message.content.trim()) &&
    message.status !== "error";

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
        {sourceLabel}
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
      {sourceLabel}
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

      {citations.length || tools || general ? (
        <div className={styles.sourceDock} ref={citationRef}>
          {tools ? (
            <span
              className={styles.sourceBadge}
              title={`本次使用了 ${tools} 个外部工具`}
              aria-label={`使用了 ${tools} 个外部工具`}
            >
              <Icon name="globe" size={11} />
              {tools}
            </span>
          ) : null}
          {general ? (
            <span
              className={styles.sourceBadge}
              title="通用知识，非文档内容"
              aria-label="通用知识，非文档内容"
            >
              <SparkleIcon size={11} />
            </span>
          ) : null}
          {citations.length ? (
            <button
              className={styles.citationBadge}
              onClick={() => setCitationsOpen((open) => !open)}
              aria-label="查看引用"
              aria-expanded={citationsOpen}
              title="查看引用来源"
            >
              <Icon name="page" size={11} />
              {citations.length}
            </button>
          ) : null}
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
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={message.status === "streaming" ? [] : KATEX_PLUGINS}
            urlTransform={markdownUrlTransform}
            components={markdownComponents}
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
          aria-label={expanded ? "收起" : "展开全文"}
          title={expanded ? "收起" : "展开全文"}
        >
          <Icon name={expanded ? "chevronUp" : "chevronDown"} size={16} />
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
        <button
          className={styles.actionButton}
          onClick={handleCopy}
          title={copied ? "已复制" : "复制回答"}
          aria-label="复制回答"
        >
          <StateIcon off="copy" on="check" active={copied} size={14} />
        </button>
        <button
          className={styles.actionButton}
          onClick={() => void retry(message.id)}
          disabled={Boolean(streamingId)}
          title="重新生成"
          aria-label="重新生成"
        >
          <Icon name="retry" size={14} />
        </button>
        <button
          className={`${styles.actionButton} ${isQuoted ? styles.actionActive : ""}`}
          onClick={() => onQuote(message)}
          title={isQuoted ? "取消引用" : "引用为上下文"}
          aria-label={isQuoted ? "取消引用" : "引用为上下文"}
          aria-pressed={isQuoted}
        >
          <QuoteIcon size={14} />
        </button>
      </div>
    </div>
  );
}

export const MessageView = memo(MessageViewBase);
