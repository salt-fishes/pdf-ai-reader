import { Icon } from "../../components/icons/Icon";
import { pickPdfFile } from "../../lib/openFile";
import { useTabs } from "./useTabStore";
import styles from "../../app/Chrome.module.css";

export function PdfTabStrip() {
  const tabs = useTabs((state) => state.tabs);
  const activeTabId = useTabs((state) => state.activeTabId);
  const activateTab = useTabs((state) => state.activateTab);
  const closeTab = useTabs((state) => state.closeTab);
  const openFileTab = useTabs((state) => state.openFileTab);

  return (
    <div className={styles.tabStrip}>
      <div className={styles.tabList} role="tablist" aria-label="PDF 标签">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ""}`}
            role="tab"
            aria-selected={tab.id === activeTabId}
            aria-label={`${tab.name}${tab.status === "relink" ? "，需重新链接" : ""}，按 Delete 关闭`}
            data-reading-page={tab.reading.lastPage}
            tabIndex={tab.id === activeTabId ? 0 : -1}
            title={`${tab.name} · ${
              tab.status === "relink" ? "缓存不可用，点击重新选择文件" : "中键或 Delete 关闭"
            }`}
            onClick={() => void activateTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                void closeTab(tab.id);
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                void activateTab(tab.id);
                return;
              }
              const index = tabs.findIndex((item) => item.id === tab.id);
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              const target = tabs[next];
              void activateTab(target.id);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
            onAuxClick={(event) => {
              if (event.button === 1) void closeTab(tab.id);
            }}
          >
            {tab.status === "loading" ? (
              <i className={styles.tabSpinner} aria-hidden="true" />
            ) : null}
            <span className={styles.tabName}>{tab.name}</span>
            <Icon className={styles.tabGlyph} name="close" size={12} />
          </button>
        ))}
      </div>
      <button
        className={styles.tabAdd}
        aria-label="新建 PDF 标签"
        title="打开新 PDF 标签"
        onClick={() => pickPdfFile((file) => openFileTab(file))}
      >
        <Icon name="plus" size={15} />
      </button>
    </div>
  );
}
