import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../../components/icons/Icon";
import { copyText } from "../../../lib/clipboard";
import { isDesktop, openDataFolder } from "../../../lib/desktop";
import { collectDiagnostics, type DiagnosticsReport } from "../../../lib/diagnostics";
import {
  checkForUpdates,
  openPdfDefaultApps,
  pdfAssociationStatus,
  registerPdfAssociation,
  removePdfAssociation,
  type PdfAssociationStatus,
  type UpdateInfo,
} from "../../../lib/update";
import { useAssistant } from "../../assistant/useAssistantStore";
import { useOcr } from "../../ocr/useOcrStore";
import styles from "../SettingsUI.module.css";

export function SystemSection() {
  const config = useAssistant((state) => state.config);
  const configError = useAssistant((state) => state.configError);
  const model = useAssistant((state) => state.model);
  const ocrStatus = useOcr((state) => state.status);
  const ocrError = useOcr((state) => state.error);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState("");
  const [association, setAssociation] = useState<PdfAssociationStatus | null>(null);
  const [associationBusy, setAssociationBusy] = useState(false);
  const [associationMessage, setAssociationMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const status = await pdfAssociationStatus();
          if (!alive) return;
          if (status.supported || !window.paperReader?.pdfAssociation) {
            setAssociation(status);
            return;
          }
        } catch {
          // Retry below; browser builds settle as unsupported.
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (alive) setAssociation(await pdfAssociationStatus().catch(() => null));
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const runDiagnostics = useCallback(async () => {
    setDiagnosticsBusy(true);
    try {
      setDiagnostics(
        await collectDiagnostics({
          config,
          model,
          configError,
          ocrStatus,
          ocrError,
          association,
          expectedVersion: __APP_VERSION__,
        }),
      );
    } finally {
      setDiagnosticsBusy(false);
    }
  }, [association, config, configError, model, ocrError, ocrStatus]);

  useEffect(() => {
    if (association !== null) void runDiagnostics();
  }, [association, runDiagnostics]);

  const associationError = (error: unknown) =>
    (error instanceof Error ? error.message : "操作失败，请重试。").replace(
      /^Error invoking remote method '[^']+': (?:Error: )?/,
      "",
    );

  const register = async (scope: "user" | "machine") => {
    setAssociationBusy(true);
    setAssociationMessage("");
    try {
      const status = await registerPdfAssociation(scope);
      setAssociation(status);
      setAssociationMessage(
        scope === "machine"
          ? "已注册到系统。正在打开 Windows 默认应用设置。"
          : "已注册到当前用户。正在打开 Windows 默认应用设置。",
      );
      await openPdfDefaultApps();
    } catch (error) {
      setAssociationMessage(associationError(error));
    } finally {
      setAssociationBusy(false);
    }
  };

  const openAssociationSettings = async () => {
    setAssociationBusy(true);
    setAssociationMessage("");
    try {
      setAssociation(await openPdfDefaultApps());
    } catch (error) {
      setAssociationMessage(associationError(error));
    } finally {
      setAssociationBusy(false);
    }
  };

  const removeAssociation = async () => {
    setAssociationBusy(true);
    setAssociationMessage("");
    try {
      setAssociation(await removePdfAssociation(association?.scope ?? undefined));
      setAssociationMessage("已移除 PDF 打开方式注册，当前默认应用未改动。");
    } catch (error) {
      setAssociationMessage(associationError(error));
    } finally {
      setAssociationBusy(false);
    }
  };

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateError("");
    setUpdateInfo(null);
    try {
      setUpdateInfo(await checkForUpdates(true));
    } catch (error) {
      const message = error instanceof Error ? error.message : "检查更新失败，请重试。";
      setUpdateError(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const copyDiagnostics = async () => {
    if (!diagnostics) return;
    const ok = await copyText(diagnostics.copyText);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  const associationState = !association
    ? "正在检查…"
    : association.isDefault
      ? `文疏${association.scope === "machine" ? "（系统级）" : ""}`
      : association.stale
        ? "路径已变化，需要重新注册"
        : association.registered
          ? `已注册（${association.scope === "machine" ? "系统级" : "当前用户"}），尚未设为默认`
          : "尚未注册";

  return (
    <div className={styles.page} data-settings-section="system">
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>系统</h2>
          <p className={styles.pageDesc}>管理更新、PDF 打开方式和应用运行状态。</p>
        </div>
      </header>

      <section className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="retry" size={16} />
          更新
        </div>
        <div className={styles.row}>
          <span className={styles.label}>当前版本</span>
          <span className={styles.value}>
            {__APP_VERSION__} · {__GIT_SHA__} · {__BUILD_DATE__}
          </span>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.button} ${styles.primary}`}
            onClick={() => void checkUpdate()}
            disabled={checkingUpdate}
          >
            {checkingUpdate ? "检查中…" : "检查更新"}
          </button>
        </div>
        {updateInfo ? (
          <div className={styles.inlineNotice}>
            <Icon name={updateInfo.hasUpdate ? "info" : "check"} size={15} />
            {updateInfo.hasUpdate
              ? `发现新版本 ${updateInfo.latest}`
              : `已是最新版本 ${updateInfo.current}`}
            {updateInfo.publishedAt ? ` · ${updateInfo.publishedAt.slice(0, 10)}` : ""}
            {updateInfo.hasUpdate ? (
              <a
                className={styles.linkButton}
                href={updateInfo.url}
                target="_blank"
                rel="noreferrer"
              >
                打开发布页
              </a>
            ) : null}
          </div>
        ) : null}
        {updateError ? (
          <div className={`${styles.inlineNotice} ${styles.noticeError}`}>
            <Icon name="error" size={15} />
            {updateError}
          </div>
        ) : null}
      </section>

      {association?.supported ? (
        <section className={styles.group}>
          <div className={styles.groupTitle}>
            <Icon name="page" size={16} />
            默认 PDF 应用
          </div>
          <div className={styles.row}>
            <span className={styles.label}>状态</span>
            <span className={`${styles.value} ${association.isDefault ? styles.ok : ""}`}>
              {associationState}
            </span>
          </div>
          <div className={styles.actions}>
            {association.registered && !association.stale ? (
              <button
                className={styles.button}
                onClick={() => void openAssociationSettings()}
                disabled={associationBusy}
              >
                打开默认应用设置
              </button>
            ) : null}
            {association.scope !== "machine" || !association.registered || association.stale ? (
              <button
                className={`${styles.button} ${styles.primary}`}
                onClick={() => void register("machine")}
                disabled={associationBusy}
              >
                {associationBusy
                  ? "处理中…"
                  : association.stale || !association.registered
                    ? "重新注册到系统"
                    : "注册到系统"}
              </button>
            ) : null}
            <details className={styles.moreActions}>
              <summary>更多</summary>
              {association.scope !== "machine" && (!association.registered || association.stale) ? (
                <button
                  className={styles.button}
                  onClick={() => void register("user")}
                  disabled={associationBusy}
                >
                  仅当前用户
                </button>
              ) : null}
              {association.registered ? (
                <button
                  className={styles.button}
                  onClick={() => void removeAssociation()}
                  disabled={associationBusy}
                >
                  移除关联
                </button>
              ) : null}
            </details>
          </div>
          <div className={styles.privacyFoot}>
            <Icon name="info" size={14} />
            Windows 需要你在系统设置中确认默认应用。
          </div>
          {associationMessage ? (
            <div className={styles.inlineNotice}>{associationMessage}</div>
          ) : null}
        </section>
      ) : null}

      <section className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="help" size={16} />
          运行状态
        </div>
        <div className={styles.diagRows} aria-live="polite">
          {(diagnostics?.rows ?? []).map((row) => (
            <div className={styles.diagRow} key={row.id}>
              <i
                className={`${styles.diagDot} ${
                  row.tone === "ok"
                    ? styles.diagOk
                    : row.tone === "warn"
                      ? styles.diagWarn
                      : styles.diagError
                }`}
                aria-hidden="true"
              />
              <span className={styles.diagLabel}>{row.label}</span>
              <span className={styles.diagDetail}>{row.detail}</span>
            </div>
          ))}
          {!diagnostics ? (
            <div className={styles.diagRow}>
              <i className={`${styles.diagDot} ${styles.diagWarn}`} aria-hidden="true" />
              <span className={styles.diagLabel}>正在检测…</span>
              <span className={styles.diagDetail}>
                {diagnosticsBusy ? "读取本地服务状态" : "等待检测"}
              </span>
            </div>
          ) : null}
        </div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={() => void runDiagnostics()}>
            重新检测
          </button>
          <button
            className={styles.button}
            onClick={() => void copyDiagnostics()}
            disabled={!diagnostics}
          >
            {copied ? "已复制" : "复制运行信息"}
          </button>
          {isDesktop() ? (
            <button
              className={styles.button}
              onClick={() => void openDataFolder().catch(() => undefined)}
            >
              打开数据文件夹
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
