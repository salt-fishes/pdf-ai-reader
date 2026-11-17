import { useEffect, useState } from "react";
import { Icon } from "../../../components/icons/Icon";
import { clearAllLocalData } from "../../../lib/storage/db";
import { useAssistant } from "../../assistant/useAssistantStore";
import { useViewer } from "../../viewer/useViewerStore";
import styles from "../../../components/Modal.module.css";

type Props = { onOpenPrivacyDoc: () => void };

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "0 MB";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

export function PrivacySection({ onOpenPrivacyDoc }: Props) {
  const config = useAssistant((state) => state.config);
  const clearAll = useAssistant((state) => state.clearAll);
  const docName = useViewer((state) => state.docName);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState("");
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  const refreshUsage = async () => {
    try {
      if (!navigator.storage?.estimate) return;
      const estimate = await navigator.storage.estimate();
      if (typeof estimate.usage === "number" && typeof estimate.quota === "number") {
        setUsage({ usage: estimate.usage, quota: estimate.quota });
      }
    } catch {
      // Browsers can deny the estimate; omit the row instead of guessing.
    }
  };

  useEffect(() => {
    void refreshUsage();
  }, []);

  const clearReadingData = async () => {
    setClearing(true);
    setMessage("");
    try {
      await clearAllLocalData();
      setConfirmClear(false);
      setMessage("阅读数据已清空。PDF 文件、模型密钥与 OCR 组件仍然保留。");
      void refreshUsage();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清空失败，请重试。");
    } finally {
      setClearing(false);
    }
  };

  let providerHost = "—";
  try {
    providerHost = config?.baseUrl ? new URL(config.baseUrl).host : config?.baseUrlHost || "—";
  } catch {
    providerHost = config?.baseUrl || "—";
  }

  return (
    <div className={styles.page} data-settings-section="privacy">
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>隐私与数据</h2>
          <p className={styles.pageDesc}>你的文档留在本机。只有你明确选择的内容会发给模型。</p>
        </div>
        <span className={`${styles.statusPill} ${styles.pillOk}`}>
          <i className={styles.pillDot} aria-hidden="true" />
          本地处理
        </span>
      </header>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="lock" size={16} />
          数据边界
        </div>
        <div className={styles.privacyGrid}>
          <div className={styles.privacyCard}>
            <strong>不会离开本机</strong>
            <p>PDF 解析、搜索、高亮与扫描件识别都在本机完成，不会发送整份 PDF。</p>
          </div>
          <div className={styles.privacyCard}>
            <strong>会发送给模型</strong>
            <p>你选中的页码文本、选中文字、截图、附件与引用，以及你输入的问题。</p>
          </div>
          <div className={styles.privacyCard}>
            <strong>保存在本机</strong>
            <p>
              阅读位置、对话、高亮、OCR 文本与最近文档
              {usage ? `（约 ${formatBytes(usage.usage)}）` : ""}。
            </p>
          </div>
        </div>
        <div className={styles.privacyFoot}>
          <Icon name="info" size={14} />
          本地记录未加密；共用电脑时建议清空阅读数据。
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="clear" size={16} />
          数据管理
        </div>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.label}>当前文档</span>
            <span className={styles.value}>{docName || "尚未打开文档"}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.button} ${styles.danger}`}
            onClick={() => {
              clearAll();
              setMessage("本篇对话与上下文已清空。");
            }}
          >
            清空本篇对话与上下文
          </button>
          <button
            className={`${styles.button} ${styles.danger}`}
            onClick={() => {
              if (!confirmClear) {
                setConfirmClear(true);
                setMessage("");
                return;
              }
              void clearReadingData();
            }}
            disabled={clearing}
          >
            {confirmClear ? "再次点击确认清空阅读数据" : "清空阅读数据"}
          </button>
        </div>
        {confirmClear ? (
          <div className={styles.confirmBox}>
            <span>
              这会删除阅读位置、对话、高亮、OCR 文本与界面偏好，但不会删除 PDF 文件、模型密钥或 OCR
              组件；操作不可撤销。
            </span>
            <button className={styles.linkButton} onClick={() => setConfirmClear(false)}>
              取消
            </button>
          </div>
        ) : null}
        {message ? (
          <div className={`${styles.inlineNotice} ${styles.noticeOk}`}>{message}</div>
        ) : null}
      </div>

      <details className={`${styles.group} ${styles.groupDetails}`}>
        <summary className={styles.groupSummary}>
          <span>网络连接</span>
          <span className={styles.groupHint}>只在需要时访问</span>
        </summary>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.label}>模型服务</span>
            <span className={styles.value}>{providerHost}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>OCR 下载</span>
            <span className={styles.value}>仅在下载或修复组件时连接</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>检查更新</span>
            <span className={styles.value}>仅在你点击时访问 GitHub Releases</span>
          </div>
        </div>
        <div className={styles.privacyFoot}>
          <Icon name="info" size={14} />
          没有遥测，也没有后台统计上报。
        </div>
      </details>

      <div className={styles.actions}>
        <button className={styles.linkButton} onClick={onOpenPrivacyDoc}>
          查看完整隐私说明 →
        </button>
      </div>
    </div>
  );
}
