import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareVersions,
  isPrerelease,
  openPdfDefaultApps,
  pdfAssociationStatus,
  registerPdfAssociation,
  removePdfAssociation,
} from "../../src/lib/update";

describe("update version comparison", () => {
  it("detects newer stable releases", () => {
    expect(compareVersions("0.2.0", "0.2.1")).toBe(true);
    expect(compareVersions("0.2.0", "0.3.0")).toBe(true);
    expect(compareVersions("0.2.0", "1.0.0")).toBe(true);
    expect(compareVersions("0.2.1", "0.2.0")).toBe(false);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(false);
  });

  it("accepts v-prefixed tags and ignores invalid tags", () => {
    expect(compareVersions("0.2.0", "v0.2.1")).toBe(true);
    expect(compareVersions("v0.2.0", "0.2.1")).toBe(true);
    expect(compareVersions("0.2.0", "latest")).toBe(false);
    expect(compareVersions("dev", "0.2.1")).toBe(false);
  });

  it("does not treat an rc build as newer than its release", () => {
    expect(compareVersions("0.2.0-rc.1", "0.2.0")).toBe(true);
    expect(compareVersions("0.2.0", "0.2.0-rc.1")).toBe(false);
    expect(compareVersions("0.2.0-rc.1", "0.2.0-rc.2")).toBe(true);
  });

  it("flags prerelease versions for the about page", () => {
    expect(isPrerelease("0.2.0-rc.1")).toBe(true);
    expect(isPrerelease("0.2.0")).toBe(false);
    expect(isPrerelease("nope")).toBe(false);
  });
});

describe("PDF association bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const status = {
    supported: true,
    registered: true,
    stale: false,
    isDefault: false,
    currentDefault: "MSEdgePDF",
    appName: "纸间",
  };

  it("falls back to unsupported outside the desktop shell", async () => {
    vi.stubGlobal("window", {});
    await expect(pdfAssociationStatus()).resolves.toMatchObject({ supported: false });
    await expect(registerPdfAssociation()).rejects.toThrow("Windows 桌面版");
    await expect(removePdfAssociation()).rejects.toThrow("Windows 桌面版");
    await expect(openPdfDefaultApps()).rejects.toThrow("Windows 桌面版");
  });

  it("delegates register, remove and settings to the bridge", async () => {
    const pdfAssociation = {
      status: vi.fn().mockResolvedValue(status),
      register: vi.fn().mockResolvedValue(status),
      remove: vi.fn().mockResolvedValue({ ...status, registered: false }),
      openSettings: vi.fn().mockResolvedValue(status),
    };
    vi.stubGlobal("window", { paperReader: { pdfAssociation } });

    await expect(pdfAssociationStatus()).resolves.toEqual(status);
    await expect(registerPdfAssociation()).resolves.toEqual(status);
    await expect(removePdfAssociation()).resolves.toMatchObject({ registered: false });
    await expect(openPdfDefaultApps()).resolves.toEqual(status);
    expect(pdfAssociation.register).toHaveBeenCalledOnce();
    expect(pdfAssociation.remove).toHaveBeenCalledOnce();
    expect(pdfAssociation.openSettings).toHaveBeenCalledOnce();
  });
});
