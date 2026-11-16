import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/icons/Icon";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  SHORTCUT_ACTIONS,
  bindingFromKeyboardEvent,
  bindingParts,
  findShortcutConflict,
  formatBinding,
  isModifierKey,
  sameBindingList,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutId,
} from "../../lib/shortcuts";
import styles from "../../components/Modal.module.css";
import { useShortcutsStore } from "./useShortcutsStore";

type Props = { open: boolean; onClose: () => void };

export function ShortcutsDialog({ open, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const bindings = useShortcutsStore((state) => state.bindings);
  const setBinding = useShortcutsStore((state) => state.setBinding);
  const resetBinding = useShortcutsStore((state) => state.resetBinding);
  const resetAll = useShortcutsStore((state) => state.resetAll);
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
  const [error, setError] = useState("");

  useFocusTrap(cardRef, open);

  useEffect(() => {
    if (open) return;
    setRecordingId(null);
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (recordingId) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, recordingId]);

  useEffect(() => {
    if (!open || !recordingId) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setRecordingId(null);
        setError("");
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        setBinding(recordingId, []);
        setRecordingId(null);
        setError("");
        return;
      }
      if (isModifierKey(event.key)) return;
      const binding = bindingFromKeyboardEvent(event);
      if (!binding) {
        setError("这个按键不能单独使用，请加上 Ctrl、Alt 或 Shift。");
        return;
      }
      const conflict = findShortcutConflict(bindings, recordingId, binding);
      if (conflict) {
        setError(`已被“${conflict.label}”使用，请换一个组合。`);
        return;
      }
      setBinding(recordingId, [binding]);
      setRecordingId(null);
      setError("");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, recordingId, bindings, setBinding]);

  if (!open) return null;

  const groups = [...new Set(SHORTCUT_ACTIONS.map((action) => action.group))];

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
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className={styles.body} style={{ gap: 0 }}>
          {groups.map((group) => (
            <div className={styles.hotkeyGroup} key={group}>
              <div className={styles.hotkeyTitle}>{group}</div>
              {SHORTCUT_ACTIONS.filter((action) => action.group === group).map((action) => (
                <ShortcutRow
                  key={action.id}
                  action={action}
                  bindings={bindings[action.id] ?? action.defaults}
                  recording={recordingId === action.id}
                  onRecord={() => {
                    setRecordingId(action.id);
                    setError("");
                  }}
                  onReset={() => {
                    resetBinding(action.id);
                    setError("");
                  }}
                />
              ))}
              {group === "阅读" ? (
                <div className={styles.hotkeyRow}>
                  <span>按住 Ctrl 滚动滚轮</span>
                  <span className={styles.keys}>
                    <kbd>Ctrl</kbd>
                    <kbd>滚轮</kbd>
                  </span>
                </div>
              ) : null}
            </div>
          ))}
          {error ? (
            <div className={styles.hotkeyError} role="alert">
              {error}
            </div>
          ) : null}
          <div className={styles.hotkeyFoot}>
            <span>点击快捷键后按下新组合；Esc 取消，Backspace 清除。</span>
            <button className={styles.hotkeyResetAll} onClick={resetAll}>
              全部恢复默认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({
  action,
  bindings,
  recording,
  onRecord,
  onReset,
}: {
  action: ShortcutAction;
  bindings: ShortcutBinding[];
  recording: boolean;
  onRecord: () => void;
  onReset: () => void;
}) {
  const custom = !sameBindingList(bindings, action.defaults);
  return (
    <div className={styles.hotkeyRow}>
      <span>{action.label}</span>
      <span className={styles.hotkeyControls}>
        <button
          className={`${styles.hotkeyKeys} ${recording ? styles.hotkeyRecording : ""}`}
          onClick={onRecord}
          aria-label={`修改快捷键：${action.label}`}
          title="点击后按下新的组合键"
        >
          {recording ? (
            <span className={styles.hotkeyPrompt}>按下新组合…</span>
          ) : bindings.length ? (
            bindings
              .filter(
                (binding, index, list) =>
                  list.findIndex((item) => formatBinding(item) === formatBinding(binding)) ===
                  index,
              )
              .map((binding, index) => (
                <span className={styles.hotkeyChord} key={`${binding.key}_${index}`}>
                  {bindingParts(binding).map((part) => (
                    <kbd key={part}>{part}</kbd>
                  ))}
                </span>
              ))
          ) : (
            <span className={styles.hotkeyPrompt}>未设置</span>
          )}
        </button>
        {custom ? (
          <button
            className={styles.hotkeyReset}
            onClick={onReset}
            title="恢复默认"
            aria-label={`恢复默认：${action.label}`}
          >
            <Icon name="retry" size={12} />
          </button>
        ) : null}
      </span>
    </div>
  );
}
