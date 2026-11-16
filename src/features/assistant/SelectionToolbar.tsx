import { WinIcon } from "../../components/icons/WinIcon";
import { QuoteIcon } from "../../components/icons/SparkleIcon";
import { copyText } from "../../lib/clipboard";
import { useViewer } from "../viewer/useViewerStore";
import { useAssistant } from "./useAssistantStore";
import styles from "./Assistant.module.css";

export function SelectionToolbar() {
  const selection = useViewer((state) => state.selection);
  const setSelection = useViewer((state) => state.setSelection);
  const addHighlight = useViewer((state) => state.addHighlight);
  const addSelection = useAssistant((state) => state.addSelection);
  const notify = useAssistant((state) => state.notify);

  if (!selection) return null;
  const ocr = selection.source === "ocr" || selection.source === "mixed";

  const clear = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  return (
    <div
      className={styles.selectionToolbar}
      style={{ left: selection.toolbar.x, top: selection.toolbar.y }}
      role="toolbar"
      aria-label="选中文字操作"
      onMouseDown={(event) => event.preventDefault()}
    >
      {ocr ? (
        <span className={styles.selectionOcr} title="这段文字由本机 OCR 识别，可能有误差">
          OCR
        </span>
      ) : null}
      <button
        className={styles.selectionButton}
        onClick={async () => {
          const ok = await copyText(selection.text);
          notify(
            ok
              ? ocr
                ? "已复制 OCR 文字（可能有误差）"
                : "已复制原文"
              : "复制失败",
            ok ? "success" : "error",
          );
          clear();
        }}
        title={ocr ? "复制 OCR 识别文字" : "复制原文"}
      >
        <WinIcon glyph="copy" size={13} />
        复制
      </button>
      <button
        className={styles.selectionButton}
        onClick={() => {
          addSelection(
            selection.page,
            selection.text,
            selection.pages?.map((page) => ({
              page: page.page,
              text: page.text,
              source: page.source,
            })),
            selection.source,
          );
          clear();
        }}
        title="引用到对话（Ctrl+Alt+Q）"
      >
        <QuoteIcon size={13} />
        引用
      </button>
      <span className={styles.selectionSep} />
      <button
        className={styles.selectionButton}
        onClick={() => {
          addHighlight(selection);
          clear();
          notify(ocr ? "已添加 OCR 高亮" : "已添加高亮", "success");
        }}
        title="高亮这段文字"
      >
        <WinIcon glyph="highlight" size={13} />
        高亮
      </button>
    </div>
  );
}
