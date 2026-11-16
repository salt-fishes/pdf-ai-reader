export type ShortcutBinding = {
  /** Lower-case `KeyboardEvent.key`, e.g. "j", "pagedown", "?". */
  key: string;
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type ShortcutId =
  | "assistant.toggle"
  | "assistant.close"
  | "assistant.focus"
  | "assistant.capturePage"
  | "assistant.captureRegion"
  | "assistant.quoteSelection"
  | "reader.search"
  | "reader.open"
  | "reader.nextPage"
  | "reader.prevPage"
  | "reader.zoomIn"
  | "reader.zoomOut"
  | "reader.zoomReset"
  | "reader.cycleColor"
  | "app.shortcuts";

export type ShortcutAction = {
  id: ShortcutId;
  group: string;
  label: string;
  /** One action may keep several equivalent default chords. */
  defaults: ShortcutBinding[];
  /** Assistant commands still work while the question box has focus. */
  allowInInput?: boolean;
};

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  {
    id: "assistant.toggle",
    group: "助手",
    label: "打开 / 最小化面板",
    defaults: [{ key: "j", mod: true }],
    allowInInput: true,
  },
  {
    id: "assistant.close",
    group: "助手",
    label: "关闭面板",
    defaults: [{ key: "j", alt: true }],
    allowInInput: true,
  },
  {
    id: "assistant.focus",
    group: "助手",
    label: "打开并聚焦提问框",
    defaults: [{ key: "k", mod: true }],
    allowInInput: true,
  },
  {
    id: "assistant.capturePage",
    group: "助手",
    label: "截取当前页",
    defaults: [{ key: "s", mod: true, alt: true }],
    allowInInput: true,
  },
  {
    id: "assistant.captureRegion",
    group: "助手",
    label: "框选截图",
    defaults: [{ key: "r", mod: true, alt: true }],
    allowInInput: true,
  },
  {
    id: "assistant.quoteSelection",
    group: "助手",
    label: "把选中文字加入上下文",
    defaults: [{ key: "q", mod: true, alt: true }],
    allowInInput: true,
  },
  {
    id: "reader.search",
    group: "阅读",
    label: "全文搜索",
    defaults: [{ key: "f", mod: true }],
    allowInInput: true,
  },
  {
    id: "reader.open",
    group: "全局",
    label: "打开 PDF",
    defaults: [{ key: "o", mod: true }],
    allowInInput: true,
  },
  {
    id: "reader.nextPage",
    group: "阅读",
    label: "下一页",
    defaults: [{ key: "pagedown" }],
  },
  {
    id: "reader.prevPage",
    group: "阅读",
    label: "上一页",
    defaults: [{ key: "pageup" }],
  },
  {
    id: "reader.zoomIn",
    group: "阅读",
    label: "放大",
    defaults: [{ key: "+", shift: true }, { key: "+" }, { key: "=" }, { key: "=", mod: true }],
  },
  {
    id: "reader.zoomOut",
    group: "阅读",
    label: "缩小",
    defaults: [{ key: "-" }, { key: "-", mod: true }],
  },
  {
    id: "reader.zoomReset",
    group: "阅读",
    label: "重置为 100%",
    defaults: [{ key: "0" }],
  },
  {
    id: "reader.cycleColor",
    group: "阅读",
    label: "循环色彩模式",
    defaults: [{ key: "d", shift: true }],
  },
  {
    id: "app.shortcuts",
    group: "全局",
    label: "快捷键面板",
    defaults: [
      { key: "?", shift: true },
      { key: "?", shift: false },
    ],
  },
];

const ACTION_BY_ID = new Map(SHORTCUT_ACTIONS.map((action) => [action.id, action]));

const MODIFIER_KEYS = new Set([
  "Alt",
  "AltGraph",
  "CapsLock",
  "Control",
  "Fn",
  "FnLock",
  "Hyper",
  "Meta",
  "OS",
  "Shift",
  "Super",
  "Symbol",
  "SymbolLock",
]);

const KEY_LABELS: Record<string, string> = {
  space: "Space",
  enter: "Enter",
  escape: "Esc",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pagedown: "PageDown",
  pageup: "PageUp",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

/** Characters whose printed form already implies Shift on common layouts. */
const SHIFTED_SYMBOLS = new Set([
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "+",
  "{",
  "}",
  "|",
  ":",
  '"',
  "<",
  ">",
  "?",
  "~",
]);

export function actionById(id: string): ShortcutAction | null {
  return ACTION_BY_ID.get(id as ShortcutId) ?? null;
}

export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? "");
}

export function normalizeShortcutKey(key: string): string {
  if (key === " ") return "space";
  return key.toLowerCase();
}

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

export function bindingFromKeyboardEvent(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): ShortcutBinding | null {
  if (MODIFIER_KEYS.has(event.key) || event.key === "Process") return null;
  const key = normalizeShortcutKey(event.key);
  if (!key) return null;
  // Escape closes the recorder and Tab must stay usable for focus navigation.
  if (key === "escape" || key === "tab") return null;

  const binding: ShortcutBinding = { key };
  if (event.ctrlKey || event.metaKey) binding.mod = true;
  if (event.altKey) binding.alt = true;
  if (event.shiftKey) binding.shift = true;
  return binding;
}

export function isShortcutBinding(value: unknown): value is ShortcutBinding {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (typeof item.key !== "string" || !item.key || item.key.length > 24) return false;
  for (const flag of ["mod", "alt", "shift"] as const) {
    if (item[flag] !== undefined && typeof item[flag] !== "boolean") return false;
  }
  return true;
}

export function sameShortcut(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    Boolean(a.mod) === Boolean(b.mod) &&
    Boolean(a.alt) === Boolean(b.alt) &&
    Boolean(a.shift) === Boolean(b.shift)
  );
}

export function sameBindingList(a: ShortcutBinding[], b: ShortcutBinding[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((binding, index) => sameShortcut(binding, b[index]));
}

export function bindingParts(binding: ShortcutBinding): string[] {
  const parts: string[] = [];
  if (binding.mod) parts.push(isMacPlatform() ? "⌘" : "Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift && !SHIFTED_SYMBOLS.has(binding.key)) parts.push("Shift");
  const label = KEY_LABELS[binding.key] ?? binding.key;
  parts.push(label.length === 1 ? label.toUpperCase() : label);
  return parts;
}

export function formatBinding(binding: ShortcutBinding): string {
  return bindingParts(binding).join(" + ");
}

export function formatBindings(bindings: ShortcutBinding[]): string {
  return bindings.length ? [...new Set(bindings.map(formatBinding))].join(" / ") : "未设置";
}

export function findShortcutConflict(
  bindings: Record<string, ShortcutBinding[]>,
  actionId: ShortcutId,
  candidate: ShortcutBinding,
): ShortcutAction | null {
  for (const action of SHORTCUT_ACTIONS) {
    if (action.id === actionId) continue;
    const list = bindings[action.id] ?? action.defaults;
    if (list.some((binding) => sameShortcut(binding, candidate))) return action;
  }
  return null;
}
