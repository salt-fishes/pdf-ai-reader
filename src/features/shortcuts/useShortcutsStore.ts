import { create } from "zustand";
import {
  SHORTCUT_ACTIONS,
  isShortcutBinding,
  type ShortcutBinding,
  type ShortcutId,
} from "../../lib/shortcuts";
import { loadSettings, saveSettings } from "../../lib/storage/db";

type BindingMap = Record<ShortcutId, ShortcutBinding[]>;

type ShortcutsState = {
  bindings: BindingMap;
  setBinding: (id: ShortcutId, bindings: ShortcutBinding[]) => void;
  resetBinding: (id: ShortcutId) => void;
  resetAll: () => void;
};

function copyDefaults(): BindingMap {
  return Object.fromEntries(
    SHORTCUT_ACTIONS.map((action) => [
      action.id,
      action.defaults.map((binding) => ({ ...binding })),
    ]),
  ) as BindingMap;
}

function initialBindings(): BindingMap {
  const defaults = copyDefaults();
  const saved = loadSettings().shortcuts;
  if (!saved) return defaults;
  const result = { ...defaults };
  for (const action of SHORTCUT_ACTIONS) {
    const value = saved[action.id];
    if (Array.isArray(value)) {
      result[action.id] = value.filter(isShortcutBinding).map((binding) => ({ ...binding }));
    }
  }
  return result;
}

function persist(bindings: BindingMap): void {
  saveSettings({ shortcuts: bindings });
}

export const useShortcutsStore = create<ShortcutsState>((set, get) => ({
  bindings: initialBindings(),

  setBinding: (id, bindings) => {
    const next = {
      ...get().bindings,
      [id]: bindings.slice(0, 4).map((binding) => ({ ...binding })),
    };
    set({ bindings: next });
    persist(next);
  },

  resetBinding: (id) => {
    const action = SHORTCUT_ACTIONS.find((item) => item.id === id);
    if (!action) return;
    const next = {
      ...get().bindings,
      [id]: action.defaults.map((binding) => ({ ...binding })),
    };
    set({ bindings: next });
    persist(next);
  },

  resetAll: () => {
    const next = copyDefaults();
    set({ bindings: next });
    persist(next);
  },
}));
