import { Icon } from "../../../components/icons/Icon";
import { useAppearance } from "../../appearance/useAppearanceStore";
import styles from "../SettingsUI.module.css";

const THEMES = [
  { id: "paper", label: "浅色", description: "明亮纸面与深色文字" },
  { id: "night", label: "深色", description: "低亮度界面，适合夜间使用" },
  { id: "system", label: "跟随系统", description: "随 Windows 或浏览器主题变化" },
] as const;

const MOTION = [
  { id: "standard", label: "轻微" },
  { id: "reduced", label: "减少" },
  { id: "off", label: "关闭" },
] as const;

export function AppearanceSection() {
  const theme = useAppearance((state) => state.theme);
  const motion = useAppearance((state) => state.motion);
  const setTheme = useAppearance((state) => state.setTheme);
  const setMotion = useAppearance((state) => state.setMotion);

  return (
    <div className={styles.page} data-settings-section="appearance">
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>外观</h2>
          <p className={styles.pageDesc}>只调整应用界面，不改变当前 PDF 的页面颜色。</p>
        </div>
      </header>

      <section className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="theme" size={16} />
          应用主题
        </div>
        <div className={styles.choiceGrid} role="group" aria-label="应用主题">
          {THEMES.map((item) => (
            <button
              key={item.id}
              className={`${styles.choiceCard} ${theme === item.id ? styles.choiceCardActive : ""}`}
              onClick={() => setTheme(item.id)}
              aria-pressed={theme === item.id}
            >
              <span className={`${styles.themePreview} ${styles[`themePreview${item.id}`]}`}>
                <i />
                <i />
                <i />
              </span>
              <span className={styles.choiceLabel}>{item.label}</span>
              <span className={styles.choiceDesc}>{item.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.groupTitle}>
          <Icon name="retry" size={16} />
          界面动效
        </div>
        <div className={styles.row}>
          <span className={styles.label}>动效强度</span>
          <span className={styles.segmented} role="group" aria-label="动效强度">
            {MOTION.map((item) => (
              <button
                key={item.id}
                className={`${styles.segment} ${motion === item.id ? styles.segmentActive : ""}`}
                onClick={() => setMotion(item.id)}
                aria-pressed={motion === item.id}
              >
                {item.label}
              </button>
            ))}
          </span>
        </div>
        <p className={styles.fieldHint}>
          默认使用轻微过渡；系统开启“减少动态效果”时会自动降低动画。
        </p>
      </section>
    </div>
  );
}
