import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_PDF_BYTES, pdfArgFrom, readPdfPayload } from "../../electron/pdf-args.mjs";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pdf-args-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("desktop PDF argv parsing", () => {
  it("finds an existing PDF among Electron and Chromium arguments", async () => {
    const file = path.join(dir, "paper.pdf");
    await writeFile(file, "%PDF-1.7");
    const argv = ["PaperReader.exe", "--no-sandbox", "C:\\app\\resources\\app", file];
    expect(pdfArgFrom(argv)).toBe(path.resolve(file));
  });

  it("ignores switches, URLs, missing files and non-PDF paths", () => {
    expect(pdfArgFrom(["--foo", "https://example.com/a.pdf", "missing.pdf", "notes.txt"])).toBe(
      null,
    );
    expect(pdfArgFrom([])).toBe(null);
    expect(pdfArgFrom(null)).toBe(null);
  });

  it("prefers the first valid PDF", async () => {
    const first = path.join(dir, "first.pdf");
    const second = path.join(dir, "second.pdf");
    await writeFile(first, "1");
    await writeFile(second, "2");
    expect(pdfArgFrom([second, first])).toBe(path.resolve(second));
  });
});

describe("desktop PDF payload", () => {
  it("returns the file name and bytes", async () => {
    const file = path.join(dir, "sample.pdf");
    await writeFile(file, "%PDF-1.7\nhello");
    const payload = await readPdfPayload(file);
    expect(payload.name).toBe("sample.pdf");
    expect(Buffer.from(payload.bytes).toString("utf8")).toContain("hello");
  });

  it("rejects non-PDF paths and missing files", async () => {
    const text = path.join(dir, "notes.txt");
    await writeFile(text, "hello");
    await expect(readPdfPayload(text)).rejects.toThrow("只能打开 PDF 文件");
    await expect(readPdfPayload(path.join(dir, "missing.pdf"))).rejects.toThrow("不存在");
  });

  it("keeps a sane IPC size limit", () => {
    expect(MAX_PDF_BYTES).toBe(128 * 1024 * 1024);
  });
});
