export type ColorMode = "original" | "invert" | "smart" | "grayscale" | "eye";

export type ChromeTheme = "paper" | "eye" | "night";

export type ColorEffect = {
  filter: string | null;
  overlay?: {
    color: string;
    blend: "multiply" | "screen";
    /** Opacity of the overlay at 100% intensity. */
    alpha: number;
  };
};

export type ColorModeMeta = {
  id: ColorMode;
  label: string;
  hint: string;
  effect: ColorEffect;
  chrome: ChromeTheme;
};

export const COLOR_MODES: ColorModeMeta[] = [
  {
    id: "original",
    label: "原色",
    hint: "完全保留 PDF 的原始配色",
    effect: { filter: null },
    chrome: "paper",
  },
  {
    id: "invert",
    label: "反转",
    hint: "逐通道取反，适合纯文字页",
    effect: { filter: "invert(1)" },
    chrome: "night",
  },
  {
    id: "smart",
    label: "智能暗色",
    hint: "自动识别深色区域，纸面转暗、文字提亮",
    effect: {
      filter: "invert(1) hue-rotate(180deg) brightness(1.06) contrast(0.9) saturate(0.88)",
    },
    chrome: "night",
  },
  {
    id: "grayscale",
    label: "灰度",
    hint: "去掉颜色，只保留明暗层次",
    effect: { filter: "grayscale(1) contrast(1.02)" },
    chrome: "paper",
  },
  {
    id: "eye",
    label: "护眼",
    hint: "暖米色纸面，降低蓝光与刺眼感",
    effect: {
      filter: "saturate(0.92) contrast(0.98)",
      overlay: { color: "#f3e7c8", blend: "multiply", alpha: 0.72 },
    },
    chrome: "paper",
  },
];

export function getColorMode(id: ColorMode): ColorModeMeta {
  return COLOR_MODES.find((mode) => mode.id === id) ?? COLOR_MODES[0];
}

export function colorModeFromTheme(theme?: string): ColorMode {
  if (theme === "night") return "smart";
  if (theme === "eye") return "eye";
  return "original";
}

export function isColorMode(value: unknown): value is ColorMode {
  return COLOR_MODES.some((mode) => mode.id === value);
}

export const COLOR_INTENSITY_MIN = 10;
export const COLOR_INTENSITY_MAX = 100;

export function clampIntensity(value: number): number {
  if (!Number.isFinite(value)) return COLOR_INTENSITY_MAX;
  return Math.min(COLOR_INTENSITY_MAX, Math.max(COLOR_INTENSITY_MIN, Math.round(value)));
}
