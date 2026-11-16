import type { CSSProperties } from "react";
import { Icon } from "../../components/icons/Icon";
import {
  COLOR_INTENSITY_MAX,
  COLOR_INTENSITY_MIN,
  COLOR_MODES,
  getColorMode,
  type ColorMode,
} from "../../lib/reading/color";
import { useViewer } from "./useViewerStore";
import styles from "./ColorModeControl.module.css";

type Props = {
  className?: string;
};

export function ColorModeControl({ className }: Props) {
  const colorMode = useViewer((state) => state.colorMode);
  const colorIntensity = useViewer((state) => state.colorIntensity);
  const setColorMode = useViewer((state) => state.setColorMode);
  const setColorIntensity = useViewer((state) => state.setColorIntensity);
  const active = getColorMode(colorMode);
  const disabled = colorMode === "original";
  const fill = `${((colorIntensity - COLOR_INTENSITY_MIN) / (COLOR_INTENSITY_MAX - COLOR_INTENSITY_MIN)) * 100}%`;
  const imageFilter = (id: ColorMode) => {
    if (id === "invert") return "invert(1)";
    if (id === "grayscale") return "grayscale(1)";
    if (id === "smart") return "brightness(0.86) saturate(0.95)";
    if (id === "eye") return "sepia(0.18) brightness(0.97)";
    return undefined;
  };

  return (
    <div className={`${styles.root} ${className ?? ""}`}>
      <div className={styles.modes} role="group" aria-label="色彩模式">
        {COLOR_MODES.map((mode) => {
          const selected = mode.id === colorMode;
          const overlay = mode.effect.overlay;
          return (
            <button
              key={mode.id}
              className={`${styles.mode} ${selected ? styles.modeActive : ""}`}
              onClick={() => setColorMode(mode.id)}
              aria-pressed={selected}
              aria-label={mode.label}
              title={mode.hint}
            >
              <span className={styles.preview} aria-hidden="true">
                <span
                  className={styles.previewPage}
                  style={{ filter: mode.effect.filter ?? undefined }}
                >
                  <span className={styles.previewLines}>
                    <i className={styles.previewLine} style={{ width: "74%" }} />
                    <i className={styles.previewLine} style={{ width: "58%" }} />
                    <i className={styles.previewLine} style={{ width: "66%" }} />
                    <i className={styles.previewLine} style={{ width: "42%" }} />
                  </span>
                </span>
                <i className={styles.previewImage} style={{ filter: imageFilter(mode.id) }} />
                {overlay ? (
                  <i
                    className={styles.previewTint}
                    style={{
                      background: overlay.color,
                      opacity: overlay.alpha,
                      mixBlendMode: overlay.blend as CSSProperties["mixBlendMode"],
                    }}
                  />
                ) : null}
                {selected ? (
                  <span className={styles.check}>
                    <Icon name="check" size={14} />
                  </span>
                ) : null}
              </span>
              <span className={styles.label}>{mode.label}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.strength}>
        <div className={styles.strengthHead}>
          <span className={styles.strengthLabel}>强度</span>
          <span className={styles.strengthValue}>{disabled ? "—" : `${colorIntensity}%`}</span>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={COLOR_INTENSITY_MIN}
          max={COLOR_INTENSITY_MAX}
          step={5}
          value={colorIntensity}
          disabled={disabled}
          onChange={(event) => setColorIntensity(Number(event.target.value))}
          aria-label="色彩强度"
          aria-valuetext={disabled ? "原色模式不使用强度" : `${colorIntensity}%`}
          style={{ "--fill": fill } as CSSProperties}
        />
        <div className={styles.scale} aria-hidden="true">
          <span>柔和</span>
          <span>强烈</span>
        </div>
        <div className={styles.hint}>{active.hint}</div>
      </div>
    </div>
  );
}
