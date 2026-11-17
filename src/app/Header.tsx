import { useEffect, useRef, useState } from "react";
import { BrandMark, SparkleIcon } from "../components/icons/SparkleIcon";
import { Icon } from "../components/icons/Icon";
import { pickPdfFile } from "../lib/openFile";
import { useViewer } from "../features/viewer/useViewerStore";
import { useAssistant } from "../features/assistant/useAssistantStore";
import styles from "./Chrome.module.css";

type Props = {
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenSearch: () => void;
};

export function Header({ onOpenSettings, onOpenShortcuts, onOpenSearch }: Props) {
  const docName = useViewer((state) => state.docName);
  const numPages = useViewer((state) => state.numPages);
  const currentPage = useViewer((state) => state.currentPage);
  const zoom = useViewer((state) => state.zoom);
  const openFile = useViewer((state) => state.openFile);
  const recent = useViewer((state) => state.recent);
  const openRecent = useViewer((state) => state.openRecent);
  const closeDocument = useViewer((state) => state.closeDocument);
  const requestScroll = useViewer((state) => state.requestScroll);
  const zoomBy = useViewer((state) => state.zoomBy);
  const requestFit = useViewer((state) => state.requestFit);
  const setZoom = useViewer((state) => state.setZoom);

  const status = useAssistant((state) => state.status);
  const openFrom = useAssistant((state) => state.openFrom);

  const [pageDraft, setPageDraft] = useState(String(currentPage));
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageDraft(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!zoomRef.current?.contains(event.target as Node)) setZoomMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [zoomMenuOpen]);

  const commitPage = (value: string | number = pageDraft) => {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= numPages) {
      requestScroll(parsed);
    } else {
      setPageDraft(String(currentPage));
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <BrandMark size={22} />
        <span className={styles.brandName}>文疏</span>
      </div>
      <div className={styles.divider} />
      <div className={styles.docTitle} title={docName || "未打开文档"}>
        {docName ? `${docName}${numPages ? ` · ${numPages} 页` : ""}` : "未打开文档"}
      </div>

      <div className={styles.spacer} />

      {numPages ? (
        <>
          <div className={styles.pager} title="跳转页码">
            <Icon name="page" size={14} />
            <input
              className={styles.pageInput}
              value={pageDraft}
              inputMode="numeric"
              aria-label="当前页码"
              onChange={(event) => setPageDraft(event.target.value.replace(/[^\d]/g, ""))}
              onBlur={(event) => commitPage(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <span>/ {numPages}</span>
          </div>
          <div className={styles.zoomGroup}>
            <button
              className={styles.zoomStep}
              onClick={() => zoomBy(-0.1)}
              aria-label="缩小页面"
              title="缩小（-）"
            >
              −
            </button>
            <div className={styles.zoomWrap} ref={zoomRef}>
              <button
                className={styles.zoomButton}
                onClick={() => setZoomMenuOpen((open) => !open)}
                title="缩放选项"
                aria-label={`缩放 ${Math.round(zoom * 100)}%`}
                aria-expanded={zoomMenuOpen}
              >
                {Math.round(zoom * 100)}%
              </button>
              {zoomMenuOpen ? (
                <div className={styles.zoomMenu} role="menu">
                  <button
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => {
                      requestFit("width");
                      setZoomMenuOpen(false);
                    }}
                  >
                    适合宽度
                  </button>
                  <button
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => {
                      requestFit("page");
                      setZoomMenuOpen(false);
                    }}
                  >
                    适合页面
                  </button>
                  <button
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => {
                      setZoom(1, "custom");
                      setZoomMenuOpen(false);
                    }}
                  >
                    实际大小 100%
                  </button>
                </div>
              ) : null}
            </div>
            <button
              className={styles.zoomStep}
              onClick={() => zoomBy(0.1)}
              aria-label="放大页面"
              title="放大（+）"
            >
              +
            </button>
          </div>
        </>
      ) : null}

      <div className={styles.group}>
        <button
          className={styles.iconButton}
          onClick={onOpenSearch}
          aria-label="搜索文档"
          aria-keyshortcuts="Control+F"
          title="搜索（Ctrl+F）"
        >
          <Icon name="search" size={16} />
        </button>
        <div className={styles.divider} />
        <button
          className={`${styles.aiButton} ${status === "open" ? styles.active : ""}`}
          data-ai-entry
          aria-label="文疏 AI 阅读助手"
          aria-keyshortcuts="Control+J"
          title="文疏 · AI 阅读助手（Ctrl+J）"
          onClick={(event) => openFrom(event.currentTarget)}
        >
          <SparkleIcon size={17} />
        </button>
        <div className={styles.menuWrap} ref={menuRef}>
          <button
            className={styles.iconButton}
            aria-label="更多"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name="more" size={16} />
          </button>
          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <button
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  pickPdfFile((file) => void openFile(file));
                }}
              >
                <Icon name="page" size={14} />
                打开 PDF
              </button>
              {recent.slice(0, 3).map((item) => (
                <button
                  key={item.hash}
                  className={styles.menuItem}
                  role="menuitem"
                  title={`${item.name} · ${item.pages} 页`}
                  onClick={() => {
                    setMenuOpen(false);
                    void openRecent(item.hash);
                  }}
                >
                  <Icon name="history" size={14} />
                  <span className={styles.menuRecentName}>{item.name}</span>
                  <span className={styles.menuRecentPages}>{item.pages} 页</span>
                </button>
              ))}
              <button
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSearch();
                }}
              >
                <Icon name="search" size={14} />
                搜索
              </button>
              <div className={styles.menuSep} />
              <button
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenShortcuts();
                }}
              >
                <Icon name="help" size={14} />
                快捷键
              </button>
              <button
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
              >
                <Icon name="settings" size={14} />
                设置
              </button>
              {docName ? (
                <>
                  <div className={styles.menuSep} />
                  <button
                    className={`${styles.menuItem} ${styles.danger}`}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void closeDocument();
                    }}
                  >
                    <Icon name="close" size={14} />
                    关闭文档
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
