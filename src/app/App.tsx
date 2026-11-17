import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { Header } from "./Header";
import { PasswordDialog } from "./PasswordDialog";
import { Rail } from "./Rail";
import { Sidebar } from "./Sidebar";
import { SearchOverlay } from "./SearchOverlay";
import { PdfViewer } from "../features/viewer/PdfViewer";
import { useViewer } from "../features/viewer/useViewerStore";
import { REGION_EVENT, type RegionSelectionDetail } from "../features/viewer/region";
import { AssistantFab } from "../features/assistant/AssistantFab";
import { SelectionToolbar } from "../features/assistant/SelectionToolbar";
import { useAssistant } from "../features/assistant/useAssistantStore";
import { closePanel, minimizePanel } from "../features/assistant/panelControl";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { ShortcutsDialog } from "../features/shortcuts/ShortcutsDialog";
import { useShortcutsStore } from "../features/shortcuts/useShortcutsStore";
import { useHotkeys, type Hotkey } from "../hooks/useHotkeys";
import { pickPdfFile } from "../lib/openFile";
import {
  fileFromDesktopPayload,
  isDesktop,
  markRendererReady,
  onOpenPdf,
  setTitleBarTheme,
  takePendingPdf,
  type DesktopPdfPayload,
} from "../lib/desktop";
import { getColorMode } from "../lib/reading/color";
import { SHORTCUT_ACTIONS, type ShortcutId } from "../lib/shortcuts";
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
  const shortcutBindings = useShortcutsStore((state) => state.bindings);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The assistant chunk is ~500KB. Keep it unmounted until the panel is first
  // opened; once loaded, keep it mounted so close/minimize animations work.
  const [assistantMounted, setAssistantMounted] = useState(
    () => useAssistant.getState().status === "open",
  );

  useEffect(() => {
    if (status === "open") setAssistantMounted(true);
  }, [status]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    setTitleBarTheme(theme === "night");
  }, [theme]);

  // Register the listener before telling main that the renderer is ready; any
  // file that arrives earlier stays in the one-slot pending queue.
  useEffect(() => {
    const openPayload = (payload: DesktopPdfPayload) => {
      void useViewer
        .getState()
        .openFile(fileFromDesktopPayload(payload))
        .catch(() => undefined);
    };
    const unsubscribe = onOpenPdf(openPayload);
    markRendererReady();
    void takePendingPdf().then((payload) => {
      if (payload) openPayload(payload);
    });
    return unsubscribe;
  }, []);

  // Ctrl/⌘ + wheel is reserved for document zoom. Outside the reader there is
  // nothing to scale, so stop Chromium from zooming the whole application UI.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey && !event.defaultPrevented) event.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

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

  const bindings = useMemo<Hotkey[]>(() => {
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

    const runs: Record<ShortcutId, () => void> = {
      "assistant.toggle": toggleAssistant,
      "assistant.close": () => closePanel(),
      "assistant.focus": () => {
        const trigger = document.querySelector<HTMLElement>("[data-ai-entry]");
        useAssistant.getState().openFrom(trigger);
      },
      "assistant.capturePage": () => {
        const viewer = useViewer.getState();
        if (viewer.docHash) void useAssistant.getState().capturePage(viewer.currentPage);
      },
      "assistant.captureRegion": () => {
        const viewer = useViewer.getState();
        if (viewer.docHash) useAssistant.getState().startRegionCapture(viewer.currentPage);
      },
      "assistant.quoteSelection": () => {
        const selection = useViewer.getState().selection;
        if (selection) useAssistant.getState().addSelection(selection.page, selection.text);
      },
      "reader.search": () => useViewer.getState().openSearch(),
      "reader.open": () => pickPdfFile((file) => void useViewer.getState().openFile(file)),
      "reader.nextPage": () => {
        const viewer = useViewer.getState();
        if (viewer.numPages)
          viewer.requestScroll(Math.min(viewer.numPages, viewer.currentPage + 1));
      },
      "reader.prevPage": () => {
        const viewer = useViewer.getState();
        if (viewer.numPages) viewer.requestScroll(Math.max(1, viewer.currentPage - 1));
      },
      "reader.zoomIn": () => useViewer.getState().zoomBy(0.1),
      "reader.zoomOut": () => useViewer.getState().zoomBy(-0.1),
      "reader.zoomReset": () => useViewer.getState().resetZoom(),
      "reader.cycleColor": () => useViewer.getState().cycleColorMode(),
      "app.shortcuts": () => setShortcutsOpen((open) => !open),
    };

    return SHORTCUT_ACTIONS.flatMap((action) =>
      (shortcutBindings[action.id] ?? action.defaults).map((binding) => ({
        key: binding.key,
        mod: binding.mod,
        alt: binding.alt,
        shift: binding.shift,
        allowInInput: action.allowInInput,
        run: runs[action.id],
      })),
    );
  }, [shortcutBindings]);

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
      data-desktop={isDesktop() ? "true" : undefined}
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
        <main
          className={`${styles.reader} ${reserved ? styles.readerReserved : ""}`}
          style={reserveStyle}
        >
          <PdfViewer />
        </main>
      </div>

      <AssistantFab />
      {assistantMounted ? (
        <Suspense fallback={null}>
          <AssistantPanel onOpenSettings={() => setSettingsOpen(true)} />
        </Suspense>
      ) : null}
      <SelectionToolbar />
      <SearchOverlay />

      <PasswordDialog />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenShortcuts={() => {
          setSettingsOpen(false);
          setShortcutsOpen(true);
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

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
