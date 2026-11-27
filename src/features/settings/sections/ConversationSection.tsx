import { Icon } from "../../../components/icons/Icon";
import { useAssistant } from "../../assistant/useAssistantStore";
import { useTabs, type PdfTab } from "../../tabs/useTabStore";
import styles from "../SettingsUI.module.css";

const THINKING = [
  ["none", "关闭"],
  ["low", "低"],
  ["high", "高"],
  ["max", "最高"],
] as const;

const BUDGETS = [32, 128, 256, 512, 1000] as const;

const AI_MODES: Array<{ value: PdfTab["aiMode"]; label: string; hint: string }> = [
  { value: "inherit", label: "跟随文档", hint: "同一 PDF 的标签共用原有会话。" },
  { value: "isolated", label: "标签独立", hint: "仅当前标签使用独立会话，适合对照阅读。" },
  { value: "shared", label: "跨文档共享", hint: "共享标签共用会话，引用会跳回来源 PDF。" },
];

export function ConversationSection() {
  const thinking = useAssistant((state) => state.thinking);
  const setThinking = useAssistant((state) => state.setThinking);
  const contextBudget = useAssistant((state) => state.budget);
  const setContextBudget = useAssistant((state) => state.setContextBudget);
  const documentOnly = useAssistant((state) => state.documentOnly);
  const setDocumentOnly = useAssistant((state) => state.setDocumentOnly);
  const autoSelection = useAssistant((state) => state.autoSelection);
  const setAutoSelection = useAssistant((state) => state.setAutoSelection);
  const tabs = useTabs((state) => state.tabs);
  const activeTabId = useTabs((state) => state.activeTabId);
  const setTabAiMode = useTabs((state) => state.setTabAiMode);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeAiMode = activeTab?.aiMode ?? "inherit";
  const activeAiHint = AI_MODES.find((mode) => mode.value === activeAiMode)?.hint ?? "";

  return (
    <div className={styles.page} data-settings-section="conversation">
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>对话</h2>
          <p className={styles.pageDesc}>控制回答方式、默认上下文与标签会话。</p>
        </div>
      </header>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="sidebar" size={16} />
          当前 PDF 标签
        </div>
        <div className={styles.row}>
          <span className={styles.label}>AI 会话空间</span>
          <span className={styles.value}>{activeTab?.name ?? "未打开 PDF"}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>隔离方式</span>
          <span className={styles.segmented} role="group" aria-label="当前标签 AI 模式">
            {AI_MODES.map((mode) => (
              <button
                key={mode.value}
                className={`${styles.segment} ${activeAiMode === mode.value ? styles.segmentActive : ""}`}
                onClick={() => activeTab && setTabAiMode(activeTab.id, mode.value)}
                aria-pressed={activeAiMode === mode.value}
                disabled={!activeTab}
              >
                {mode.label}
              </button>
            ))}
          </span>
        </div>
        <p className={styles.fieldHint}>
          {activeTab ? activeAiHint : "打开 PDF 后可为每个标签选择会话空间。"}
          {activeTab ? "切换会停止当前生成，并载入对应会话。" : ""}
        </p>
      </div>

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
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="highlight" size={16} />
          默认上下文
        </div>
        <div className={styles.row}>
          <span className={styles.label}>自动包含选中文字</span>
          <button
            className={`${styles.switch} ${autoSelection ? styles.switchOn : ""}`}
            role="switch"
            aria-checked={autoSelection}
            aria-label="自动包含选中文字"
            onClick={() => setAutoSelection(!autoSelection)}
          >
            <i />
          </button>
        </div>
        <p className={styles.fieldHint}>当前页始终默认跟随；选中文字后自动加入，无需再点引用。</p>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="lock" size={16} />
          回答范围
        </div>
        <div className={styles.row}>
          <span className={styles.label}>仅依据当前文档</span>
          <button
            className={`${styles.switch} ${documentOnly ? styles.switchOn : ""}`}
            role="switch"
            aria-checked={documentOnly}
            aria-label="仅依据当前文档"
            onClick={() => setDocumentOnly(!documentOnly)}
          >
            <i />
          </button>
        </div>
        <p className={styles.fieldHint}>
          关闭通用知识与外部工具，只使用当前 PDF 的上下文；共享会话不会带入其他 PDF 的历史。
        </p>
      </div>
    </div>
  );
}
