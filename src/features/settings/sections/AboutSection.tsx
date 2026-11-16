import { useEffect, useState } from "react";
import { Icon } from "../../../components/icons/Icon";
import { BrandMark } from "../../../components/icons/SparkleIcon";
import { copyText } from "../../../lib/clipboard";
import {
  checkForUpdates,
  desktopVersions,
  isPrerelease,
  RELEASES_PAGE,
  REPOSITORY_URL,
  type UpdateInfo,
} from "../../../lib/update";
import { useAssistant } from "../../assistant/useAssistantStore";
import { useOcr } from "../../ocr/useOcrStore";
import styles from "../../../components/Modal.module.css";

export function AboutSection() {
  const config = useAssistant((state) => state.config);
  const model = useAssistant((state) => state.model);
  const ocrStatus = useOcr((state) => state.status);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState("");
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [pdfjsVersion, setPdfjsVersion] = useState("—");
  const versions = desktopVersions();

  useEffect(() => {
    void import("pdfjs-dist")
      .then((module) => setPdfjsVersion(module.version))
      .catch(() => undefined);
  }, []);

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
    let providerHost = "—";
    try {
      providerHost = config?.baseUrl ? new URL(config.baseUrl).host : "—";
    } catch {
      providerHost = config?.baseUrl || "—";
    }
    const lines = [
      `纸间 ${__APP_VERSION__} (${__GIT_SHA__}, ${__BUILD_DATE__})`,
      `平台 ${navigator.platform || "—"}`,
      `Electron ${versions.electron ?? "—"} · Chromium ${versions.chrome ?? "—"}`,
      `PDF.js ${pdfjsVersion}`,
      `Provider ${providerHost}`,
      `模型 ${model || "—"}`,
      `OCR ${ocrStatus?.activeModel ?? "—"}`,
    ];
    const ok = await copyText(lines.join("\n"));
    setDiagnosticsCopied(ok);
  };

  return (
    <section className={styles.section} data-settings-section="about">
      <div className={styles.sectionTitle}>
        <Icon name="info" size={16} />
        关于
      </div>
      <div className={styles.aboutGrid}>
        <div className={styles.aboutBrand}>
          <span className={styles.aboutMark}>
            <BrandMark size={48} />
          </span>
          <div>
            <strong>纸间</strong>
            <p>本地优先的 PDF 阅读器与 AI 阅读助手。</p>
          </div>
        </div>
        <div className={styles.aboutMeta}>
          <span>
            版本 {__APP_VERSION__} · {__GIT_SHA__} · {__BUILD_DATE__}
          </span>
          <span>
            Electron {versions.electron ?? "—"} · Chromium {versions.chrome ?? "—"}
          </span>
          <span>pdf.js {pdfjsVersion}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          className={`${styles.button} ${styles.primary}`}
          onClick={() => void checkUpdate()}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? "检查中…" : "检查更新"}
        </button>
        <button className={styles.button} onClick={() => void copyDiagnostics()}>
          {diagnosticsCopied ? "已复制" : "复制诊断信息"}
        </button>
        <a className={styles.button} href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a
          className={styles.button}
          href={`${REPOSITORY_URL}/issues`}
          target="_blank"
          rel="noreferrer"
        >
          问题反馈
        </a>
        <a
          className={styles.button}
          href={`${REPOSITORY_URL}/blob/main/SECURITY.md`}
          target="_blank"
          rel="noreferrer"
        >
          安全策略
        </a>
        <a
          className={styles.button}
          href={`${REPOSITORY_URL}/blob/main/LICENSE`}
          target="_blank"
          rel="noreferrer"
        >
          许可证
        </a>
      </div>
      {isPrerelease(__APP_VERSION__) ? (
        <div className={styles.note}>你正在使用预发布版本，正式版发布后可直接覆盖安装。</div>
      ) : null}
      {updateInfo ? (
        <div className={styles.result}>
          {updateInfo.hasUpdate
            ? `发现新版本 ${updateInfo.latest}`
            : `已是最新版本 ${updateInfo.current}`}
          {updateInfo.publishedAt ? ` · ${updateInfo.publishedAt.slice(0, 10)}` : ""}
          {updateInfo.hasUpdate ? (
            <a
              className={styles.linkButton}
              href={updateInfo.url || RELEASES_PAGE}
              target="_blank"
              rel="noreferrer"
            >
              打开发布页
            </a>
          ) : null}
        </div>
      ) : null}
      {updateError ? <div className={styles.result}>{updateError}</div> : null}
      <div className={styles.note}>
        更新只在你点击时检查 GitHub Releases，不后台轮询、不自动下载或安装。主 PDF
        不上传；模型不会执行文档中的指令。第三方服务由其各自条款约束。
      </div>
      <details className={styles.thirdParty}>
        <summary>第三方声明</summary>
        <div>
          运行时：Electron（MIT）、Chromium（BSD）、pdf.js（Apache-2.0）、React（MIT）、KaTeX（MIT）。
        </div>
        <div>
          图标：Lucide（ISC）、lobe-icons（MIT）；品牌标记为自制。OCR：PP-OCRv6
          （Apache-2.0）、ppu-paddle-ocr（MIT）、ONNX Runtime（MIT）。
        </div>
        <a
          href={`${REPOSITORY_URL}/blob/main/THIRD_PARTY_NOTICES.md`}
          target="_blank"
          rel="noreferrer"
        >
          完整第三方声明 →
        </a>
      </details>
    </section>
  );
}
