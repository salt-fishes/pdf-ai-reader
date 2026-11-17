import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentChat, type AgentEvent } from "../../server/src/mcp/agent";
import { toOpenAiTools } from "../../server/src/mcp/openai";
import { sciverseTools } from "../../server/src/mcp/sciverse";
import type { Toolset } from "../../server/src/mcp/types";

function sse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function data(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toOpenAiTools", () => {
  it("maps tool definitions to OpenAI function schemas", () => {
    const tools = toOpenAiTools([
      {
        name: "demo_tool",
        label: "演示",
        description: "demo",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
        execute: async () => ({ text: "ok" }),
      },
    ]);
    expect(tools).toEqual([
      {
        type: "function",
        function: {
          name: "demo_tool",
          description: "demo",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      },
    ]);
  });
});

describe("sciverseTools", () => {
  it("is disabled without an enabled skill and token", () => {
    expect(sciverseTools({ enabled: false, token: "sv-x", prompt: "" })).toEqual([]);
    expect(sciverseTools({ enabled: true, token: "", prompt: "" })).toEqual([]);
  });

  it("exposes the three read-only research tools", () => {
    const tools = sciverseTools({ enabled: true, token: "sv-x", prompt: "" });
    expect(tools.map((tool) => tool.name)).toEqual([
      "sciverse_semantic_search",
      "sciverse_read_content",
      "sciverse_paper_relations",
    ]);
  });
});

describe("runAgentChat", () => {
  it("executes a tool, appends the tool result, and streams the final answer", async () => {
    const bodies: Array<{
      messages: Array<{ role: string; content?: unknown; tool_calls?: unknown }>;
      tools?: Array<{ function: { name: string } }>;
      tool_choice?: string;
    }> = [];
    const responses = [
      sse([
        data({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    function: { name: "demo_tool", arguments: '{"query":' },
                  },
                ],
              },
            },
          ],
        }),
        data({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: '"test"}' } }],
              },
            },
          ],
        }),
        "data: [DONE]\n\n",
      ]),
      sse([data({ choices: [{ delta: { content: "最终答案" } }] }), "data: [DONE]\n\n"]),
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as (typeof bodies)[number]);
        return responses.shift() ?? sse(["data: [DONE]\n\n"]);
      }),
    );

    let received: Record<string, unknown> | null = null;
    const toolset: Toolset = {
      prompt: "工具提示",
      tools: [
        {
          name: "demo_tool",
          label: "演示工具",
          description: "demo",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
          execute: async (args) => {
            received = args;
            return { text: '{"ok":true}', summary: "1 条结果" };
          },
        },
      ],
    };
    const events: AgentEvent[] = [];
    await runAgentChat({
      messages: [{ role: "user", content: "查询" }],
      model: "deepseek-flash",
      effortFields: {},
      toolset,
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
    });

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.tools?.[0]?.function.name).toBe("demo_tool");
    expect(bodies[1]?.messages).toContainEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: '{"ok":true}',
    });
    expect(received).toEqual({ query: "test" });
    expect(events.filter((event) => event.type === "tool")).toEqual([
      expect.objectContaining({
        type: "tool",
        tool: expect.objectContaining({ phase: "start", label: "演示工具" }),
      }),
      expect.objectContaining({
        type: "tool",
        tool: expect.objectContaining({ phase: "end", summary: "1 条结果" }),
      }),
    ]);
    expect(events).toContainEqual({ type: "delta", text: "最终答案" });
  });
});
