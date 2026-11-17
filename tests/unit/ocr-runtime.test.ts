import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  OCR_RUNTIME_FORMAT,
  parseChecksum,
  runtimeMarkerAcceptable,
  runtimeRequiredFilesPresent,
  sha256File,
} from "../../server/src/ocrRuntime";

const HASH = "89186c9f8c38d4a978d239af49f9be29e2e96b3b80ae2d38063cf6d34bf42202";

describe("OCR runtime pack checksums", () => {
  it("matches the requested asset and ignores other lines", () => {
    const text = [
      `${HASH}  paper-reader-v0.3.1-win-x64.zip`,
      `${"a".repeat(64)} *paper-reader-ocr-v0.3.1-win-x64.zip`,
      "",
      "not a checksum line",
    ].join("\n");
    expect(parseChecksum(text, "paper-reader-ocr-v0.3.1-win-x64.zip")).toBe("a".repeat(64));
    expect(parseChecksum(text, "paper-reader-v0.3.1-win-x64.zip")).toBe(HASH);
    expect(parseChecksum(text, "missing.zip")).toBeNull();
  });

  it("rejects malformed hashes", () => {
    expect(parseChecksum("deadbeef  model.zip", "model.zip")).toBeNull();
    expect(parseChecksum("", "model.zip")).toBeNull();
  });

  it("hashes a file with sha256", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ocr-runtime-"));
    try {
      const file = path.join(dir, "payload.bin");
      await writeFile(file, "paper reader");
      // sha256("paper reader")
      await expect(sha256File(file)).resolves.toBe(
        "6b3b7c8ed1b7849467991f1f9071320330f2881dc69c579d982f6b6c00750be8",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("OCR runtime marker compatibility", () => {
  it("accepts the current format", () => {
    expect(runtimeMarkerAcceptable({ format: OCR_RUNTIME_FORMAT, packVersion: "0.8.0" })).toBe(
      true,
    );
  });

  it("accepts legacy markers written before the format field existed", () => {
    expect(runtimeMarkerAcceptable({ version: "0.7.3", installedAt: "2026-01-01" })).toBe(true);
  });

  it("rejects a future or unknown format", () => {
    expect(runtimeMarkerAcceptable({ format: OCR_RUNTIME_FORMAT + 1 })).toBe(false);
    expect(runtimeMarkerAcceptable({ format: "1" })).toBe(false);
  });

  it("rejects missing or malformed markers", () => {
    expect(runtimeMarkerAcceptable(null)).toBe(false);
    expect(runtimeMarkerAcceptable({})).toBe(false);
    expect(runtimeMarkerAcceptable({ version: "" })).toBe(false);
    expect(runtimeMarkerAcceptable("0.7.3")).toBe(false);
  });
});

describe("OCR runtime file integrity", () => {
  const packages = [
    ["ppu-paddle-ocr"],
    ["onnxruntime-node"],
    ["@napi-rs", "canvas"],
    ["@techstark", "opencv-js"],
  ];

  it("requires every native dependency before reusing a pack", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ocr-runtime-files-"));
    try {
      for (const parts of packages) {
        const packageDir = path.join(dir, "node_modules", ...parts);
        await mkdir(packageDir, { recursive: true });
        await writeFile(path.join(packageDir, "package.json"), "{}");
      }
      expect(runtimeRequiredFilesPresent(dir)).toBe(true);
      await rm(path.join(dir, "node_modules", ...packages[1]), { recursive: true, force: true });
      expect(runtimeRequiredFilesPresent(dir)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns false for a missing root", () => {
    expect(runtimeRequiredFilesPresent(path.join(tmpdir(), "does-not-exist-ocr-runtime"))).toBe(
      false,
    );
  });
});
