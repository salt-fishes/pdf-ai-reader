import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "../../components/icons/Icon";
import { BrandMark } from "../../components/icons/SparkleIcon";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { ResolvedAppTheme, ResolvedMotion } from "../../lib/appearance";
import { SETTINGS_NAV, SETTINGS_SECTIONS, type SettingsSectionId } from "./settingsNavigation";
import styles from "./SettingsWorkspace.module.css";

const AppearanceSection = lazy(() =>
  import("./sections/AppearanceSection").then((module) => ({ default: module.AppearanceSection })),
);
const ReadingSection = lazy(() =>
  import("./sections/ReadingSection").then((module) => ({ default: module.ReadingSection })),
);
const ModelSection = lazy(() =>
  import("./sections/ModelSection").then((module) => ({ default: module.ModelSection })),
);
const ConversationSection = lazy(() =>
  import("./sections/ConversationSection").then((module) => ({
    default: module.ConversationSection,
  })),
);
const ToolsSection = lazy(() =>
  import("./sections/ToolsSection").then((module) => ({ default: module.ToolsSection })),
);
const OcrSection = lazy(() =>
  import("./sections/OcrSection").then((module) => ({ default: module.OcrSection })),
);
const PrivacySection = lazy(() =>
  import("./sections/PrivacySection").then((module) => ({ default: module.PrivacySection })),
);
const SystemSection = lazy(() =>
  import("./sections/SystemSection").then((module) => ({ default: module.SystemSection })),
);
const AboutSection = lazy(() =>
  import("./sections/AboutSection").then((module) => ({ default: module.AboutSection })),
);

type Props = {
  onClose: () => void;
  onOpenShortcuts: () => void;
  theme: ResolvedAppTheme;
  motion: ResolvedMotion;
};

export function SettingsWorkspace({ onClose, onOpenShortcuts, theme, motion }: Props) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const hadPrivacyDoc = useRef(false);
  const [active, setActive] = useState<SettingsSectionId>("appearance");
  const [privacyDoc, setPrivacyDoc] = useState<string | null>(null);

  useFocusTrap(workspaceRef, true);

  useEffect(() => {
    if (hadPrivacyDoc.current && !privacyDoc) {
      window.requestAnimationFrame(() => {
        navRef.current?.querySelector<HTMLButtonElement>('button[aria-current="page"]')?.focus();
      });
    }
    hadPrivacyDoc.current = Boolean(privacyDoc);
  }, [privacyDoc]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content) content.scrollTop = 0;
  }, [active, privacyDoc]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (privacyDoc) {
        setPrivacyDoc(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, privacyDoc]);

  const selectPage = (id: SettingsSectionId) => {
    setPrivacyDoc(null);
    setActive(id);
  };

  const onNavKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const index = SETTINGS_SECTIONS.findIndex((item) => item.id === active);
    let next = index;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = (index + 1) % SETTINGS_SECTIONS.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = (index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = SETTINGS_SECTIONS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    selectPage(SETTINGS_SECTIONS[next].id);
    const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[next]?.focus();
  };

  const openPrivacyDoc = async () => {
    const module = await import("../../../docs/PRIVACY.md?raw");
    setPrivacyDoc(module.default);
  };

  const renderSection = () => {
    switch (active) {
      case "appearance":
        return <AppearanceSection />;
      case "reading":
        return <ReadingSection onOpenShortcuts={onOpenShortcuts} />;
      case "model":
        return <ModelSection />;
      case "conversation":
        return <ConversationSection />;
      case "tools":
        return <ToolsSection />;
      case "ocr":
        return <OcrSection />;
      case "privacy":
        return <PrivacySection onOpenPrivacyDoc={() => void openPrivacyDoc()} />;
      case "system":
        return <SystemSection />;
      case "about":
        return <AboutSection />;
    }
  };

  return createPortal(
    <div
      ref={workspaceRef}
      className={styles.workspace}
      data-theme={theme}
      data-motion={motion}
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className={styles.panel}>
        <header className={styles.topbar}>
          <div className={styles.titleGroup}>
            <span className={styles.brandGlyph}>
              <BrandMark size={17} />
            </span>
            <span className={styles.brandWord}>文疏</span>
            <span className={styles.titleRule} aria-hidden="true" />
            <span className={styles.topbarTitle}>设置</span>
          </div>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="关闭设置"
            title="关闭设置（Esc）"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className={styles.layout}>
          <nav className={styles.nav} aria-label="设置分类" ref={navRef} onKeyDown={onNavKeyDown}>
            {SETTINGS_NAV.map((group) => (
              <div className={styles.navGroup} key={group.label}>
                <div className={styles.navGroupLabel}>{group.label}</div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    className={`${styles.navButton} ${active === item.id ? styles.navButtonActive : ""}`}
                    onClick={() => selectPage(item.id)}
                    aria-current={active === item.id ? "page" : undefined}
                    title={item.label}
                  >
                    <Icon name={item.glyph} size={17} />
                    <span className={styles.navLabel}>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <main className={styles.content} ref={contentRef}>
            {privacyDoc ? (
              <article className={styles.privacyDoc}>
                <header className={styles.docHeader}>
                  <button
                    className={styles.backButton}
                    onClick={() => setPrivacyDoc(null)}
                    aria-label="返回数据与隐私"
                  >
                    <Icon name="chevronLeft" size={18} />
                    返回
                  </button>
                  <h1>隐私说明</h1>
                </header>
                <div className={styles.docBody}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{privacyDoc}</ReactMarkdown>
                </div>
              </article>
            ) : (
              <div className={styles.pageWrap} key={active}>
                <Suspense
                  fallback={
                    <div className={styles.loading} role="status">
                      正在加载设置…
                    </div>
                  }
                >
                  {renderSection()}
                </Suspense>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>,
    document.body,
  );
}
