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
import styles from "../../../components/Modal.module.css";

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function OcrSection() {
  const status = useOcr((state) => state.status);
  const error = useOcr((state) => state.error);
  const installing = useOcr((state) => state.installing);
  const enabled = useOcr((state) => state.enabled);
  const setEnabled = useOcr((state) => state.setEnabled);
  const refreshStatus = useOcr((state) => state.refreshStatus);
  const install = useOcr((state) => state.install);
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

  return (
    <section className={styles.section} data-settings-section="ocr">
      <div className={styles.sectionTitle}>
        <Icon name="search" size={16} />
        扫描件 OCR
      </div>
      <div className={styles.rows}>
        <div className={styles.row}>
          <span className={styles.label}>模型</span>
          <span className={styles.value}>{status?.model ?? "正在检查…"}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>状态</span>
          <span
            className={`${styles.value} ${
              status?.installed ? styles.ok : status?.downloading ? styles.warn : ""
            }`}
          >
            {status?.downloading
              ? `下载中 ${Math.round((status.progress ?? 0) * 100)}%`
              : status?.installed
                ? "已安装"
                : status
                  ? "未下载"
                  : "正在检查…"}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>OCR 文本层</span>
          <span className={styles.value}>
            <button
              className={`${styles.segment} ${enabled ? styles.segmentActive : ""}`}
              onClick={() => setEnabled(!enabled)}
            >
              {enabled ? "已开启" : "已关闭"}
            </button>
          </span>
        </div>
      </div>
      <div className={styles.note}>
        当前：
        {(() => {
          const active = status?.availableModels?.find((item) => item.id === status.activeModel);
          return active
            ? `${active.label} · ${active.installed ? "已安装" : "未下载"}`
            : (status?.model ?? "正在检查…");
        })()}
        。切换未下载的模型会先询问，不会自动开始下载。
      </div>
      <div className={styles.segmented} style={{ margin: "10px 0 2px" }}>
        {(status?.availableModels ?? []).map((item) => (
          <button
            key={item.id}
            className={`${styles.segment} ${
              status?.activeModel === item.id ? styles.segmentActive : ""
            }`}
            onClick={() => void chooseModel(item.id)}
            disabled={installing || item.downloading}
            title={`${item.note} 约 ${mb(item.approxBytes)}`}
          >
            {item.label.replace("PP-OCRv6 ", "")}
            {item.downloading ? ` ${Math.round(item.progress * 100)}%` : ""}
          </button>
        ))}
      </div>
      {pendingModel ? (
        <div className={styles.result}>
          {pendingModel.label} 尚未下载，约 {mb(pendingModel.approxBytes)}
          。是否现在下载并切换？
          <button className={styles.linkButton} onClick={() => void confirmModel()}>
            下载并切换
          </button>
          <button className={styles.linkButton} onClick={() => setPendingModel(null)}>
            取消
          </button>
        </div>
      ) : null}
      <div className={styles.note}>
        当前页没有文字层时会在后台自动识别，不弹窗、不打断阅读。行级 OCR
        文本可拖选、复制、高亮、引用和搜索；识别在本机代理的 worker 线程完成，图片不上传云端。
      </div>
      <div className={styles.actions}>
        {!status?.installed ? (
          <button
            className={`${styles.button} ${styles.primary}`}
            onClick={() => {
              // The store exposes the failure through `error`; do not let a
              // rejected install become an unhandled rejection.
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
      {error ? <div className={styles.result}>{error}</div> : null}

      <div className={styles.rows} style={{ marginTop: 14 }}>
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
      </div>
      {sourceMode === "custom" ? (
        <div className={styles.field} style={{ marginTop: 8 }}>
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
        <div className={styles.note}>使用官方 GitHub Releases / HuggingFace 下载源。</div>
      )}
      {sourceMessage ? (
        <div className={styles.result} data-source-error={sourceError || undefined}>
          {sourceMessage}
        </div>
      ) : null}
    </section>
  );
}
