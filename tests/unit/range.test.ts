import { describe, expect, it } from "vitest";
import { formatPageList, parsePageRange } from "../../src/lib/pdf/range";

describe("parsePageRange", () => {
  it("parses a single page", () => {
    expect(parsePageRange("3", 10)).toEqual([3]);
  });

  it("parses ranges with different dashes", () => {
    expect(parsePageRange("3-7", 10)).toEqual([3, 4, 5, 6, 7]);
    expect(parsePageRange("3–5", 10)).toEqual([3, 4, 5]);
    expect(parsePageRange("3~4", 10)).toEqual([3, 4]);
  });

  it("parses mixed lists and dedupes", () => {
    expect(parsePageRange("2,5,9-12,9", 20)).toEqual([2, 5, 9, 10, 11, 12]);
    expect(parsePageRange("1，2、3", 5)).toEqual([1, 2, 3]);
  });

  it("rejects invalid input", () => {
    expect(parsePageRange("", 10)).toBeNull();
    expect(parsePageRange("0", 10)).toBeNull();
    expect(parsePageRange("5-2", 10)).toBeNull();
    expect(parsePageRange("11", 10)).toBeNull();
    expect(parsePageRange("2-a", 10)).toBeNull();
    expect(parsePageRange("-3", 10)).toBeNull();
  });

  it("formats contiguous and sparse page lists", () => {
    expect(formatPageList([2])).toBe("第 2 页");
    expect(formatPageList([2, 3, 4])).toBe("第 2–4 页");
    expect(formatPageList([2, 5, 9])).toBe("第 2, 5, 9 页");
  });
});
