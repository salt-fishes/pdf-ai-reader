import { Icon } from "../../../components/icons/Icon";
import { useAssistant } from "../../assistant/useAssistantStore";
import styles from "../../../components/Modal.module.css";

const THINKING = [
  ["none", "关闭"],
  ["low", "低"],
  ["high", "高"],
  ["max", "最高"],
] as const;

const BUDGETS = [32, 128, 256, 512, 1000] as const;
const HISTORY = [
  [10, "10 条"],
  [20, "20 条"],
  [40, "40 条"],
  [80, "80 条"],
  [0, "不限"],
] as const;

export function ConversationSection() {
  const thinking = useAssistant((state) => state.thinking);
  const setThinking = useAssistant((state) => state.setThinking);
  const contextBudget = useAssistant((state) => state.budget);
  const setContextBudget = useAssistant((state) => state.setContextBudget);
  const historyLimit = useAssistant((state) => state.historyLimit);
  const setHistoryLimit = useAssistant((state) => state.setHistoryLimit);

  return (
    <div className={styles.page} data-settings-section="conversation">
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>对话</h2>
          <p className={styles.pageDesc}>控制回答速度、成本与上下文长度。</p>
        </div>
      </header>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="send" size={16} />
          回复方式
        </div>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.label}>思考强度</span>
            <span className={styles.segmented} role="group" aria-label="思考强度">
              {THINKING.map(([value, label]) => (
                <button
                  key={value}
                  className={`${styles.segment} ${thinking === value ? styles.segmentActive : ""}`}
                  onClick={() => setThinking(value)}
                  aria-pressed={thinking === value}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>上下文预算</span>
            <span className={styles.segmented} role="group" aria-label="上下文预算">
              {BUDGETS.map((value) => (
                <button
                  key={value}
                  className={`${styles.segment} ${contextBudget === value * 1000 ? styles.segmentActive : ""}`}
                  onClick={() => setContextBudget(value * 1000)}
                  aria-pressed={contextBudget === value * 1000}
                >
                  {value === 1000 ? "1M" : `${value}k`}
                </button>
              ))}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>对话历史窗口</span>
            <span className={styles.segmented} role="group" aria-label="对话历史窗口">
              {HISTORY.map(([value, label]) => (
                <button
                  key={value}
                  className={`${styles.segment} ${historyLimit === value ? styles.segmentActive : ""}`}
                  onClick={() => setHistoryLimit(Number(value))}
                  aria-pressed={historyLimit === value}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
