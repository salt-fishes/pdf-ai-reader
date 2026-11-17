import { Icon } from "../../../components/icons/Icon";
import { formatBindings, SHORTCUT_ACTIONS } from "../../../lib/shortcuts";
import { ColorModeControl } from "../../viewer/ColorModeControl";
import { useAssistant } from "../../assistant/useAssistantStore";
import { useShortcutsStore } from "../../shortcuts/useShortcutsStore";
import styles from "../../../components/Modal.module.css";

type Props = { onOpenShortcuts: () => void };

export function ReadingSection({ onOpenShortcuts }: Props) {
  const mode = useAssistant((state) => state.mode);
  const setMode = useAssistant((state) => state.setMode);
  const bindings = useShortcutsStore((state) => state.bindings);
  const toggleAction = SHORTCUT_ACTIONS.find((action) => action.id === "assistant.toggle");
  const toggleKeys = formatBindings(bindings["assistant.toggle"] ?? toggleAction?.defaults ?? []);

  return (
    <div className={styles.page} data-settings-section="reading">
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>阅读</h2>
          <p className={styles.pageDesc}>调整助手的位置、页面色彩与操作方式。</p>
        </div>
      </header>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="sidebar" size={16} />
          助手形态
        </div>
        <div className={styles.choiceGrid} role="group" aria-label="助手形态">
          <button
            className={`${styles.choiceCard} ${mode === "float" ? styles.choiceCardActive : ""}`}
            onClick={() => setMode("float")}
            aria-pressed={mode === "float"}
          >
            <span className={styles.choicePreview}>
              <span className={styles.choicePage} />
              <span className={styles.choiceFloat} />
            </span>
            <span className={styles.choiceLabel}>悬浮窗</span>
            <span className={styles.choiceDesc}>覆盖在页面上，可拖动与缩放</span>
          </button>
          <button
            className={`${styles.choiceCard} ${mode === "sidebar" ? styles.choiceCardActive : ""}`}
            onClick={() => setMode("sidebar")}
            aria-pressed={mode === "sidebar"}
          >
            <span className={styles.choicePreview}>
              <span className={styles.choicePage} />
              <span className={styles.choiceSidebar} />
            </span>
            <span className={styles.choiceLabel}>侧边栏</span>
            <span className={styles.choiceDesc}>停靠右侧，阅读区自动让位</span>
          </button>
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="theme" size={16} />
          阅读外观
        </div>
        <ColorModeControl compact />
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="help" size={16} />
          快捷键
        </div>
        <div className={styles.row}>
          <span className={styles.label}>打开或收起助手</span>
          <span className={styles.value}>
            <kbd>{toggleKeys || "未设置"}</kbd>
          </span>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={onOpenShortcuts}>
            自定义快捷键
          </button>
        </div>
      </div>
    </div>
  );
}
