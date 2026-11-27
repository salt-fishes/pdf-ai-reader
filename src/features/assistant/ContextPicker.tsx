import { useRef, useState } from "react";
import { Icon } from "../../components/icons/Icon";
import { useViewer } from "../viewer/useViewerStore";
import { PagePicker } from "./PagePicker";
import { useAssistant } from "./useAssistantStore";
import styles from "./Assistant.module.css";

export function ContextPicker({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<"actions" | "pages">("actions");
  const fileRef = useRef<HTMLInputElement>(null);
  const addAttachment = useAssistant((state) => state.addAttachment);
  const capturePage = useAssistant((state) => state.capturePage);
  const startRegionCapture = useAssistant((state) => state.startRegionCapture);
  const summarizeDocument = useAssistant((state) => state.summarizeDocument);
  const notify = useAssistant((state) => state.notify);
  const attaching = useAssistant((state) => state.attaching);
  const capturingPage = useAssistant((state) => state.capturingPage);
  const summary = useAssistant((state) => state.summary);
  const streaming = useAssistant((state) => Boolean(state.streamingId));
  const docHash = useViewer((state) => state.docHash);

  const addFiles = async (files: FileList | File[]) => {
    for (const file of [...files]) {
      const result = await addAttachment(file);
      if (!result.ok) notify(result.message ?? "附件失败", "error");
    }
    onClose();
  };

  if (view === "pages") {
    return <PagePicker onClose={onClose} showSmart />;
  }

  return (
    <div className={styles.contextMenu}>
      <div className={styles.contextMenuHead}>
        <div>
          <div className={styles.contextMenuTitle}>添加上下文</div>
          <div className={styles.contextMenuHint}>当前页会自动跟随，其他内容按需添加。</div>
        </div>
        <button className={styles.contextMenuClose} onClick={onClose} aria-label="关闭上下文菜单">
          <Icon name="close" size={14} />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept=".pdf,application/pdf,image/*,.txt,.md,.markdown,.csv,.json"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className={styles.contextActions}>
        <button
          className={styles.contextAction}
          onClick={() => setView("pages")}
          aria-label="限定页码"
        >
          <span className={styles.contextActionIcon}>
            <Icon name="page" size={17} />
          </span>
          <span>页面范围</span>
          <small>当前 / 全部 / 自定义</small>
        </button>
        <button
          className={styles.contextAction}
          onClick={() => fileRef.current?.click()}
          disabled={attaching}
          aria-label="添加附件"
        >
          <span className={styles.contextActionIcon}>
            {attaching ? <span className="spin" /> : <Icon name="attach" size={17} />}
          </span>
          <span>附件</span>
          <small>PDF / 图片 / 文本</small>
        </button>
        <button
          className={styles.contextAction}
          onClick={() => {
            onClose();
            void capturePage(useViewer.getState().currentPage);
          }}
          disabled={capturingPage !== null || !docHash}
          aria-label="截取当前页"
        >
          <span className={styles.contextActionIcon}>
            {capturingPage !== null ? <span className="spin" /> : <Icon name="camera" size={17} />}
          </span>
          <span>页面截图</span>
          <small>发送当前整页</small>
        </button>
        <button
          className={styles.contextAction}
          onClick={() => {
            onClose();
            startRegionCapture(useViewer.getState().currentPage);
          }}
          disabled={capturingPage !== null || !docHash}
          aria-label="框选截图"
        >
          <span className={styles.contextActionIcon}>
            <Icon name="crop" size={17} />
          </span>
          <span>框选截图</span>
          <small>在页面上拖拽</small>
        </button>
        <button
          className={styles.contextAction}
          onClick={() => {
            onClose();
            void summarizeDocument();
          }}
          disabled={Boolean(summary) || streaming || !docHash}
          aria-label="总结整份文档"
        >
          <span className={styles.contextActionIcon}>
            {summary ? <span className="spin" /> : <Icon name="outline" size={17} />}
          </span>
          <span>总结全文</span>
          <small>自动分段处理</small>
        </button>
      </div>
    </div>
  );
}
