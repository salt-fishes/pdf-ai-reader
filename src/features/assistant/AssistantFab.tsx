import { SparkleIcon } from "../../components/icons/SparkleIcon";
import { useViewer } from "../viewer/useViewerStore";
import { useAssistant, useContextCount } from "./useAssistantStore";
import styles from "./Assistant.module.css";

export function AssistantFab() {
  const hasDoc = useViewer((state) => Boolean(state.docHash));
  const status = useAssistant((state) => state.status);
  const streaming = useAssistant((state) => Boolean(state.streamingId));
  const error = useAssistant((state) => state.error);
  const openFrom = useAssistant((state) => state.openFrom);
  const count = useContextCount();

  if (!hasDoc || status !== "minimized") return null;

  return (
    <button
      className={styles.fab}
      data-assistant-fab
      aria-label="打开 AI 阅读助手"
      title="AI 阅读助手（Ctrl+J）"
      onClick={(event) => openFrom(event.currentTarget)}
    >
      <span
        className={`${styles.glow} ${streaming ? styles.glowBusy : ""} ${error ? styles.glowError : ""}`}
        aria-hidden="true"
      />
      <span className={styles.fabIcon}>
        <SparkleIcon size={23} />
      </span>
      {count > 0 || error ? (
        <span className={`${styles.badge} ${error ? styles.badgeError : ""}`} aria-hidden="true">
          {error ? "!" : count > 9 ? "9+" : count}
        </span>
      ) : null}
    </button>
  );
}
