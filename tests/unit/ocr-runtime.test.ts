import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChecksum, sha256File } from "../../server/src/ocrRuntime";

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
