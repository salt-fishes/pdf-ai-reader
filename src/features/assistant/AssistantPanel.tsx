import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "../../components/icons/Icon";
import { ModelIcon, modelLabel } from "../../components/icons/ModelIcon";
import { SparkleIcon } from "../../components/icons/SparkleIcon";
import { fetchModels } from "../../lib/ai/client";
import { useAssistant } from "./useAssistantStore";
import { registerPanelControl } from "./panelControl";
import { MessageList } from "./MessageList";
import { ContextBar } from "./ContextBar";
import { Composer } from "./Composer";
import styles from "./Assistant.module.css";

const MIN_WIDTH = 340;
const MIN_HEIGHT = 300;
const FAB_SIZE = 54;

function isMultimodal(model: string): boolean {
  return /deepseek|gpt-4|gpt-5|o[34]|claude|gemini|qwen|glm|kimi|vision|vl/i.test(model);
}

function fabRect(): { x: number; y: number; width: number; height: number } {
  const mobile = window.innerWidth <= 720;
  const margin = mobile ? 16 : 24;
  return {
    x: window.innerWidth - margin - FAB_SIZE,
    y: window.innerHeight - margin - FAB_SIZE,
    width: FAB_SIZE,
    height: FAB_SIZE,
  };
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function AssistantPanel() {
  const status = useAssistant((state) => state.status);
  const mode = useAssistant((state) => state.mode);
  const setMode = useAssistant((state) => state.setMode);
  const origin = useAssistant((state) => state.origin);
  const panel = useAssistant((state) => state.panel);
  const model = useAssistant((state) => state.model);
  const models = useAssistant((state) => state.models);
  const config = useAssistant((state) => state.config);
  const boostContext = useAssistant((state) => state.boostContext);
  const boostAnswer = useAssistant((state) => state.boostAnswer);
  const boosted = boostContext || boostAnswer;
  const streaming = useAssistant((state) => Boolean(state.streamingId));
  const thinking = useAssistant((state) => state.thinking);
  const setThinking = useAssistant((state) => state.setThinking);
  const sessions = useAssistant((state) => state.sessions);
  const activeSessionId = useAssistant((state) => state.activeSessionId);
  const newSession = useAssistant((state) => state.newSession);
  const switchSession = useAssistant((state) => state.switchSession);
  const deleteSession = useAssistant((state) => state.deleteSession);
  const clearConfirm = useAssistant((state) => state.clearConfirm);
  const setClearConfirm = useAssistant((state) => state.setClearConfirm);
  const clearAll = useAssistant((state) => state.clearAll);
  const setModel = useAssistant((state) => state.setModel);
  const setPanel = useAssistant((state) => state.setPanel);
  const minimize = useAssistant((state) => state.minimize);
  const close = useAssistant((state) => state.close);

  const panelRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const entranceRef = useRef(false);
  const [rect, setRect] = useState(panel);
  const [modelOpen, setModelOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [modelList, setModelList] = useState<string[]>(models);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState("");
  const [ghost, setGhost] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 720,
  );

  const sidebar = mode === "sidebar" && !narrow;
  const sidebarMax = Math.min(560, Math.max(340, window.innerWidth - 360));
  const sidebarWidth = Math.min(Math.max(rect.width, 320), sidebarMax);

  const effectiveHeight = rect.manual
    ? rect.height
    : boosted
      ? Math.min(540, window.innerHeight - 140)
      : rect.height;
  const effectiveTop =
    boosted && !rect.manual ? Math.max(56, rect.top + rect.height - effectiveHeight) : rect.top;

  useEffect(() => {
    setRect(panel);
  }, [panel]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setRect((current) => {
        const width = Math.min(current.width, window.innerWidth - 16);
        const height = Math.min(current.height, window.innerHeight - 16);
        return {
          ...current,
          width,
          height,
          left: Math.min(Math.max(current.left, 8), Math.max(8, window.innerWidth - width - 8)),
          top: Math.min(Math.max(current.top, 8), Math.max(8, window.innerHeight - height - 8)),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Entrance: morph from the trigger (FAB or header AI button) to the panel.
  // Sidebar mode slides in via layout instead of a large FAB morph.
  useEffect(() => {
    if (status !== "open") {
      entranceRef.current = false;
      return;
    }
    if (entranceRef.current) return;
    entranceRef.current = true;
    const element = panelRef.current;
    if (!element || sidebar || !origin || reduced()) return;
    const target = element.getBoundingClientRect();
    const scale = origin.width / target.width;
    const dx = origin.x + origin.width / 2 - (target.left + target.width / 2);
    const dy = origin.y + origin.height / 2 - (target.top + target.height / 2);
    const animation = element.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          borderRadius: "50%",
          opacity: 0.55,
        },
        { transform: "translate(0, 0) scale(1)", borderRadius: "18px", opacity: 1 },
      ],
      { duration: 360, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    return () => animation.cancel();
  }, [status, origin, sidebar]);

  const animateOut = useCallback(
    (mode: "minimize" | "close") => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      const element = panelRef.current;
      const finish = () => {
        exitingRef.current = false;
        setGhost(false);
        if (mode === "minimize") {
          minimize();
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>("[data-assistant-fab]")?.focus();
          });
        } else {
          close();
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>("[data-ai-entry]")?.focus();
          });
        }
      };

      if (!element || reduced()) {
        finish();
        return;
      }

      let animation: Animation;
      if (mode === "minimize" && sidebar) {
        animation = element.animate(
          [
            { transform: "translateX(0)", opacity: 1 },
            { transform: "translateX(26px)", opacity: 0 },
          ],
          { duration: 220, easing: "ease-in" },
        );
      } else if (mode === "minimize") {
        const target = fabRect();
        const current = element.getBoundingClientRect();
        const scale = target.width / current.width;
        const dx = target.x + target.width / 2 - (current.left + current.width / 2);
        const dy = target.y + target.height / 2 - (current.top + current.height / 2);
        setGhost(true);
        animation = element.animate(
          [
            { transform: "translate(0,0) scale(1)", borderRadius: "18px", opacity: 1 },
            {
              transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
              borderRadius: "50%",
              opacity: 0.15,
            },
          ],
          { duration: 320, easing: "cubic-bezier(.4,0,.2,1)" },
        );
      } else {
        animation = element.animate(
          [
            { transform: "translateY(0) scale(1)", opacity: 1 },
            { transform: "translateY(6px) scale(0.98)", opacity: 0 },
          ],
          { duration: 200, easing: "ease-out" },
        );
      }

      animation.onfinish = finish;
      animation.oncancel = () => {
        exitingRef.current = false;
        setGhost(false);
      };
    },
    [close, minimize, sidebar],
  );

  useEffect(() => {
    return registerPanelControl({
      minimize: () => animateOut("minimize"),
      close: () => animateOut("close"),
    });
  }, [animateOut]);

  useEffect(() => {
    if (!modelOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!modelRef.current?.contains(event.target as Node)) setModelOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [modelOpen]);

  useEffect(() => {
    if (!sessionOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!sessionRef.current?.contains(event.target as Node)) {
        setSessionOpen(false);
        setPendingDelete(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setSessionOpen(false);
        setPendingDelete(null);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [sessionOpen]);

  const refreshModels = async () => {
    setModelBusy(true);
    setModelError("");
    try {
      const list = await fetchModels();
      if (list.length) setModelList(list);
      else setModelError("服务端没有返回模型列表");
    } catch (error) {
      setModelError(error instanceof Error ? error.message : "无法获取模型列表");
    } finally {
      setModelBusy(false);
    }
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || sidebar) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...rect, top: effectiveTop, height: effectiveHeight };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    if (panelRef.current) panelRef.current.style.transition = "none";
    setInteracting(true);

    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const width = Math.min(start.width, window.innerWidth - 8);
      const height = Math.min(start.height, window.innerHeight - 8);
      setRect({
        ...start,
        width,
        height,
        left: Math.min(Math.max(start.left + dx, 8 - width + 96), window.innerWidth - 96),
        top: Math.min(Math.max(start.top + dy, 8), window.innerHeight - 72),
      });
    };

    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setInteracting(false);
      if (panelRef.current) panelRef.current.style.transition = "";
      const current = panelRef.current?.getBoundingClientRect();
      if (current) {
        setPanel({
          ...rect,
          left: current.left,
          top: current.top,
          width: current.width,
          height: current.height,
          docked: window.innerWidth - current.right < 40,
          manual: true,
        });
      }
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelRef.current?.getBoundingClientRect().width ?? rect.width;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    if (panelRef.current) panelRef.current.style.transition = "none";
    setInteracting(true);

    const move = (moveEvent: PointerEvent) => {
      const width = Math.min(
        560,
        Math.max(340, window.innerWidth - 360),
        Math.max(320, startWidth + startX - moveEvent.clientX),
      );
      setRect((current) => ({ ...current, width }));
      useAssistant.getState().setPanelPreviewWidth(width);
    };

    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setInteracting(false);
      if (panelRef.current) panelRef.current.style.transition = "";
      const width = panelRef.current?.getBoundingClientRect().width;
      if (width) {
        setPanel({ ...useAssistant.getState().panel, width });
      }
      useAssistant.getState().setPanelPreviewWidth(null);
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, direction: string) => {
    if (event.button !== 0 || sidebar) return;
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...rect, top: effectiveTop, height: effectiveHeight, manual: true };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    if (panelRef.current) panelRef.current.style.transition = "none";
    // The auto-boosted height is only a presentation default; switching to
    // manual here lets n/s handles resize the panel while the pointer moves.
    setRect(start);
    setInteracting(true);

    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let { left, top, width, height } = start;
      if (direction.includes("e")) width = start.width + dx;
      if (direction.includes("s")) height = start.height + dy;
      if (direction.includes("w")) {
        width = start.width - dx;
        left = start.left + dx;
      }
      if (direction.includes("n")) {
        height = start.height - dy;
        top = start.top + dy;
      }
      width = Math.min(Math.max(width, MIN_WIDTH), window.innerWidth - 16);
      height = Math.min(Math.max(height, MIN_HEIGHT), window.innerHeight - 16);
      if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
      if (top + height > window.innerHeight - 8) top = window.innerHeight - 8 - height;
      left = Math.max(8, left);
      top = Math.max(8, top);
      setRect({ ...start, left, top, width, height, manual: true });
    };

    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setInteracting(false);
      if (panelRef.current) panelRef.current.style.transition = "";
      const current = panelRef.current?.getBoundingClientRect();
      if (current) {
        setPanel({
          ...rect,
          left: current.left,
          top: current.top,
          width: current.width,
          height: current.height,
          docked: window.innerWidth - current.right < 40,
          manual: true,
        });
      }
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  if (status !== "open") return null;

  const list = modelList.length ? modelList : (config?.models ?? [model]);
  const allowed = new Set(config?.models ?? [model]);
  const orderedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <div
        ref={panelRef}
        className={`${styles.panel} ${sidebar ? styles.sidebar : ""} ${interacting ? styles.interacting : ""}`}
        data-assistant-panel
        data-assistant-mode={sidebar ? "sidebar" : "float"}
        role="dialog"
        aria-label="AI 阅读助手"
        style={
          sidebar
            ? {
                left: window.innerWidth - sidebarWidth,
                top: 48,
                width: sidebarWidth,
                height: Math.max(320, window.innerHeight - 48),
              }
            : {
                left: rect.left,
                top: effectiveTop,
                width: rect.width,
                height: effectiveHeight,
              }
        }
      >
        <div className={styles.panelHeader} onPointerDown={sidebar ? undefined : startDrag}>
          <div ref={modelRef}>
            <button
              className={styles.modelButton}
              onClick={() => {
                setModelOpen((open) => !open);
                if (!modelOpen) void refreshModels();
              }}
              title={`${model} · ${modelLabel(model)}`}
              aria-label="切换模型"
              aria-expanded={modelOpen}
            >
              <ModelIcon model={model} size={19} />
            </button>
            {modelOpen ? (
              <div className={styles.modelPicker} role="menu">
                <div className={styles.modelPickerTitle}>模型{modelBusy ? " · 正在读取…" : ""}</div>
                {list.map((item) => (
                  <button
                    key={item}
                    className={`${styles.modelOption} ${item === model ? styles.active : ""}`}
                    role="menuitemradio"
                    aria-checked={item === model}
                    disabled={!allowed.has(item)}
                    title={allowed.has(item) ? item : "服务端未允许该模型，请设置 AI_MODEL_ALLOW"}
                    onClick={() => {
                      setModel(item);
                      setModelOpen(false);
                    }}
                  >
                    <ModelIcon model={item} size={18} colored />
                    <span className={styles.modelName}>{item}</span>
                    {isMultimodal(item) ? <span className={styles.modelTag}>多模态</span> : null}
                  </button>
                ))}
                {modelError ? <div className={styles.modelEmpty}>{modelError}</div> : null}
                <div className={styles.thinkDivider} />
                <div className={styles.modelPickerTitle}>思考强度</div>
                <div className={styles.thinkOptions} role="group" aria-label="思考强度">
                  {(
                    [
                      ["none", "关闭"],
                      ["low", "低"],
                      ["high", "高"],
                      ["max", "最高"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      className={`${styles.thinkOption} ${thinking === value ? styles.thinkActive : ""}`}
                      onClick={() => setThinking(value)}
                      aria-pressed={thinking === value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {!config?.hasKey ? (
                  <div className={styles.modelEmpty}>
                    服务端未配置密钥。把 server/.env.example 复制为 server/.env 并填入 AI_API_KEY。
                  </div>
                ) : null}
                <button className={styles.menuItem} onClick={() => void refreshModels()}>
                  <Icon name="history" size={14} />
                  刷新模型列表
                </button>
              </div>
            ) : null}
          </div>

          <div className={styles.sessionWrap} ref={sessionRef}>
            <div className={styles.sessionHeading}>
              <div className={styles.panelTitle} data-panel-drag>
                阅读助手
                <span className={`${styles.dot} ${streaming ? styles.dotBusy : ""}`} />
              </div>
              <button
                className={styles.sessionToggle}
                onClick={() => {
                  setSessionOpen((open) => !open);
                  setModelOpen(false);
                  setPendingDelete(null);
                }}
                aria-label="对话会话"
                aria-expanded={sessionOpen}
                title="切换对话会话"
              >
                <Icon name="chevronDown" size={14} />
              </button>
            </div>

            {sessionOpen ? (
              <div
                className={styles.sessionMenu}
                role="menu"
                aria-label="对话列表"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className={styles.sessionMenuHead}>
                  <span className={styles.sessionMenuTitle}>对话</span>
                  <button
                    className={styles.sessionNew}
                    onClick={() => {
                      newSession();
                      setSessionOpen(false);
                      setPendingDelete(null);
                    }}
                  >
                    <span aria-hidden="true">＋</span>
                    新对话
                  </button>
                </div>
                <div className={styles.sessionList}>
                  {orderedSessions.map((session) => (
                    <div key={session.id}>
                      <div
                        className={`${styles.sessionRow} ${session.id === activeSessionId ? styles.sessionRowActive : ""}`}
                        role="menuitem"
                        tabIndex={0}
                        onClick={() => {
                          switchSession(session.id);
                          setSessionOpen(false);
                          setPendingDelete(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            switchSession(session.id);
                            setSessionOpen(false);
                            setPendingDelete(null);
                          }
                        }}
                      >
                        <div className={styles.sessionInfo}>
                          <span className={styles.sessionName}>{session.title}</span>
                          <span className={styles.sessionMeta}>
                            {session.messages.length} 条 · {formatSessionTime(session.updatedAt)}
                          </span>
                        </div>
                        {session.id === activeSessionId ? <Icon name="check" size={14} /> : null}
                        {sessions.length > 1 ? (
                          <button
                            className={styles.sessionDelete}
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingDelete(session.id);
                            }}
                            aria-label={`删除对话 ${session.title}`}
                            title="删除对话"
                          >
                            <Icon name="clear" size={14} />
                          </button>
                        ) : null}
                      </div>
                      {pendingDelete === session.id ? (
                        <div
                          className={styles.sessionConfirm}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span>删除这个对话？</span>
                          <button
                            className={styles.sessionConfirmDelete}
                            onClick={() => {
                              deleteSession(session.id);
                              setPendingDelete(null);
                            }}
                          >
                            删除
                          </button>
                          <button
                            className={styles.sessionConfirmCancel}
                            onClick={() => setPendingDelete(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className={styles.sessionNote}>对话保存在本机 IndexedDB</div>
              </div>
            ) : null}
          </div>

          <span className={styles.headerSpacer} />

          {!narrow ? (
            <div className={styles.modeSwitch} role="group" aria-label="助手形态">
              <button
                className={`${styles.modeOption} ${!sidebar ? styles.modeActive : ""}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setMode("float")}
                aria-label="悬浮窗"
                aria-pressed={!sidebar}
                title="悬浮窗：覆盖在阅读区上，可拖动缩放"
              >
                <Icon name="float" size={14} />
              </button>
              <button
                className={`${styles.modeOption} ${sidebar ? styles.modeActive : ""}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setMode("sidebar")}
                aria-label="侧边栏"
                aria-pressed={sidebar}
                title="侧边栏：停靠右侧，阅读区自动让位"
              >
                <Icon name="sidebar" size={14} />
              </button>
            </div>
          ) : null}
          <span className={styles.headerSep} />

          <button
            className={`${styles.headerButton} ${styles.danger}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setClearConfirm(true)}
            aria-label="清空当前对话与上下文"
            title="清空当前对话与上下文"
          >
            <Icon name="clear" size={16} />
          </button>
          <span className={styles.headerSep} />
          <button
            className={styles.headerButton}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => animateOut("minimize")}
            aria-label="最小化"
            title="最小化（Esc）"
          >
            <Icon name="minimize" size={16} />
          </button>
          <button
            className={styles.headerButton}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => animateOut("close")}
            aria-label="关闭"
            title="关闭（Alt+J）"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className={styles.panelContent}>
          <MessageList />
          <ContextBar />
          <Composer />
        </div>

        {clearConfirm ? (
          <div className={styles.confirmBackdrop} role="presentation">
            <div className={styles.confirmCard} role="alertdialog" aria-label="确认清空">
              <div className={styles.confirmTitle}>清空当前对话与上下文？</div>
              <div className={styles.confirmText}>
                当前对话的消息、引用、页码、截图和附件都会移除；其他对话、PDF、页码和阅读位置保留。
              </div>
              <div className={styles.confirmRow}>
                <button className={styles.confirmCancel} onClick={() => setClearConfirm(false)}>
                  取消
                </button>
                <button className={styles.confirmClear} onClick={() => clearAll()}>
                  清空
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {sidebar ? (
          <div
            className={styles.sidebarResizer}
            onPointerDown={startSidebarResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="调整侧边栏宽度"
            title="拖动调整宽度"
          />
        ) : (
          <>
            <div
              className={`${styles.resize} ${styles.resizeN}`}
              onPointerDown={(event) => startResize(event, "n")}
            />
            <div
              className={`${styles.resize} ${styles.resizeS}`}
              onPointerDown={(event) => startResize(event, "s")}
            />
            <div
              className={`${styles.resize} ${styles.resizeE}`}
              onPointerDown={(event) => startResize(event, "e")}
            />
            <div
              className={`${styles.resize} ${styles.resizeW}`}
              onPointerDown={(event) => startResize(event, "w")}
            />
            <div
              className={`${styles.resize} ${styles.resizeNE}`}
              onPointerDown={(event) => startResize(event, "ne")}
            />
            <div
              className={`${styles.resize} ${styles.resizeNW}`}
              onPointerDown={(event) => startResize(event, "nw")}
            />
            <div
              className={`${styles.resize} ${styles.resizeSE}`}
              onPointerDown={(event) => startResize(event, "se")}
            />
            <div
              className={`${styles.resize} ${styles.resizeSW}`}
              onPointerDown={(event) => startResize(event, "sw")}
            />
            <span className={styles.gripper} aria-hidden="true" />
          </>
        )}
      </div>

      {ghost ? (
        <div className={styles.ghostFab} aria-hidden="true">
          <SparkleIcon size={23} />
        </div>
      ) : null}
    </>
  );
}
