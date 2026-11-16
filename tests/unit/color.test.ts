import { describe, expect, it } from "vitest";
import {
  clampIntensity,
  colorModeFromTheme,
  COLOR_MODES,
  getColorMode,
  isColorMode,
} from "../../src/lib/reading/color";

describe("color modes", () => {
  it("migrates the legacy reading themes", () => {
    expect(colorModeFromTheme("night")).toBe("smart");
    expect(colorModeFromTheme("eye")).toBe("eye");
    expect(colorModeFromTheme("paper")).toBe("original");
    expect(colorModeFromTheme(undefined)).toBe("original");
  });

  it("keeps chrome and filter definitions for every mode", () => {
    expect(COLOR_MODES.map((mode) => mode.id)).toEqual([
      "original",
      "invert",
      "smart",
      "grayscale",
      "eye",
    ]);
    expect(getColorMode("smart").chrome).toBe("night");
    expect(getColorMode("original").effect.filter).toBeNull();
    expect(getColorMode("grayscale").effect.filter).toContain("grayscale");
    expect(getColorMode("eye").effect.overlay?.blend).toBe("multiply");
  });

  it("clamps the intensity to the supported range", () => {
    expect(clampIntensity(0)).toBe(10);
    expect(clampIntensity(40)).toBe(40);
    expect(clampIntensity(44.6)).toBe(45);
    expect(clampIntensity(140)).toBe(100);
    expect(clampIntensity(Number.NaN)).toBe(100);
  });

  it("rejects unknown persisted values", () => {
    expect(isColorMode("smart")).toBe(true);
    expect(isColorMode("night")).toBe(false);
    expect(isColorMode(null)).toBe(false);
  });
});
