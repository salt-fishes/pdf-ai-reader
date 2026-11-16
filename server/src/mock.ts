export type ChatMessage = {
  role?: string;
  content?: unknown;
};

const MAX_IMAGES = 4;

function countImages(messages: ChatMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part && typeof part === "object" && (part as { type?: string }).type === "image_url") {
          count += 1;
        }
      }
    }
  }
  return count;
}

export function validateMessages(messages: unknown): ChatMessage[] | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 200) return null;
  for (const message of messages) {
    if (!message || typeof message !== "object") return null;
    const role = (message as ChatMessage).role;
    if (role !== "system" && role !== "user" && role !== "assistant") return null;
  }
  if (countImages(messages as ChatMessage[]) > MAX_IMAGES) return null;
  return messages as ChatMessage[];
}

export function messageText(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) =>
      part && typeof part === "object" && (part as { type?: string }).type === "text"
        ? String((part as { text?: string }).text ?? "")
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

export function mockChat(messages: ChatMessage[]): Response {
  const context = messages.map(messageText).join("\n");
  const pages = [...context.matchAll(/<<<PAGE (\d+)>>>/g)].map((match) => Number(match[1]));
  const uniquePages = [...new Set(pages)];
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const question = messageText(lastUser ?? { role: "user", content: "" })
    .replace(/\s+/g, " ")
    .slice(0, 80);
  const cited = uniquePages.length ? uniquePages.slice(0, 2) : [1];
  const answer = [
    `这是本地 mock 模型对“${question || "当前内容"}”的回答，用来验证流式渲染、引用回跳与 token 计量。`,
    "",
    `根据上下文，第 ${cited[0]} 页给出了主要结论：默认只携带当前页，按需扩展到页码、选中文字和截图。`,
    cited[1] ? `第 ${cited[1]} 页进一步说明了预算与缓存策略。` : "",
    "",
    `> 引用：[[p.${cited[0]}]]${cited[1] ? `、[[p.${cited[1]}]]` : ""}`,
    "",
    "**要点**",
    "",
    "1. 上下文默认折叠成一行，展开后才看到来源与 token 分桶。",
    "2. 引用只对真实出现在上下文中的页码生成按钮。",
    "3. 停止按钮会立刻中断上游流。",
    "4. 行内公式 $a^2+b^2=c^2$ 与行间公式：",
    "",
    "$$\\int_0^1 x^2\\,dx=\\frac{1}{3}$$",
    "",
    "\\[ \\nabla\\cdot\\mathbf{E}=\\frac{\\rho}{\\varepsilon_0} \\]",
    "",
    "这是一段用于测试“展开全文”的补充说明：mock 回答不调用真实模型，不会产生费用；配置 `AI_API_KEY` 并关闭 `MOCK_AI` 后即可使用真实服务。",
  ]
    .filter((line, index, array) => line !== "" || array[index - 1] !== "")
    .join("\n");

  const chunks = answer.match(/[\s\S]{1,14}/g) ?? [answer];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      for (const chunk of chunks) {
        send({ choices: [{ delta: { content: chunk } }] });
        await new Promise((resolve) => setTimeout(resolve, 24));
      }
      send({
        choices: [],
        usage: {
          prompt_tokens: 1480,
          prompt_cache_hit_tokens: 1024,
          prompt_cache_miss_tokens: 456,
          completion_tokens: 186,
          prompt_tokens_details: { image_tokens: 0 },
        },
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
