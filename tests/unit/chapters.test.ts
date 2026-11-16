import { describe, expect, it } from "vitest";
import { chapterRanges } from "../../src/lib/pdf/chapters";

describe("chapterRanges", () => {
  it("maps outline entries to page ranges", () => {
    const ranges = chapterRanges(
      [
        { title: "第一章", page: 1, depth: 0 },
        { title: "1.1", page: 1, depth: 1 },
        { title: "第二章", page: 4, depth: 0 },
        { title: "第三章", page: 9, depth: 0 },
      ],
      12,
    );
    expect(ranges).toEqual([
      { title: "第一章", start: 1, end: 3, depth: 0 },
      { title: "第二章", start: 4, end: 8, depth: 0 },
      { title: "第三章", start: 9, end: 12, depth: 0 },
    ]);
  });

  it("ignores entries without a destination", () => {
    const ranges = chapterRanges(
      [
        { title: "封面", page: null, depth: 0 },
        { title: "正文", page: 2, depth: 0 },
      ],
      5,
    );
    expect(ranges).toEqual([{ title: "正文", start: 2, end: 5, depth: 0 }]);
  });

  it("drops out-of-range destinations", () => {
    expect(chapterRanges([{ title: "越界", page: 99, depth: 0 }], 5)).toEqual([]);
  });
});
