import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repairOcrRuntime } = vi.hoisted(() => ({
  repairOcrRuntime: vi.fn(async () => undefined),
}));

vi.mock("../../server/src/ocr", () => ({
  customOcrSource: vi.fn(() => null),
  installModels: vi.fn(async () => undefined),
  isOcrModelId: vi.fn(() => false),
  normalizeOcrSourceUrl: vi.fn((value: string) => value),
  ocrSourceInfo: vi.fn(() => ({})),
  ocrStatus: vi.fn(async () => ({ runtime: { installed: true } })),
  recognizeImage: vi.fn(),
  repairOcrRuntime,
  resetOcrSource: vi.fn(async () => undefined),
  saveOcrSource: vi.fn(async () => undefined),
  setActiveOcrModel: vi.fn(),
  testOcrSource: vi.fn(),
}));

import { registerOcrRoutes } from "../../server/src/routes/ocr";

describe("OCR runtime repair route", () => {
  beforeEach(() => {
    repairOcrRuntime.mockClear();
  });

  it("starts the explicit repair job and returns 202", async () => {
    const app = new Hono();
    registerOcrRoutes(app);
    const response = await app.request("/api/ocr/repair", { method: "POST" });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(repairOcrRuntime).toHaveBeenCalledTimes(1);
  });
});
