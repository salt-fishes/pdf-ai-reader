import { describe, expect, it } from "vitest";
import { buildRequest, SYSTEM_PROMPT, SYSTEM_PROMPT_DOCUMENT } from "../../src/lib/ai/prompt";
import type { ChatMessage, ContextState } from "../../src/lib/ai/types";

const context: ContextState = {
  currentPage: 2,
  currentPageText: "当前页正文：默认只带当前页。",
  pageRange: [3, 4],
  pageRangeText: "<<<PAGE 3>>>\n第三页正文\n\n<<<PAGE 4>>>\n第四页正文",
  selection: { page: 2, text: "被选中的一句话" },
  screenshots: [
    {
      id: "s1",
      page: 2,
      dataUrl: "data:image/jpeg;base64,AAAA",
      width: 600,
      height: 800,
      label: "P2 截图",
    },
  ],
  attachments: [
    {
      id: "a1",
      name: "notes.txt",
      mime: "text/plain",
      size: 12,
      text: "附件正文",
      kind: "text",
      chars: 4,
    },
  ],
  quotes: [
    {
      id: "q1",
      messageId: "m0",
      role: "assistant",
      text: "上一轮被引用的回答",
    },
  ],
};

const history: ChatMessage[] = [
  {
    id: "u1",
    role: "user",
    content: "第一个问题",
    status: "done",
    createdAt: 1,
  },
  {
    id: "a1",
    role: "assistant",
    content: "第一个回答",
    status: "done",
    createdAt: 2,
  },
  {
    id: "a2",
    role: "assistant",
    content: "这条被移除了",
    status: "done",
    createdAt: 3,
    excluded: true,
  },
];

describe("buildRequest", () => {
  const request = buildRequest({
    docName: "示例.pdf",
    totalPages: 10,
    context,
    history,
    question: "这篇文档讲了什么？",
  });

  it("puts a stable system prompt first", () => {
    expect(request.system).toBe(SYSTEM_PROMPT);
    expect(request.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
  });

  it("wraps page text, selection, quotes and files in one context message", () => {
    const contextMessage = request.messages[1];
    expect(contextMessage.role).toBe("user");
    const content = String(contextMessage.content);
    expect(content).toContain("<context>");
    expect(content).toContain('title="示例.pdf"');
    expect(content).toContain("<<<PAGE 3>>>");
    expect(content).toContain("第三页正文");
    expect(content).toContain("<<<PAGE 2>>>");
    expect(content).toContain("被选中的一句话");
    expect(content).toContain("上一轮被引用的回答");
    expect(content).toContain("附件正文");
    expect(content).toContain("当前页正文");
  });

  it("does not duplicate the current page when it is inside the range", () => {
    const overlapping = buildRequest({
      docName: "示例.pdf",
      totalPages: 10,
      context: { ...context, currentPage: 3, currentPageText: "<<<PAGE 3>>>\n重复的第三页" },
      history: [],
      question: "第三页说了什么？",
    });
    const content = String(overlapping.messages[1].content);
    expect(content).not.toContain("重复的第三页");
    expect(content.match(/<<<PAGE 3>>>/g)).toHaveLength(1);
  });

  it("filters excluded messages out of history", () => {
    const historyText = request.historyText.join("\n");
    expect(historyText).toContain("第一个问题");
    expect(historyText).not.toContain("这条被移除了");
  });

  it("attaches screenshots to the current user message, not assistant history", () => {
    const last = request.messages[request.messages.length - 1];
    expect(last.role).toBe("user");
    expect(Array.isArray(last.content)).toBe(true);
    const parts = last.content as Array<{ type: string; text?: string }>;
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toContain("这篇文档讲了什么？");
    expect(parts[0].text).toContain("第 2 页截图");
    expect(parts.some((part) => part.type === "image_url")).toBe(true);
    expect(request.imageCount).toBe(1);
  });

  it("allows citations only for context pages", () => {
    expect(request.allowedPages).toEqual([2, 3, 4]);
  });

  it("switches to the strict prompt in document-only mode", () => {
    const strict = buildRequest({
      docName: "示例.pdf",
      totalPages: 10,
      context,
      history: [],
      question: "文档之外的内容呢？",
      documentOnly: true,
    });
    expect(strict.system).toBe(SYSTEM_PROMPT_DOCUMENT);
    expect(strict.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT_DOCUMENT });
    expect(String(strict.messages[strict.messages.length - 1].content)).not.toContain(
      "请只依据上下文回答",
    );
  });

  it("does not prefix history with role labels", () => {
    const content = String(request.messages[2].content);
    expect(content).toBe("第一个问题");
    expect(request.historyText[0]).toBe("第一个问题");
    expect(request.historyText[1]).toBe("第一个回答");
  });

  it("labels OCR selections and warns the model about recognition errors", () => {
    const ocrRequest = buildRequest({
      docName: "扫描件.pdf",
      totalPages: 10,
      context: {
        ...context,
        selection: {
          page: 2,
          text: "识别出的一句话",
          source: "ocr",
          pages: [{ page: 2, text: "识别出的一句话", source: "ocr" }],
        },
      },
      history: [],
      question: "这句话什么意思？",
    });
    const content = String(ocrRequest.messages[1].content);
    expect(content).toContain('<selection source="ocr">');
    expect(content).toContain('<page n="2" source="ocr">');
    expect(content).toContain("<ocr_note>");
    expect(content).toContain("以页面图像为准");
  });
});

describe("buildRequest with smart excerpts", () => {
  const smart = {
    pages: [5, 7],
    text: "<<<PAGE 5>>>\n第五页的相关段落\n\n<<<PAGE 7>>>\n第七页的相关段落",
    chunks: 2,
    chars: 24,
    scannedPages: 40,
    totalPages: 40,
    query: "热传导",
  };

  it("wraps BM25 excerpts and lets their pages be cited", () => {
    const request = buildRequest({
      docName: "长文档.pdf",
      totalPages: 40,
      context: { ...context, pageRange: null, pageRangeText: "", smart },
      history: [],
      question: "热传导的边界条件是什么？",
    });
    const content = String(request.messages[1].content);
    expect(content).toContain('<excerpts mode="bm25"');
    expect(content).toContain('query="热传导"');
    expect(content).toContain("<<<PAGE 5>>>");
    expect(request.allowedPages).toEqual([2, 5, 7]);
  });

  it("does not repeat the current page when it is already an excerpt", () => {
    const request = buildRequest({
      docName: "长文档.pdf",
      totalPages: 40,
      context: {
        ...context,
        currentPage: 5,
        currentPageText: "当前页的完整正文不应重复进入 prompt",
        pageRange: null,
        pageRangeText: "",
        smart,
      },
      history: [],
      question: "第五页说了什么？",
    });
    const content = String(request.messages[1].content);
    expect(content).not.toContain("当前页的完整正文");
    expect(content.match(/<<<PAGE 5>>>/g)).toHaveLength(1);
  });
});
