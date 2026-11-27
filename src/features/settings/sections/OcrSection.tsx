import { useEffect, useState } from "react";
import { Icon } from "../../../components/icons/Icon";
import {
  fetchOcrSource,
  resetOcrSource,
  saveOcrSource,
  testOcrSource,
  type OcrModelId,
  type OcrModelInfo,
  type OcrSourceInfo,
} from "../../../lib/ocr/client";
import { useOcr } from "../../ocr/useOcrStore";
import styles from "../SettingsUI.module.css";

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SPEED_LABEL: Record<OcrModelInfo["speed"], string> = {
  fast: "最快",
  balanced: "均衡",
  accurate: "最准",
};

export function OcrSection() {
  const status = useOcr((state) => state.status);
  const runtime = status?.runtime;
  // Older mocks and pre-runtime status payloads omit this field; treat those
  // as already installed so only the model download path is exercised.
  const runtimeReady = runtime?.installed ?? true;
  const runtimeDownloading = runtime?.downloading ?? false;
  const runtimeBusy =
    runtimeDownloading || (status?.phase === "runtime" && Boolean(status.downloading));
  const runtimeSize = runtime?.total || runtime?.approxBytes || 27_000_000;
  const error = useOcr((state) => state.error);
  const installing = useOcr((state) => state.installing);
  const enabled = useOcr((state) => state.enabled);
  const autoEnabled = useOcr((state) => state.autoEnabled);
  const setEnabled = useOcr((state) => state.setEnabled);
  const setAutoEnabled = useOcr((state) => state.setAutoEnabled);
  const refreshStatus = useOcr((state) => state.refreshStatus);
  const install = useOcr((state) => state.install);
  const repair = useOcr((state) => state.repair);
  const setModel = useOcr((state) => state.setModel);
  const [pendingModel, setPendingModel] = useState<OcrModelInfo | null>(null);
  const [sourceInfo, setSourceInfo] = useState<OcrSourceInfo | null>(null);
  const [sourceMode, setSourceMode] = useState<"default" | "custom">("default");
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceVerified, setSourceVerified] = useState(false);
  const [sourceMessage, setSourceMessage] = useState("");
  const [sourceError, setSourceError] = useState(false);

  useEffect(() => {
    void refreshStatus();
    void fetchOcrSource()
      .then((info) => {
        setSourceInfo(info);
        setSourceDraft(info.customBaseUrl ?? "");
        setSourceMode(info.customBaseUrl ? "custom" : "default");
      })
      .catch(() => undefined);
  }, [refreshStatus]);

  const chooseModel = async (id: OcrModelId) => {
    const info = status?.availableModels?.find((item) => item.id === id);
    if (info && !info.installed) {
      setPendingModel(info);
      return;
    }
    setPendingModel(null);
    try {
      await setModel(id);
      await refreshStatus();
    } catch {
      // The store exposes the error in the section below.
    }
  };

  const confirmModel = async () => {
    if (!pendingModel) return;
    const id = pendingModel.id;
    setPendingModel(null);
    try {
      await install(id);
      await setModel(id);
      await refreshStatus();
    } catch {
      // Keep the previous active model; the store shows the download error.
    }
  };

  const testSource = async () => {
    if (!sourceDraft.trim()) {
      setSourceError(true);
      setSourceMessage("请输入镜像根地址");
      return;
    }
    setSourceBusy(true);
    setSourceMessage("");
    setSourceError(false);
    setSourceVerified(false);
    try {
      const result = await testOcrSource(sourceDraft, status?.activeModel);
      setSourceVerified(result.ok);
      setSourceError(!result.ok);
      setSourceMessage(
        result.ok
          ? `3 个文件均可访问（${result.baseUrl}）`
          : result.files
              .filter((file) => !file.ok)
              .map((file) => `${file.name}: ${file.error ?? "不可用"}`)
              .join(" · "),
      );
    } catch (error) {
      setSourceError(true);
      setSourceMessage(error instanceof Error ? error.message : "测试失败");
    } finally {
      setSourceBusy(false);
    }
  };

  const saveSource = async () => {
    if (!sourceVerified) {
      setSourceError(true);
      setSourceMessage("请先测试连接，全部通过后再保存。");
      return;
    }
    setSourceBusy(true);
    try {
      const info = await saveOcrSource(sourceDraft);
      setSourceInfo(info);
      setSourceMode("custom");
      setSourceError(false);
      setSourceMessage("镜像已保存，下一次下载会立即使用。");
      setSourceVerified(false);
    } catch (error) {
      setSourceError(true);
      setSourceMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSourceBusy(false);
    }
  };

  const restoreDefaultSource = async () => {
    setSourceBusy(true);
    try {
      const info = await resetOcrSource();
      setSourceInfo(info);
      setSourceMode("default");
      setSourceDraft("");
      setSourceVerified(false);
      setSourceMessage("已恢复官方下载源。");
      setSourceError(false);
    } catch (error) {
      setSourceError(true);
      setSourceMessage(error instanceof Error ? error.message : "恢复默认失败");
    } finally {
      setSourceBusy(false);
    }
  };

  const active = status?.availableModels?.find((item) => item.id === status.activeModel);
  const statusTone = !runtimeReady
    ? "error"
    : status?.downloading || runtimeDownloading
      ? "warn"
      : status?.installed
        ? "ok"
        : "warn";
  const statusLabel = runtimeBusy
    ? `下载组件 ${Math.round((runtime?.progress ?? 0) * 100)}%`
    : !runtimeReady
      ? "组件未安装"
      : status?.downloading
        ? `下载中 ${Math.round((status.progress ?? 0) * 100)}%`
        : status?.installed
          ? "已就绪"
          : status
            ? "模型未下载"
            : "正在检查…";

  return (
    <div className={styles.page} data-settings-section="ocr">
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>扫描件 OCR</h2>
          <p className={styles.pageDesc}>首次使用需下载识别组件，之后可离线使用。</p>
        </div>
        <span
          className={`${styles.statusPill} ${
            statusTone === "ok"
              ? styles.pillOk
              : statusTone === "warn"
                ? styles.pillWarn
                : styles.pillError
          }`}
        >
          <i className={styles.pillDot} aria-hidden="true" />
          {statusLabel}
        </span>
      </header>

      {runtimeBusy || (status?.downloading && status.phase === "runtime") ? (
        <div className={styles.group}>
          <div className={styles.progressHead}>
            <span>正在下载识别组件</span>
            <span>{Math.round((runtime?.progress ?? 0) * 100)}%</span>
          </div>
          <div className={styles.progressTrack}>
            <i
              className={styles.progressFill}
              style={{ width: `${Math.round((runtime?.progress ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="search" size={16} />
          识别设置
        </div>
        <div className={styles.row}>
          <span className={styles.label}>当前模型</span>
          <span className={styles.value}>
            {active
              ? `${active.label} · ${active.installed ? "已安装" : "未下载"}`
              : (status?.model ?? "正在检查…")}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>自动识别没有文字层的页面</span>
          <button
            className={`${styles.switch} ${autoEnabled ? styles.switchOn : ""}`}
            role="switch"
            aria-checked={autoEnabled}
            aria-label="自动识别没有文字层的页面"
            onClick={() => setAutoEnabled(!autoEnabled)}
          >
            <i />
          </button>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>显示 OCR 可选择文字层</span>
          <button
            className={`${styles.switch} ${enabled ? styles.switchOn : ""}`}
            role="switch"
            aria-checked={enabled}
            aria-label="显示 OCR 可选择文字层"
            onClick={() => setEnabled(!enabled)}
          >
            <i />
          </button>
        </div>

        <div className={styles.modelGrid}>
          {(status?.availableModels ?? []).map((item) => {
            const short = item.label.replace("PP-OCRv6 ", "");
            return (
              <button
                key={item.id}
                className={`${styles.modelCard} ${
                  status?.activeModel === item.id ? styles.modelCardActive : ""
                }`}
                onClick={() => void chooseModel(item.id)}
                disabled={installing || runtimeBusy || !runtimeReady || item.downloading}
                aria-pressed={status?.activeModel === item.id}
                aria-label={`${short} 模型，${SPEED_LABEL[item.speed]}，约 ${mb(item.approxBytes)}，${
                  item.installed ? "已安装" : "尚未下载"
                }`}
              >
                <span className={styles.modelName}>{short}</span>
                <span className={styles.modelMeta}>
                  {SPEED_LABEL[item.speed]} · {mb(item.approxBytes)}
                </span>
                <span className={styles.modelState}>
                  {item.downloading
                    ? `下载中 ${Math.round(item.progress * 100)}%`
                    : item.installed
                      ? "已安装"
                      : "尚未下载"}
                </span>
              </button>
            );
          })}
        </div>

        {pendingModel ? (
          <div className={styles.confirmBox}>
            <span>
              {pendingModel.label} 尚未下载，约 {mb(pendingModel.approxBytes)}。是否现在下载并切换？
            </span>
            <button className={styles.linkButton} onClick={() => void confirmModel()}>
              下载并切换
            </button>
            <button className={styles.linkButton} onClick={() => setPendingModel(null)}>
              取消
            </button>
          </div>
        ) : null}

        <div className={styles.actions}>
          {!runtimeReady ? (
            <button
              className={`${styles.button} ${styles.primary}`}
              onClick={() => {
                void install(status?.activeModel).catch(() => undefined);
              }}
              disabled={runtimeBusy || installing || runtime?.downloadable === false}
            >
              {runtimeBusy || installing
                ? `正在下载组件 ${Math.round((runtime?.progress ?? 0) * 100)}%`
                : `下载 OCR 组件（${mb(runtimeSize)}）`}
            </button>
          ) : !status?.installed ? (
            <button
              className={`${styles.button} ${styles.primary}`}
              onClick={() => {
                void install(status?.activeModel).catch(() => undefined);
              }}
              disabled={Boolean(status?.downloading) || installing}
            >
              {status?.downloading || installing ? "正在下载…" : "下载当前模型"}
            </button>
          ) : (
            <button className={styles.button} onClick={() => void refreshStatus()}>
              重新检查
            </button>
          )}
        </div>

        {runtime?.downloadable === false && !runtimeReady ? (
          <div className={`${styles.inlineNotice} ${styles.noticeError}`}>
            此构建没有配置 OCR 组件下载源，请重新安装完整发布包。
          </div>
        ) : null}
        {error ? (
          <div className={`${styles.inlineNotice} ${styles.noticeError}`}>
            <Icon name="error" size={15} />
            {error}
          </div>
        ) : null}
      </div>

      <details className={`${styles.group} ${styles.groupDetails}`}>
        <summary className={styles.groupSummary}>
          <span>高级</span>
          <span className={styles.groupHint}>下载源与组件修复</span>
        </summary>
        <div className={styles.row}>
          <span className={styles.label}>下载源</span>
          <span className={styles.segmented}>
            <button
              className={`${styles.segment} ${sourceMode === "default" ? styles.segmentActive : ""}`}
              onClick={() => setSourceMode("default")}
            >
              默认（官方）
            </button>
            <button
              className={`${styles.segment} ${sourceMode === "custom" ? styles.segmentActive : ""}`}
              onClick={() => setSourceMode("custom")}
            >
              自定义镜像
            </button>
          </span>
        </div>
        {sourceMode === "custom" ? (
          <div className={styles.field} style={{ marginTop: 10 }}>
            <span className={styles.fieldLabel}>镜像根地址（保持官方目录结构）</span>
            <input
              className={styles.input}
              value={sourceDraft}
              onChange={(event) => {
                setSourceDraft(event.target.value);
                setSourceVerified(false);
              }}
              placeholder="https://mirror.example.com/ppocrv6"
              spellCheck={false}
            />
            <div className={styles.actions}>
              <button
                className={styles.button}
                onClick={() => void testSource()}
                disabled={sourceBusy}
              >
                {sourceBusy ? "处理中…" : "测试连接"}
              </button>
              <button
                className={`${styles.button} ${styles.primary}`}
                onClick={() => void saveSource()}
                disabled={sourceBusy || !sourceVerified}
              >
                保存
              </button>
              <button
                className={styles.button}
                onClick={() => void restoreDefaultSource()}
                disabled={sourceBusy}
              >
                恢复默认
              </button>
            </div>
            {sourceInfo?.customBaseUrl ? (
              <details className={styles.thirdParty}>
                <summary>已保存镜像的文件 URL</summary>
                <ul>
                  {(
                    sourceInfo.models.find((item) => item.id === (status?.activeModel ?? "v6-tiny"))
                      ?.files ?? []
                  ).map((file) => (
                    <li key={file.name}>
                      <code>{file.url}</code>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : (
          <div className={styles.fieldHint}>使用官方下载源。</div>
        )}
        {sourceMessage ? (
          <div
            className={`${styles.inlineNotice} ${
              sourceError ? styles.noticeError : styles.noticeOk
            }`}
          >
            {sourceMessage}
          </div>
        ) : null}
        <div className={styles.actions}>
          <button
            className={styles.button}
            onClick={() => void repair().catch(() => undefined)}
            disabled={runtimeBusy || installing}
          >
            修复组件
          </button>
          <span className={styles.fieldHint}>
            仅在组件损坏或加载失败时使用；会重新下载，不会删除模型。
          </span>
        </div>
      </details>
    </div>
  );
}
