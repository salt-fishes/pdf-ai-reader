import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadText, safeFileName } from "../../src/lib/download";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("safeFileName", () => {
  it("strips the final extension and illegal characters", () => {
    expect(safeFileName("report.final.pdf")).toBe("report.final");
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j.txt')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("collapses whitespace and trims", () => {
    expect(safeFileName("  a   b  ")).toBe("a b");
  });

  it("truncates long names and falls back when empty", () => {
    expect(safeFileName("a".repeat(100))).toHaveLength(80);
    expect(safeFileName(".pdf")).toBe("document");
    expect(safeFileName(".pdf", "file")).toBe("file");
  });
});

describe("downloadText", () => {
  it("clicks a temporary anchor and revokes the object URL", () => {
    vi.useFakeTimers();
    const anchor = {
      href: "",
      download: "",
      rel: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    });
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    downloadText("notes.md", "hello", "text/markdown");

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.href).toBe("blob:mock");
    expect(anchor.download).toBe("notes.md");
    expect(anchor.rel).toBe("noopener");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
