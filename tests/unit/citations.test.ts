import { describe, expect, it } from "vitest";
import {
  countInvalidCitations,
  extractCitations,
  extractCitedPages,
  findQuoteLine,
  mapCitations,
  splitCitations,
} from "../../src/lib/ai/citations";

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

  it("parses line-level quotes in double and single bracket citations", () => {
    const text = "见 [[p.2| 注意力机制 是核心 ]] 与 [p.3|残差连接]。";
    const citations = extractCitations(text);
    expect(citations).toEqual([
      { page: 2, quote: "注意力机制 是核心", raw: "[[p.2| 注意力机制 是核心 ]]" },
      { page: 3, quote: "残差连接", raw: "[p.3|残差连接]" },
    ]);

    const segments = splitCitations(text, new Set([2, 3]));
    expect(segments[1]).toEqual({
      type: "cite",
      page: 2,
      quote: "注意力机制 是核心",
      raw: "[[p.2| 注意力机制 是核心 ]]",
    });
  });

  it("rewrites citations without touching surrounding Markdown", () => {
    const replaced = mapCitations(
      "**结果** 见 [[p.4|原文]]，同页 [p.4]。",
      (citation) => `[p.${citation.page}](cite:${citation.page})`,
    );
    expect(replaced).toBe("**结果** 见 [p.4](cite:4)，同页 [p.4](cite:4)。");
  });

  it("finds the line number of a quote across wraps and extra spaces", () => {
    const text = "第一行\n第二行 有 一个 结论\n第三行";
    expect(findQuoteLine(text, "有一个结论")).toBe(2);
    expect(findQuoteLine(text, "第三行")).toBe(3);
    expect(findQuoteLine(text, "不存在")).toBeNull();
  });
});
