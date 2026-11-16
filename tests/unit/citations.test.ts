import { describe, expect, it } from "vitest";
import { countInvalidCitations, extractCitedPages, splitCitations } from "../../src/lib/ai/citations";

describe("splitCitations", () => {
  it("splits double-bracket citations into buttons", () => {
    const segments = splitCitations("结论见 [[p.2]]，另见第 3 页。", new Set([2, 3]));
    expect(segments).toEqual([
      { type: "text", value: "结论见 " },
      { type: "cite", page: 2, raw: "[[p.2]]" },
      { type: "text", value: "，另见第 3 页。" },
    ]);
  });

  it("supports single-bracket fallback", () => {
    const segments = splitCitations("见 [p.5]。", new Set([5]));
    expect(segments[1]).toEqual({ type: "cite", page: 5, raw: "[p.5]" });
  });

  it("keeps hallucinated pages as plain text", () => {
    const segments = splitCitations("见 [[p.9]]。", new Set([2]));
    expect(segments).toEqual([{ type: "text", value: "见 [[p.9]]。" }]);
  });

  it("handles multiple citations and extracts unique pages", () => {
    const text = "[[p.1]] 与 [[p.2]]，再来一次 [[p.1]]。";
    expect(extractCitedPages(text)).toEqual([1, 2]);
    expect(countInvalidCitations(text, new Set([1]))).toBe(1);
  });
});
