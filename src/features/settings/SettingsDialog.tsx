import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "../../components/icons/Icon";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { AboutSection } from "./sections/AboutSection";
import { ConversationSection } from "./sections/ConversationSection";
import { ModelSection } from "./sections/ModelSection";
import { OcrSection } from "./sections/OcrSection";
import { PrivacySection } from "./sections/PrivacySection";
import { ReadingSection } from "./sections/ReadingSection";
import styles from "../../components/Modal.module.css";

type Props = { open: boolean; onClose: () => void; onOpenShortcuts: () => void };

type SectionId = "model" | "reading" | "conversation" | "ocr" | "privacy" | "about";

const NAV: ReadonlyArray<{
  id: SectionId;
  label: string;
  glyph: Parameters<typeof Icon>[0]["name"];
}> = [
  { id: "model", label: "模型服务", glyph: "globe" },
  { id: "reading", label: "阅读", glyph: "page" },
  { id: "conversation", label: "对话", glyph: "send" },
  { id: "ocr", label: "扫描件 OCR", glyph: "search" },
  { id: "privacy", label: "隐私与数据", glyph: "lock" },
  { id: "about", label: "关于", glyph: "info" },
];

export function SettingsDialog({ open, onClose, onOpenShortcuts }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [active, setActive] = useState<SectionId>("model");
  const [visited, setVisited] = useState<Set<SectionId>>(() => new Set(["model"]));
  const [privacyDoc, setPrivacyDoc] = useState<string | null>(null);
  const privacyTriggerRef = useRef<HTMLElement | null>(null);
  const hadPrivacyDoc = useRef(false);

  useFocusTrap(cardRef, open && !privacyDoc);
  useFocusTrap(docRef, Boolean(privacyDoc));

  useEffect(() => {
    if (hadPrivacyDoc.current && !privacyDoc) privacyTriggerRef.current?.focus();
    hadPrivacyDoc.current = Boolean(privacyDoc);
  }, [privacyDoc]);

  useLayoutEffect(() => {
    if (!open) return;
    setActive("model");
    setVisited(new Set(["model"]));
    setPrivacyDoc(null);
    const content = contentRef.current;
    if (content) content.scrollTop = 0;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (privacyDoc) {
          setPrivacyDoc(null);
          return;
        }
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, privacyDoc]);

  if (!open) return null;

  const selectPage = (id: SectionId) => {
    setActive(id);
    setVisited((current) => (current.has(id) ? current : new Set([...current, id])));
    const content = contentRef.current;
    if (content) content.scrollTop = 0;
  };

  const onNavKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const index = NAV.findIndex((item) => item.id === active);
    let next = index;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % NAV.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = (index - 1 + NAV.length) % NAV.length;
    } else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = NAV.length - 1;
    else return;
    event.preventDefault();
    selectPage(NAV[next].id);
    const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[next]?.focus();
  };

  const openPrivacyDoc = async () => {
    privacyTriggerRef.current = document.activeElement as HTMLElement | null;
    const module = await import("../../../docs/PRIVACY.md?raw");
    setPrivacyDoc(module.default);
  };

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={cardRef}
        className={`${styles.card} ${styles.settingsCard}`}
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        inert={privacyDoc ? true : undefined}
      >
        <div className={styles.head}>
          <span className={styles.title}>设置</span>
          <span className={styles.headSpacer} />
          <button className={styles.close} onClick={onClose} aria-label="关闭设置">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className={styles.settingsBody}>
          <nav
            className={styles.settingsNav}
            aria-label="设置分类"
            ref={navRef}
            onKeyDown={onNavKeyDown}
          >
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`${styles.settingsNavButton} ${
                  active === item.id ? styles.settingsNavActive : ""
                }`}
                onClick={() => selectPage(item.id)}
                aria-current={active === item.id ? "page" : undefined}
              >
                {active === item.id ? (
                  <i className={styles.settingsNavBar} aria-hidden="true" />
                ) : null}
                <Icon name={item.glyph} size={16} />
                {item.label}
              </button>
            ))}
          </nav>
          <div className={styles.settingsContent} ref={contentRef}>
            <div className={active === "model" ? styles.pageVisible : styles.pageHidden}>
              <ModelSection />
            </div>
            {visited.has("reading") ? (
              <div className={active === "reading" ? styles.pageVisible : styles.pageHidden}>
                <ReadingSection onOpenShortcuts={onOpenShortcuts} />
              </div>
            ) : null}
            {visited.has("conversation") ? (
              <div className={active === "conversation" ? styles.pageVisible : styles.pageHidden}>
                <ConversationSection />
              </div>
            ) : null}
            {visited.has("ocr") ? (
              <div className={active === "ocr" ? styles.pageVisible : styles.pageHidden}>
                <OcrSection />
              </div>
            ) : null}
            {visited.has("privacy") ? (
              <div className={active === "privacy" ? styles.pageVisible : styles.pageHidden}>
                <PrivacySection onOpenPrivacyDoc={() => void openPrivacyDoc()} />
              </div>
            ) : null}
            {visited.has("about") ? (
              <div className={active === "about" ? styles.pageVisible : styles.pageHidden}>
                <AboutSection />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {privacyDoc ? (
        <div
          className={styles.docBackdrop}
          onPointerDown={(event) => event.target === event.currentTarget && setPrivacyDoc(null)}
        >
          <div
            ref={docRef}
            className={styles.docCard}
            role="dialog"
            aria-modal="true"
            aria-label="隐私说明"
          >
            <div className={styles.docHead}>
              <span className={styles.title}>隐私说明</span>
              <span className={styles.headSpacer} />
              <button
                className={styles.close}
                onClick={() => setPrivacyDoc(null)}
                aria-label="关闭隐私说明"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className={styles.docBody}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{privacyDoc}</ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
