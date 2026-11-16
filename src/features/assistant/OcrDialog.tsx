import { WinIcon } from "../../components/icons/WinIcon";
import { useAssistant } from "./useAssistantStore";
import modal from "../../components/Modal.module.css";
import styles from "./OcrDialog.module.css";

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function OcrDialog() {
  const open = useAssistant((state) => state.ocrDialogOpen);
  const status = useAssistant((state) => state.ocrStatus);
  const pending = useAssistant((state) => state.ocrPendingPage);
  const busyPage = useAssistant((state) => state.ocrBusyPage);
  const installing = useAssistant((state) => state.ocrInstalling);
  const error = useAssistant((state) => state.ocrError);
  const close = useAssistant((state) => state.closeOcrDialog);
  const install = useAssistant((state) => state.installOcr);
  const recognize = useAssistant((state) => state.recognizePage);
  const refresh = useAssistant((state) => state.refreshOcrStatus);

  if (!open) return null;

  const installed = Boolean(status?.installed);
  const downloading = Boolean(status?.downloading) || installing;
  const total = status?.total ?? 6_270_385;
  const downloaded = status?.downloaded ?? 0;
  const progress = Math.min(1, status?.progress ?? 0);
  const recognizing = busyPage !== null;

  return (
    <div
      className={modal.backdrop}
      onPointerDown={(event) => event.target === event.currentTarget && !recognizing && close()}
    >
      <div className={modal.card} role="dialog" aria-modal="true" aria-label="扫描件 OCR">
        <div className={modal.head}>
          <span className={modal.title}>扫描件文字识别</span>
          <span className={modal.headSpacer} />
          <button
            className={modal.close}
            onClick={() => !recognizing && close()}
            aria-label="关闭 OCR 对话框"
            disabled={recognizing}
          >
            <WinIcon glyph="close" size={15} />
          </button>
        </div>

        <div className={modal.body}>
          <section className={modal.section}>
            <div className={modal.sectionTitle}>
              <WinIcon glyph="search" size={13} />
              PP-OCRv6 tiny
            </div>
            <div className={styles.lead}>
              首次使用才下载检测与识别模型（约 {mb(total)}），保存在本机代理目录。 图片只发送到{" "}
              <code>127.0.0.1</code>，不会上传云端；识别出的文字用于提问、搜索和智能筛选。
            </div>
            <div className={styles.meta}>
              <span>模型：PP-OCRv6 tiny · Apache-2.0</span>
              <span className={installed ? styles.ok : styles.pending}>
                {downloading
                  ? `下载中 ${Math.round(progress * 100)}%`
                  : installed
                    ? "已安装"
                    : "未下载"}
              </span>
            </div>

            {downloading ? (
              <>
                <div className={styles.track} aria-hidden="true">
                  <span
                    className={styles.fill}
                    style={{ width: `${Math.max(2, progress * 100)}%` }}
                  />
                </div>
                <div className={styles.progressText}>
                  {mb(downloaded)} / {mb(total)}
                </div>
              </>
            ) : null}

            {recognizing ? (
              <div className={styles.busy} role="status">
                <span className="spin" />
                正在识别第 {busyPage} 页…
              </div>
            ) : null}

            {error ? <div className={styles.error}>{error}</div> : null}

            <div className={modal.actions}>
              {installed ? (
                <>
                  {pending ? (
                    <button
                      className={`${modal.button} ${modal.primary}`}
                      onClick={() => void recognize(pending)}
                      disabled={recognizing}
                    >
                      识别第 {pending} 页
                    </button>
                  ) : null}
                  <button className={modal.button} onClick={() => void refresh()}>
                    重新检查
                  </button>
                  <button className={modal.button} onClick={close} disabled={recognizing}>
                    关闭
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`${modal.button} ${modal.primary}`}
                    onClick={() => void install()}
                    disabled={downloading || recognizing}
                  >
                    {downloading
                      ? "正在下载…"
                      : pending
                        ? `下载并识别第 ${pending} 页`
                        : "下载模型"}
                  </button>
                  <button
                    className={modal.button}
                    onClick={close}
                    disabled={downloading || recognizing}
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </section>

          <section className={modal.section}>
            <div className={modal.sectionTitle}>说明</div>
            <div className={modal.note}>
              识别在本机代理进程中完成；模型缺失时可把 ONNX 文件放入
              <code>server/models/ppocrv6</code>，或在设置中下载。 扫描页本身仍是图片，OCR
              只补充可检索的文本。
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
