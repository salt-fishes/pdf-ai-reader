import type { IconName } from "../../components/icons/Icon";

export type SettingsSectionId =
  | "appearance"
  | "reading"
  | "model"
  | "conversation"
  | "tools"
  | "ocr"
  | "privacy"
  | "system"
  | "about";

export type SettingsNavGroup = {
  label: string;
  items: Array<{ id: SettingsSectionId; label: string; glyph: IconName }>;
};

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: "个性化",
    items: [
      { id: "appearance", label: "外观", glyph: "theme" },
      { id: "reading", label: "阅读", glyph: "page" },
    ],
  },
  {
    label: "AI",
    items: [
      { id: "model", label: "模型服务", glyph: "globe" },
      { id: "conversation", label: "对话", glyph: "send" },
      { id: "tools", label: "外部工具", glyph: "globe" },
      { id: "ocr", label: "扫描件 OCR", glyph: "search" },
    ],
  },
  {
    label: "系统与数据",
    items: [
      { id: "privacy", label: "数据与隐私", glyph: "lock" },
      { id: "system", label: "系统", glyph: "settings" },
      { id: "about", label: "关于", glyph: "info" },
    ],
  },
];

export const SETTINGS_SECTIONS = SETTINGS_NAV.flatMap((group) => group.items);
