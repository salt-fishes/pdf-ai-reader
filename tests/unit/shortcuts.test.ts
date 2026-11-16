import { describe, expect, it } from "vitest";
import {
  SHORTCUT_ACTIONS,
  bindingFromKeyboardEvent,
  bindingParts,
  findShortcutConflict,
  formatBinding,
  sameShortcut,
  type ShortcutBinding,
} from "../../src/lib/shortcuts";

const event = (
  key: string,
  flags: Partial<Record<"ctrl" | "meta" | "alt" | "shift", boolean>> = {},
) => ({
  key,
  ctrlKey: Boolean(flags.ctrl),
  metaKey: Boolean(flags.meta),
  altKey: Boolean(flags.alt),
  shiftKey: Boolean(flags.shift),
});

describe("shortcut definitions", () => {
  it("keeps every action id unique", () => {
    const ids = SHORTCUT_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not assign the same default chord to two actions", () => {
    const seen: ShortcutBinding[] = [];
    for (const action of SHORTCUT_ACTIONS) {
      for (const binding of action.defaults) {
        expect(seen.some((item) => sameShortcut(item, binding))).toBe(false);
        seen.push(binding);
      }
    }
  });
});

describe("bindingFromKeyboardEvent", () => {
  it("normalizes letters and modifier flags", () => {
    expect(bindingFromKeyboardEvent(event("J", { ctrl: true }))).toEqual({
      key: "j",
      mod: true,
    });
    expect(bindingFromKeyboardEvent(event("PageDown"))).toEqual({ key: "pagedown" });
    expect(bindingFromKeyboardEvent(event(" ", { alt: true }))).toEqual({
      key: "space",
      alt: true,
    });
  });

  it("keeps shifted symbols as a single visible key", () => {
    expect(bindingFromKeyboardEvent(event("?", { shift: true }))).toEqual({
      key: "?",
      shift: true,
    });
    expect(bindingParts({ key: "?", shift: true })).toEqual(["?"]);
  });

  it("ignores modifiers and reserved keys", () => {
    expect(bindingFromKeyboardEvent(event("Control", { ctrl: true }))).toBeNull();
    expect(bindingFromKeyboardEvent(event("Escape"))).toBeNull();
    expect(bindingFromKeyboardEvent(event("Tab"))).toBeNull();
  });
});

describe("formatting and conflicts", () => {
  it("formats chords for display", () => {
    expect(formatBinding({ key: "j", mod: true })).toBe("Ctrl + J");
    expect(formatBinding({ key: "pagedown" })).toBe("PageDown");
    expect(formatBinding({ key: "+", shift: true })).toBe("+");
    expect(formatBinding({ key: "d", shift: true })).toBe("Shift + D");
  });

  it("detects a chord owned by another action", () => {
    const bindings = Object.fromEntries(
      SHORTCUT_ACTIONS.map((action) => [action.id, action.defaults]),
    );
    const conflict = findShortcutConflict(bindings, "reader.search", {
      key: "j",
      mod: true,
    });
    expect(conflict?.id).toBe("assistant.toggle");
    expect(findShortcutConflict(bindings, "reader.search", { key: "f", mod: true })).toBeNull();
  });
});
