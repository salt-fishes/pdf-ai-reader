import { useEffect, useRef } from "react";
import { WinIcon } from "../../components/icons/WinIcon";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "../../components/Modal.module.css";

type Props = { open: boolean; onClose: () => void };

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const GROUPS: Array<{ title: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    title: "助手",
    items: [
      { keys: [MOD, "J"], label: "打开 / 最小化面板" },
      { keys: ["Alt", "J"], label: "关闭（面板与呼吸灯一起隐藏）" },
      { keys: [MOD, "K"], label: "打开并聚焦提问框" },
      { keys: ["?"], label: "快捷键面板" },
    ],
  },
  {
    title: "全局",
    items: [
      { keys: ["Esc"], label: "按层级关闭浮层 / 最小化" },
      { keys: [MOD, "O"], label: "打开 PDF" },
    ],
  },
  {
    title: "阅读",
    items: [
      { keys: [MOD, "F"], label: "全文搜索" },
      { keys: ["PageUp"], label: "上一页" },
      { keys: ["PageDown"], label: "下一页" },
      { keys: ["+", "−"], label: "放大 / 缩小" },
      { keys: ["0"], label: "重置为 100%" },
      { keys: ["Shift", "D"], label: "循环色彩模式" },
      { keys: [MOD, "Alt", "S"], label: "截图当前页" },
      { keys: [MOD, "Alt", "R"], label: "框选截图" },
    ],
  },
  {
    title: "对话",
    items: [
      { keys: ["Enter"], label: "发送" },
      { keys: ["Shift", "Enter"], label: "换行" },
      { keys: [MOD, "Enter"], label: "发送（多行时）" },
      { keys: [MOD, "Alt", "Q"], label: "引用选中文字" },
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef, open);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="快捷键"
      >
        <div className={styles.head}>
          <span className={styles.title}>快捷键</span>
          <span className={styles.headSpacer} />
          <button className={styles.close} onClick={onClose} aria-label="关闭快捷键面板">
            <WinIcon glyph="close" size={15} />
          </button>
        </div>
        <div className={styles.body} style={{ gap: 0 }}>
          {GROUPS.map((group) => (
            <div className={styles.hotkeyGroup} key={group.title}>
              <div className={styles.hotkeyTitle}>{group.title}</div>
              {group.items.map((item) => (
                <div className={styles.hotkeyRow} key={item.label}>
                  <span>{item.label}</span>
                  <span className={styles.keys}>
                    {item.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
