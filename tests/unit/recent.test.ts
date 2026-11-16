import { describe, expect, it } from "vitest";
import { fitRecentBudget, type RecentDocumentRecord } from "../../src/lib/storage/db";

function record(hash: string, megabytes: number, updatedAt: number): RecentDocumentRecord {
  return {
    hash,
    name: `${hash}.pdf`,
    pages: 1,
    size: megabytes * 1024 * 1024,
    updatedAt,
    data: new ArrayBuffer(megabytes * 1024 * 1024),
  };
}

describe("recent document cache budget", () => {
  it("keeps cached bytes under the total budget, dropping oldest first", () => {
    const records = [
      record("new", 20, 5),
      record("middle", 20, 4),
      record("old", 20, 3),
      record("older", 20, 2),
    ];
    const fitted = fitRecentBudget(records, 50 * 1024 * 1024);
    expect(fitted[0].data?.byteLength).toBe(20 * 1024 * 1024);
    expect(fitted[1].data?.byteLength).toBe(20 * 1024 * 1024);
    expect(fitted[2].data).toBeUndefined();
    expect(fitted[3].data).toBeUndefined();
    // Metadata is preserved so the document still appears in the recent list.
    expect(fitted[3].name).toBe("older.pdf");
  });

  it("leaves small caches untouched", () => {
    const records = [record("a", 1, 2), record("b", 2, 1)];
    const fitted = fitRecentBudget(records, 64 * 1024 * 1024);
    expect(fitted.every((item) => item.data)).toBe(true);
  });
});
