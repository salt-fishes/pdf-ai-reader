import { afterEach, describe, expect, it, vi } from "vitest";
import { pickPdfFile } from "../../src/lib/openFile";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createInput() {
  const listeners: Record<string, () => void> = {};
  const input = {
    type: "",
    accept: "",
    style: {} as CSSStyleDeclaration,
    files: null as FileList | null,
    addEventListener: vi.fn((event: string, handler: () => void) => {
      listeners[event] = handler;
    }),
    remove: vi.fn(),
    click: vi.fn(),
  };
  return { input, listeners };
}

describe("pickPdfFile", () => {
  it("opens a hidden PDF picker and reports the chosen file", () => {
    const { input, listeners } = createInput();
    const append = vi.fn();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => input),
      body: { append },
    });
    const onFile = vi.fn();

    pickPdfFile(onFile);

    expect(input.type).toBe("file");
    expect(input.accept).toContain("application/pdf");
    expect(input.style.display).toBe("none");
    expect(append).toHaveBeenCalledWith(input);
    expect(input.click).toHaveBeenCalledTimes(1);

    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    input.files = [file] as unknown as FileList;
    listeners.change();
    expect(onFile).toHaveBeenCalledWith(file);
    expect(input.remove).toHaveBeenCalledTimes(1);
  });

  it("removes the input when the picker is cancelled", () => {
    const { input, listeners } = createInput();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => input),
      body: { append: vi.fn() },
    });
    const onFile = vi.fn();

    pickPdfFile(onFile);
    listeners.change();

    expect(onFile).not.toHaveBeenCalled();
    expect(input.remove).toHaveBeenCalledTimes(1);
  });
});
