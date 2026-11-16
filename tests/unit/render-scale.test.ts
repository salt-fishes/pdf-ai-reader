import { describe, expect, it } from "vitest";
import {
  MAX_CANVAS_PIXELS,
  MAX_PIXEL_RATIO,
  renderPixelRatio,
} from "../../src/features/viewer/renderRatio";
import { PDF_TO_CSS_UNITS } from "../../src/lib/pdf/units";

describe("renderPixelRatio", () => {
  it("uses the real device pixel ratio on normal pages", () => {
    expect(renderPixelRatio(2, 1064, 1504)).toBe(2);
    expect(renderPixelRatio(3, 1064, 1504)).toBe(3);
  });

  it("never drops below 1x", () => {
    expect(renderPixelRatio(0.8, 800, 1000)).toBe(1);
    expect(renderPixelRatio(Number.NaN, 800, 1000)).toBe(1);
  });

  it("caps extreme DPR values", () => {
    expect(renderPixelRatio(8, 400, 600)).toBe(MAX_PIXEL_RATIO);
  });

  it("walks the ratio down to the canvas pixel budget", () => {
    const width = 2400;
    const height = 3200;
    const ratio = renderPixelRatio(4, width, height);
    expect(ratio).toBeLessThan(4);
    expect(width * ratio * height * ratio).toBeLessThanOrEqual(MAX_CANVAS_PIXELS * 1.01);
  });
});

describe("PDF_TO_CSS_UNITS", () => {
  it("maps 100% to 96dpi like the pdf.js viewer", () => {
    expect(PDF_TO_CSS_UNITS).toBeCloseTo(96 / 72, 10);
    expect(612 * PDF_TO_CSS_UNITS).toBeCloseTo(816, 6);
  });
});

