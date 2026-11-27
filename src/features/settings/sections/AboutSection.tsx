import { Icon } from "../../../components/icons/Icon";
import { isPrerelease, REPOSITORY_URL } from "../../../lib/update";
import styles from "../SettingsUI.module.css";

export function AboutSection() {
  return (
    <div className={styles.page} data-settings-section="about">
      <header className={styles.hero}>
        <img className={styles.heroIcon} src="/icon.png" alt="" width={64} height={64} />
        <div className={styles.heroText}>
          <div className={styles.heroName}>
            文疏
            <span className={styles.versionBadge}>v{__APP_VERSION__}</span>
            {isPrerelease(__APP_VERSION__) ? (
              <span className={`${styles.statusPill} ${styles.pillWarn}`}>预览版</span>
            ) : null}
          </div>
          <p className={styles.heroDesc}>本地优先的 PDF 阅读器，把阅读与对话放在同一页。</p>
        </div>
      </header>

      <section className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="globe" size={16} />
          项目链接
        </div>
        <div className={styles.linkGrid}>
          <a className={styles.linkRow} href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            <span>GitHub 仓库</span>
            <Icon name="chevronRight" size={14} />
          </a>
          <a
            className={styles.linkRow}
            href={`${REPOSITORY_URL}/issues`}
            target="_blank"
            rel="noreferrer"
          >
            <span>问题反馈</span>
            <Icon name="chevronRight" size={14} />
          </a>
          <a
            className={styles.linkRow}
            href={`${REPOSITORY_URL}/blob/main/SECURITY.md`}
            target="_blank"
            rel="noreferrer"
          >
            <span>安全策略</span>
            <Icon name="chevronRight" size={14} />
          </a>
          <a
            className={styles.linkRow}
            href={`${REPOSITORY_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
          >
            <span>许可证</span>
            <Icon name="chevronRight" size={14} />
          </a>
        </div>
      </section>

      <details className={`${styles.group} ${styles.groupDetails}`}>
        <summary className={styles.groupSummary}>
          <span>第三方声明</span>
          <span className={styles.groupHint}>运行时、图标与 OCR</span>
        </summary>
        <div className={styles.thirdParty}>
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
        </div>
      </details>
    </div>
  );
}
