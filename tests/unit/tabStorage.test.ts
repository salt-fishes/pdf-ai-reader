import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfTab } from "../../src/features/tabs/useTabStore";
import { loadTabSnapshot, saveTabSnapshot } from "../../src/features/tabs/tabStorage";

const storage = vi.hoisted(() => new Map<string, string>());

vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

function tab(): PdfTab {
  return {
    id: "tab_1",
    name: "new.pdf",
    pages: 0,
    source: {
      kind: "file",
      file: new File([new Uint8Array([1, 2, 3, 4])], "new.pdf", { type: "application/pdf" }),
      previousHash: "old-hash",
    },
    reading: {
      lastPage: 1,
      scrollTop: 0,
      zoom: 1,
      fitMode: "width",
      colorMode: "original",
      colorIntensity: 100,
    },
    aiMode: "isolated",
    workspaceId: "workspace:tab_1",
    status: "loading",
    loadedOnce: true,
    createdAt: 1,
    lastActivatedAt: 2,
  };
}

describe("tab snapshots", () => {
  beforeEach(() => storage.clear());

  it("does not bind a pending relink file name to the previous document hash", () => {
    saveTabSnapshot([tab()], "tab_1");
    const snapshot = loadTabSnapshot();
    expect(snapshot?.tabs[0].source).toEqual({
      kind: "relink",
      name: "new.pdf",
      previousHash: "old-hash",
    });
    expect(snapshot?.tabs[0].docHash).toBeUndefined();
  });
});
