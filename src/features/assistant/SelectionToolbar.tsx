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
      <button
        className={styles.selectionButton}
        onClick={async () => {
          const ok = await copyText(selection.text);
          notify(ok ? "已复制原文" : "复制失败", ok ? "success" : "error");
          clear();
        }}
        title="复制原文"
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
            selection.pages?.map((page) => ({ page: page.page, text: page.text })),
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
          notify("已添加高亮", "success");
        }}
        title="高亮这段文字"
      >
        <WinIcon glyph="highlight" size={13} />
        高亮
      </button>
    </div>
  );
}
