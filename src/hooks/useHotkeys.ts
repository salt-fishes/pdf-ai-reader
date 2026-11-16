import { useEffect } from "react";
import { normalizeShortcutKey } from "../lib/shortcuts";

export type Hotkey = {
  key: string;
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
  allowInInput?: boolean;
  run: () => void;
  when?: () => boolean;
};

function isTyping(): boolean {
  const element = document.activeElement;
  if (!element) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    (element as HTMLElement).isContentEditable
  );
}

export function useHotkeys(bindings: Hotkey[]): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      const mod = event.ctrlKey || event.metaKey;
      const typing = isTyping();
      const key = normalizeShortcutKey(event.key);

      for (const binding of bindings) {
        if (Boolean(binding.mod) !== mod) continue;
        if (Boolean(binding.alt) !== event.altKey) continue;
        if (Boolean(binding.shift) !== event.shiftKey) continue;
        if (normalizeShortcutKey(binding.key) !== key) continue;
        if (!binding.allowInInput && typing) continue;
        if (binding.when && !binding.when()) continue;
        event.preventDefault();
        binding.run();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bindings]);
}
