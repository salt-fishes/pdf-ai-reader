import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep keyboard focus inside a modal while it is open, and restore focus to
 * the trigger when it closes. Escape is optional because some dialogs let the
 * global escape chain handle layered overlays.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
): void {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previous = document.activeElement as HTMLElement | null;

    const focusable = () =>
      [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) =>
          !element.closest("[inert]") &&
          (element.offsetParent !== null || element === document.activeElement),
      );

    const first = focusable()[0];
    // Nested dialogs may restore focus inside this container just before this
    // trap re-activates; do not bounce it back to the first control.
    if (!container.contains(document.activeElement)) (first ?? container).focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (escapeRef.current) {
          event.preventDefault();
          event.stopPropagation();
          escapeRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusable();
      if (!list.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const current = document.activeElement;
      if (!container.contains(current)) {
        // Another dialog owns focus; let its trap handle Tab.
        if (current?.closest?.('[role="dialog"]')) return;
        event.preventDefault();
        (event.shiftKey ? list[list.length - 1] : list[0]).focus();
        return;
      }
      const firstElement = list[0];
      const lastElement = list[list.length - 1];
      if (event.shiftKey) {
        if (current === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else if (current === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    // Listen on document so Tab is still trapped after focus lands on <body>
    // (for example after clicking a scroll container).
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [active, ref]);
}
