import { useEffect, useRef, useState } from "react";
import { WinIcon } from "../components/icons/WinIcon";
import { getColorMode } from "../lib/reading/color";
import { ColorModeControl } from "../features/viewer/ColorModeControl";
import { useViewer } from "../features/viewer/useViewerStore";
import styles from "./Chrome.module.css";

type Props = {
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
};

export function Rail({ onOpenSettings, onOpenShortcuts }: Props) {
  const sidebar = useViewer((state) => state.sidebar);
  const toggleSidebar = useViewer((state) => state.toggleSidebar);
  const hasDoc = useViewer((state) => Boolean(state.docHash));
  const colorMode = useViewer((state) => state.colorMode);
  const color = getColorMode(colorMode);
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!colorRef.current?.contains(event.target as Node)) setColorOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setColorOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [colorOpen]);

  return (
    <aside className={styles.rail} aria-label="侧边工具">
      <button
        className={`${styles.railButton} ${sidebar === "pages" ? styles.active : ""}`}
        onClick={() => toggleSidebar("pages")}
        aria-label="页面"
        aria-pressed={sidebar === "pages"}
        title="页面"
        disabled={!hasDoc}
      >
        <WinIcon glyph="page" size={16} />
      </button>
      <button
        className={`${styles.railButton} ${sidebar === "outline" ? styles.active : ""}`}
        onClick={() => toggleSidebar("outline")}
        aria-label="目录"
        aria-pressed={sidebar === "outline"}
        title="目录"
        disabled={!hasDoc}
      >
        <WinIcon glyph="outline" size={16} />
      </button>
      <button
        className={`${styles.railButton} ${sidebar === "highlights" ? styles.active : ""}`}
        onClick={() => toggleSidebar("highlights")}
        aria-label="高亮"
        aria-pressed={sidebar === "highlights"}
        title="高亮"
        disabled={!hasDoc}
      >
        <WinIcon glyph="highlightList" size={16} />
      </button>

      <div className={styles.railSpacer} />

      <div className={styles.railSep} />
      <div className={styles.railPopWrap} ref={colorRef}>
        <button
          className={`${styles.railButton} ${colorOpen ? styles.active : ""}`}
          onClick={() => setColorOpen((open) => !open)}
          aria-label={`色彩模式：${color.label}`}
          aria-expanded={colorOpen}
          title={`色彩模式：${color.label}`}
        >
          <WinIcon
            glyph={colorMode === "smart" || colorMode === "invert" ? "moon" : "theme"}
            size={16}
          />
        </button>
        {colorOpen ? (
          <div className={styles.colorPopover} role="dialog" aria-label="色彩模式">
            <div className={styles.popoverHead}>
              <span className={styles.popoverTitle}>色彩模式</span>
              <span className={styles.popoverMode}>{color.label}</span>
            </div>
            <ColorModeControl />
          </div>
        ) : null}
      </div>
      <button
        className={styles.railButton}
        onClick={onOpenShortcuts}
        aria-label="快捷键"
        title="快捷键（?）"
      >
        <WinIcon glyph="help" size={16} />
      </button>
      <button className={styles.railButton} onClick={onOpenSettings} aria-label="设置" title="设置">
        <WinIcon glyph="settings" size={16} />
      </button>
    </aside>
  );
}
