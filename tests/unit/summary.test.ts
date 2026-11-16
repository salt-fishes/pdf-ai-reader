import { describe, expect, it } from "vitest";
import {
  SUMMARY_REDUCE_CHARS,
  joinSectionSummaries,
  reduceBatches,
  summaryFinalQuestion,
} from "../../src/lib/ai/summary";

describe("reduceBatches", () => {
  it("groups section summaries under the character budget", () => {
    const a = "a".repeat(SUMMARY_REDUCE_CHARS - 10);
    const b = "b".repeat(20);
    const c = "c".repeat(20);
    const batches = reduceBatches([a, b, c]);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toEqual([a]);
    expect(batches[1]).toEqual([b, c]);
  });

  it("keeps a single summary and drops empty sections", () => {
    expect(reduceBatches(["one", "", "  "])).toEqual([["one"]]);
    expect(reduceBatches([])).toEqual([]);
  });

  it("numbers sections in the final prompt material", () => {
    expect(joinSectionSummaries(["甲", "乙"])).toContain("## 分段 1\n甲");
    expect(joinSectionSummaries(["甲", "乙"])).toContain("## 分段 2\n乙");
  });
});

describe("summaryFinalQuestion", () => {
  it("mentions page count, section count and citation format", () => {
    const question = summaryFinalQuestion(100, 5);
    expect(question).toContain("100 页");
    expect(question).toContain("5 段");
    expect(question).toContain("[[p.n]]");
  });
});
