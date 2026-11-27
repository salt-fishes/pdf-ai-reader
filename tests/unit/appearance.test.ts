import { describe, expect, it } from "vitest";
import {
  initialAppTheme,
  initialMotion,
  isAppTheme,
  isMotionPreference,
  resolveAppTheme,
  resolveMotion,
} from "../../src/lib/appearance";

describe("appearance preferences", () => {
  it("migrates the old PDF-driven chrome theme", () => {
    expect(initialAppTheme({ colorMode: "smart" })).toBe("night");
    expect(initialAppTheme({ colorMode: "invert" })).toBe("night");
    expect(initialAppTheme({ colorMode: "original" })).toBe("paper");
    expect(initialAppTheme({ theme: "night" })).toBe("night");
  });

  it("prefers an explicit application theme", () => {
    expect(initialAppTheme({ appTheme: "system", colorMode: "smart" })).toBe("system");
    expect(initialAppTheme({ appTheme: "paper", theme: "night" })).toBe("paper");
  });

  it("resolves system theme and motion preferences", () => {
    expect(resolveAppTheme("system", true)).toBe("night");
    expect(resolveAppTheme("system", false)).toBe("paper");
    expect(resolveAppTheme("paper", true)).toBe("paper");
    expect(resolveMotion("standard", false)).toBe("full");
    expect(resolveMotion("standard", true)).toBe("reduced");
    expect(resolveMotion("reduced", false)).toBe("reduced");
    expect(resolveMotion("off", false)).toBe("off");
  });

  it("validates persisted values", () => {
    expect(isAppTheme("system")).toBe(true);
    expect(isAppTheme("dark")).toBe(false);
    expect(isMotionPreference("off")).toBe(true);
    expect(isMotionPreference("none")).toBe(false);
    expect(initialMotion({ motion: "invalid" })).toBe("standard");
  });
});
