import { McpTools } from "./McpTools";
import styles from "../SettingsUI.module.css";

export function ToolsSection() {
  return (
    <div className={styles.page} data-settings-section="tools">
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>外部工具</h2>
          <p className={styles.pageDesc}>管理学术检索与 MCP 服务，只有启用的工具会暴露给模型。</p>
        </div>
      </header>
      <McpTools />
    </div>
  );
}
