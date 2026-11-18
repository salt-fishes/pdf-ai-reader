import { afterEach, describe, expect, it, vi } from "vitest";
import { copyImage, copyText, downloadDataUrl } from "../../src/lib/clipboard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyText", () => {
  it("uses the async clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to a hidden textarea", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const area = { value: "", style: {}, select: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => area),
      body: { append },
      execCommand: vi.fn(() => true),
    });

    await expect(copyText("hello")).resolves.toBe(true);
    expect(area.value).toBe("hello");
    expect(area.select).toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(area);
    expect(area.remove).toHaveBeenCalled();
  });

  it("returns false when both clipboard paths fail", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({ style: {}, select: vi.fn(), remove: vi.fn() })),
      body: { append: vi.fn() },
      execCommand: vi.fn(() => false),
    });
    await expect(copyText("hello")).resolves.toBe(false);

    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        throw new Error("no document");
      }),
    });
    await expect(copyText("hello")).resolves.toBe(false);
  });
});

describe("copyImage", () => {
  it("returns false without ClipboardItem", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("ClipboardItem", undefined);
    await expect(copyImage("data:image/png;base64,AA==")).resolves.toBe(false);
  });

  it("writes the image blob to the clipboard", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write } });
    class FakeClipboardItem {
      constructor(public items: Record<string, Blob>) {}
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Blob(["x"], { type: "image/png" }))),
    );

    await expect(copyImage("data:image/png;base64,AA==")).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("returns false when the clipboard write fails", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { write: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    class FakeClipboardItem {
      constructor(public items: Record<string, Blob>) {}
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Blob(["x"], { type: "image/png" }))),
    );

    await expect(copyImage("data:image/png;base64,AA==")).resolves.toBe(false);
  });
});

describe("downloadDataUrl", () => {
  it("clicks an anchor with the data URL", () => {
    const link = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", { createElement: vi.fn(() => link) });

    downloadDataUrl("data:text/plain,hi", "note.txt");

    expect(link.href).toBe("data:text/plain,hi");
    expect(link.download).toBe("note.txt");
    expect(link.click).toHaveBeenCalledTimes(1);
  });
});
