import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, unknown>());

vi.mock("idb-keyval", () => ({
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
  del: async (key: string) => {
    memory.delete(key);
  },
  clear: async () => {
    memory.clear();
  },
}));

import {
  loadRecentBytes,
  loadRecentDocuments,
  recordRecentDocument,
} from "../../src/lib/storage/db";

function recent(hash: string, updatedAt: number) {
  return {
    hash,
    name: `${hash}.pdf`,
    pages: 1,
    size: 4,
    updatedAt,
    data: new Uint8Array([1, 2, 3, 4]).buffer,
  };
}

describe("recent document writes", () => {
  beforeEach(() => memory.clear());

  it("serializes concurrent updates without losing metadata or cached bytes", async () => {
    await Promise.all([recordRecentDocument(recent("a", 2)), recordRecentDocument(recent("b", 1))]);

    const records = await loadRecentDocuments();
    expect(records.map((record) => record.hash)).toEqual(["a", "b"]);
    expect((await loadRecentBytes("a"))?.data?.byteLength).toBe(4);
    expect((await loadRecentBytes("b"))?.data?.byteLength).toBe(4);
  });
});
