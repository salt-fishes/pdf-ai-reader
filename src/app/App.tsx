import { Suspense, lazy, useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { Header } from "./Header";
import { Rail } from "./Rail";
import { Sidebar } from "./Sidebar";
import { SearchOverlay } from "./SearchOverlay";
import { PdfViewer } from "../features/viewer/PdfViewer";
import { useViewer } from "../features/viewer/useViewerStore";
import { REGION_EVENT, type RegionSelectionDetail } from "../features/viewer/region";
import { AssistantFab } from "../features/assistant/AssistantFab";
import { SelectionToolbar } from "../features/assistant/SelectionToolbar";
import { useAssistant } from "../features/assistant/useAssistantStore";
import { OcrDialog } from "../features/assistant/OcrDialog";
import { closePanel, minimizePanel } from "../features/assistant/panelControl";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { ShortcutsDialog } from "../features/shortcuts/ShortcutsDialog";
import { useHotkeys, type Hotkey } from "../hooks/useHotkeys";
import { pickPdfFile } from "../lib/openFile";
import { getColorMode } from "../lib/reading/color";
import styles from "./App.module.css";
import assistantStyles from "../features/assistant/Assistant.module.css";

const AssistantPanel = lazy(() =>
  import("../features/assistant/AssistantPanel").then((module) => ({
    default: module.AssistantPanel,
  })),
);

export function App() {
  const docHash = useViewer((state) => state.docHash);
  const currentPage = useViewer((state) => state.currentPage);
  const colorMode = useViewer((state) => state.colorMode);
  const theme = getColorMode(colorMode).chrome;
  const regionPage = useViewer((state) => state.regionPage);
  const status = useAssistant((state) => state.status);
  const mode = useAssistant((state) => state.mode);
  const panel = useAssistant((state) => state.panel);
  const panelPreviewWidth = useAssistant((state) => state.panelPreviewWidth);
  const toast = useAssistant((state) => state.toast);
  const loadForDoc = useAssistant((state) => state.loadForDoc);
  const bootstrap = useAssistant((state) => state.bootstrap);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const onRegion = (event: Event) => {
      const detail = (event as CustomEvent<RegionSelectionDetail>).detail;
      if (!detail?.page) return;
      void useAssistant.getState().captureRegion(detail.page, detail.rect);
    };
    window.addEventListener(REGION_EVENT, onRegion);
    return () => window.removeEventListener(REGION_EVENT, onRegion);
  }, []);

  useEffect(() => {
    if (!docHash) return;
    let alive = true;
    void (async () => {
      await loadForDoc(docHash);
      if (!alive) return;
      await useAssistant.getState().syncCurrentPage(useViewer.getState().currentPage);
    })();
    return () => {
      alive = false;
    };
  }, [docHash, loadForDoc]);

  useEffect(() => {
    if (!docHash) return;
    void useAssistant.getState().syncCurrentPage(currentPage);
  }, [currentPage, docHash]);

  const toggleAssistant = () => {
    const assistant = useAssistant.getState();
    if (assistant.status === "open") {
      minimizePanel();
      return;
    }
    const trigger =
      document.querySelector<HTMLElement>("[data-assistant-fab]") ??
      document.querySelector<HTMLElement>("[data-ai-entry]");
    assistant.openFrom(trigger);
  };

  const bindings = useMemo<Hotkey[]>(
    () => [
      { key: "j", mod: true, allowInInput: true, run: toggleAssistant },
      { key: "j", alt: true, allowInInput: true, run: () => closePanel() },
      {
        key: "k",
        mod: true,
        allowInInput: true,
        run: () => {
          const trigger = document.querySelector<HTMLElement>("[data-ai-entry]");
          useAssistant.getState().openFrom(trigger);
        },
      },
      {
        key: "f",
        mod: true,
        allowInInput: true,
        run: () => useViewer.getState().openSearch(),
      },
      {
        key: "o",
        mod: true,
        allowInInput: true,
        run: () => pickPdfFile((file) => void useViewer.getState().openFile(file)),
      },
      {
        key: "s",
        mod: true,
        alt: true,
        allowInInput: true,
        run: () => {
          const viewer = useViewer.getState();
          if (viewer.docHash) void useAssistant.getState().capturePage(viewer.currentPage);
        },
      },
      {
        key: "r",
        mod: true,
        alt: true,
        allowInInput: true,
        run: () => {
          const viewer = useViewer.getState();
          if (viewer.docHash) useAssistant.getState().startRegionCapture(viewer.currentPage);
        },
      },
      {
        key: "q",
        mod: true,
        alt: true,
        allowInInput: true,
        run: () => {
          const selection = useViewer.getState().selection;
          if (selection) useAssistant.getState().addSelection(selection.page, selection.text);
        },
      },
      {
        key: "?",
        run: () => setShortcutsOpen((open) => !open),
      },
      {
        key: "pagedown",
        run: () => {
          const viewer = useViewer.getState();
          if (viewer.numPages) viewer.requestScroll(Math.min(viewer.numPages, viewer.currentPage + 1));
        },
      },
      {
        key: "pageup",
        run: () => {
          const viewer = useViewer.getState();
          if (viewer.numPages) viewer.requestScroll(Math.max(1, viewer.currentPage - 1));
        },
      },
      { key: "+", run: () => useViewer.getState().zoomBy(0.1) },
      { key: "=", run: () => useViewer.getState().zoomBy(0.1) },
      { key: "-", run: () => useViewer.getState().zoomBy(-0.1) },
      { key: "0", run: () => useViewer.getState().resetZoom() },
      { key: "d", shift: true, run: () => useViewer.getState().cycleColorMode() },
    ],
    [],
  );

  useHotkeys(bindings);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (useViewer.getState().regionPage) {
        useViewer.getState().cancelRegion();
        return;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (shortcutsOpen) {
        setShortcutsOpen(false);
        return;
      }
      const viewer = useViewer.getState();
      if (viewer.searchOpen) {
        viewer.closeSearch();
        return;
      }
      if (viewer.selection) {
        viewer.setSelection(null);
        return;
      }
      const assistant = useAssistant.getState();
      if (assistant.clearConfirm) {
        assistant.setClearConfirm(false);
        return;
      }
      if (assistant.status === "open") {
        minimizePanel();
        return;
      }
      if (viewer.sidebar) viewer.toggleSidebar(viewer.sidebar);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, shortcutsOpen]);

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    const pdf = files.find(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdf) {
      await useViewer.getState().openFile(pdf);
    }
    const rest = files.filter((file) => file !== pdf);
    for (const file of rest) {
      const result = await useAssistant.getState().addAttachment(file);
      if (!result.ok) useAssistant.getState().notify(result.message ?? "附件失败", "error");
    }
    if (rest.length) useAssistant.getState().openFrom(document.querySelector("[data-ai-entry]"));
  };

  // Sidebar reserves reading width; floating mode overlays the page.
  // Region capture keeps the reservation while the panel is briefly minimized.
  const reserved = mode === "sidebar" && (status === "open" || regionPage !== null);
  const reserveWidth = Math.min(Math.max(panelPreviewWidth ?? panel.width, 320), 560);
  const reserveStyle = reserved
    ? ({ "--panel-reserve": `${reserveWidth}px` } as CSSProperties)
    : undefined;

  return (
    <div
      className={styles.app}
      data-theme={theme}
      data-color-mode={colorMode}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget === null) setDragging(false);
      }}
      onDrop={(event) => void onDrop(event)}
    >
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenSearch={() => useViewer.getState().openSearch()}
      />
      <div className={styles.body}>
        <Rail
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
        <Sidebar />
        <main className={`${styles.reader} ${reserved ? styles.readerReserved : ""}`} style={reserveStyle}>
          <PdfViewer />
        </main>
      </div>

      <AssistantFab />
      <Suspense fallback={null}>
        <AssistantPanel />
      </Suspense>
      <SelectionToolbar />
      <SearchOverlay />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <OcrDialog />

      {toast ? (
        <div
          className={`${assistantStyles.toast} ${
            toast.tone === "error"
              ? assistantStyles.toastError
              : toast.tone === "success"
                ? assistantStyles.toastSuccess
                : ""
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </div>
      ) : null}

      {dragging ? (
        <div className={styles.dropOverlay}>
          <div className={styles.dropBox}>
            松开以打开 PDF
            <div className={styles.dropHint}>图片或文本会作为对话附件</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
