import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  fileKind,
  formatBytes,
  readTextFile,
} from "../../src/lib/files";

describe("formatBytes", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });
});

describe("fileKind", () => {
  it("recognizes PDFs by MIME type or extension", () => {
    expect(fileKind(new File(["x"], "a.bin", { type: "application/pdf" }))).toBe("pdf");
    expect(fileKind(new File(["x"], "a.PDF", { type: "" }))).toBe("pdf");
  });

  it("recognizes images and text", () => {
    expect(fileKind(new File(["x"], "a.png", { type: "image/png" }))).toBe("image");
    expect(fileKind(new File(["x"], "a.txt", { type: "text/plain" }))).toBe("text");
    expect(fileKind(new File(["x"], "notes.md", { type: "" }))).toBe("text");
    expect(fileKind(new File(["x"], "data.json", { type: "" }))).toBe("text");
  });

  it("rejects unsupported files", () => {
    expect(fileKind(new File(["x"], "a.bin", { type: "application/octet-stream" }))).toBeNull();
    expect(fileKind(new File(["x"], "a.docx", { type: "" }))).toBeNull();
  });
});

describe("limits", () => {
  it("keeps the documented attachment limits", () => {
    expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_ATTACHMENTS).toBe(5);
  });

  it("reads text files", async () => {
    await expect(readTextFile(new File(["hello"], "a.txt", { type: "text/plain" }))).resolves.toBe(
      "hello",
    );
  });
});
