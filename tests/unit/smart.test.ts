import { describe, expect, it } from "vitest";
import { selectSmartContext, tokenize } from "../../src/lib/ai/smart";

const filler = "这是一段用于填充长度的普通说明文字，不包含目标关键词。";

function page(pageNumber: number, text: string): { page: number; text: string } {
  return { page: pageNumber, text };
}

describe("tokenize", () => {
  it("uses Chinese bigrams and lowercase ASCII words", () => {
    const terms = tokenize("热传导与 GPT-4o");
    expect(terms).toContain("热传");
    expect(terms).toContain("传导");
    expect(terms).toContain("gpt-4o");
    expect(terms).not.toContain("与");
  });

  it("drops common question words", () => {
    const terms = tokenize("第 2 页说了什么");
    expect(terms).not.toContain("什么");
    expect(terms).not.toContain("页");
  });
});

describe("selectSmartContext", () => {
  const pages = [
    page(1, `光合作用分为光反应与暗反应。${filler.repeat(6)}`),
    page(2, `稳态热传导满足 ∇·(k∇T)=0。${filler.repeat(6)}`),
    page(3, `光照强度与二氧化碳浓度会限制光合作用的速率。${filler.repeat(6)}`),
    page(4, `本章讨论傅里叶变换与频域分析。${filler.repeat(6)}`),
  ];

  it("ranks pages that actually discuss the question", () => {
    const result = selectSmartContext(pages, "光合作用受什么影响？");
    expect(result).not.toBeNull();
    expect(result!.pages).toContain(3);
    expect(result!.pages).not.toContain(2);
    expect(result!.pages).not.toContain(4);
    expect(result!.text).toContain("光照强度");
  });

  it("keeps page markers unique and ordered", () => {
    const result = selectSmartContext(pages, "光合作用", { maxChunks: 6 })!;
    const markers = [...result.text.matchAll(/<<<PAGE (\d+)>>>/g)].map((match) => Number(match[1]));
    expect(new Set(markers).size).toBe(markers.length);
    expect(markers).toEqual([...markers].sort((a, b) => a - b));
    expect(markers).toEqual(result.pages);
  });

  it("honors maxChunks and maxChars", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      page(index + 1, `神经网络训练需要梯度下降。${filler.repeat(8)}`),
    );
    const result = selectSmartContext(many, "神经网络训练", {
      maxChunks: 3,
      maxChars: 1600,
    })!;
    expect(result.chunks).toBeLessThanOrEqual(3);
    expect(result.pages.length).toBeLessThanOrEqual(3);
    expect(result.chars).toBeLessThanOrEqual(1600);
  });

  it("filters shared boilerplate below the score floor", () => {
    const boilerplate = "为了验证分块与排序，本页重复一段中性描述。";
    const corpus = [
      page(1, `${boilerplate}量子纠缠与贝尔不等式。${boilerplate}量子纠缠实验。${boilerplate}`),
      page(2, `${boilerplate}${boilerplate}${boilerplate}${boilerplate}`),
      page(3, `${boilerplate}${boilerplate}${boilerplate}${boilerplate}`),
    ];
    const result = selectSmartContext(corpus, "量子纠缠验证")!;
    expect(result.pages).toEqual([1]);
  });

  it("returns null when nothing matches or the query has no terms", () => {
    expect(selectSmartContext(pages, "量子纠缠与贝尔不等式")).toBeNull();
    expect(selectSmartContext(pages, "的 了 是")).toBeNull();
    expect(selectSmartContext([], "光合作用")).toBeNull();
  });

  it("finds a term deep inside a long page", () => {
    const deep = `${filler.repeat(20)}线粒体是细胞的能量工厂。${filler.repeat(20)}`;
    const result = selectSmartContext([page(9, deep)], "线粒体的作用", {
      chunkSize: 500,
    })!;
    expect(result.pages).toEqual([9]);
    expect(result.text).toContain("线粒体是细胞的能量工厂");
  });
});
