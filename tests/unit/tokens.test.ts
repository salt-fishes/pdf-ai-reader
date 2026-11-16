import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING,
  EMPTY_USAGE,
  addUsage,
  envelopeHash,
  estimateCost,
  estimateSurface,
  projectTokens,
  usageFromProvider,
  type Anchor,
} from "../../src/lib/tokens/meter";
import { estimateText, formatTokens } from "../../src/lib/tokens/estimate";

describe("estimateText", () => {
  it("uses DeepSeek's CJK ratio, not chars/4", () => {
    expect(estimateText("中文")).toBe(6); // ceil(2 * 0.6) + 4
    expect(estimateText("hello")).toBe(6); // ceil(5 * 0.3) + 4
    expect(estimateText("中文hello")).toBe(7);
  });

  it("counts CJK punctuation as CJK", () => {
    expect(estimateText("你好，世界。")).toBe(8); // ceil(6 * .6) + 4
  });
});

describe("addUsage", () => {
  it("sums every bucket independently", () => {
    expect(
      addUsage(
        { uncachedInput: 10, cacheRead: 2, cacheWrite: 1, output: 3, imageTokens: 4 },
        { uncachedInput: 5, cacheRead: 7, cacheWrite: 0, output: 8, imageTokens: 1 },
      ),
    ).toEqual({
      uncachedInput: 15,
      cacheRead: 9,
      cacheWrite: 1,
      output: 11,
      imageTokens: 5,
    });
  });
});

describe("projectTokens", () => {
  const hash = envelopeHash(["deepseek-flash", "api.deepseek.com", "system"]);
  const anchor: Anchor = {
    envelopeHash: hash,
    promptTokens: 1200,
    surfaceEstimate: 1300,
    usage: { ...EMPTY_USAGE, uncachedInput: 200, cacheRead: 1000, output: 120 },
    at: Date.now(),
  };

  it("reuses the provider usage anchor for small surface deltas", () => {
    expect(projectTokens(anchor, 1350, hash)).toBe(1250);
    expect(projectTokens(anchor, 1200, hash)).toBe(1100);
  });

  it("clamps negative projections at zero", () => {
    expect(projectTokens(anchor, 10, hash)).toBe(0);
  });

  it("does not reuse an anchor from a different envelope", () => {
    const other = envelopeHash(["qwen-vl-max", "api.deepseek.com", "system"]);
    expect(projectTokens(anchor, 900, other)).toBe(900);
  });
});

describe("usageFromProvider", () => {
  it("normalizes DeepSeek cache fields", () => {
    const usage = usageFromProvider({
      prompt_tokens: 1480,
      prompt_cache_hit_tokens: 1024,
      prompt_cache_miss_tokens: 456,
      completion_tokens: 186,
    });
    expect(usage).toEqual({
      uncachedInput: 456,
      cacheRead: 1024,
      cacheWrite: 0,
      output: 186,
      imageTokens: 0,
    });
  });

  it("normalizes OpenAI cached token details", () => {
    const usage = usageFromProvider({
      prompt_tokens: 1000,
      completion_tokens: 80,
      prompt_tokens_details: { cached_tokens: 400, image_tokens: 256 },
    });
    expect(usage).toEqual({
      uncachedInput: 600,
      cacheRead: 400,
      cacheWrite: 0,
      output: 80,
      imageTokens: 256,
    });
  });

  it("returns null for missing usage", () => {
    expect(usageFromProvider(null)).toBeNull();
    expect(usageFromProvider({})).toBeNull();
  });
});

describe("surface + cost helpers", () => {
  it("adds image caps to the surface estimate", () => {
    const surface = estimateSurface({
      system: "abc",
      context: "",
      history: [],
      question: "中文",
      imageCount: 2,
    });
    expect(surface).toBeGreaterThan(2048);
  });

  it("estimates cost from the four buckets", () => {
    const usage = {
      uncachedInput: 1000,
      cacheRead: 1000,
      cacheWrite: 0,
      output: 1000,
      imageTokens: 0,
    };
    const expected =
      (1000 / 1_000_000) * DEFAULT_PRICING.inputMiss +
      (1000 / 1_000_000) * DEFAULT_PRICING.inputHit +
      (1000 / 1_000_000) * DEFAULT_PRICING.output;
    expect(estimateCost(usage)).toBeCloseTo(expected, 10);
  });

  it("formats token counts", () => {
    expect(formatTokens(258)).toBe("258");
    expect(formatTokens(2500)).toBe("2.5k");
    expect(formatTokens(32_000)).toBe("32k");
    expect(formatTokens(1_200_000)).toBe("1.20M");
  });
});
