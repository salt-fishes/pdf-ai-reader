import { describe, expect, it } from "vitest";
import { parseSse } from "../../src/lib/ai/sse";
import type { StreamEvent } from "../../src/lib/ai/types";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of parseSse(stream)) events.push(event);
  return events;
}

describe("parseSse", () => {
  it("parses content deltas split across chunks", async () => {
    const events = await collect(
      streamFrom([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DO',
        "NE]\n\n",
      ]),
    );
    expect(events).toEqual([
      { type: "delta", text: "你" },
      { type: "delta", text: "好" },
      { type: "done" },
    ]);
  });

  it("handles CRLF, comments and multi-line data", async () => {
    const events = await collect(
      streamFrom([
        ": keep-alive\r\n\r\n",
        'data: {"choices":[{"delta":{"content":"A"}}]}\r\n\r\n',
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\r\n\r\n',
        "data: [DONE]\r\n\r\n",
      ]),
    );
    expect(events[0]).toEqual({ type: "delta", text: "A" });
    expect(events[1]).toEqual({
      type: "usage",
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });
    expect(events[2]).toEqual({ type: "done" });
  });

  it("emits reasoning before content", async () => {
    const events = await collect(
      streamFrom([
        'data: {"choices":[{"delta":{"reasoning_content":"想一想"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"答案"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    expect(events[0]).toEqual({ type: "reasoning", text: "想一想" });
    expect(events[1]).toEqual({ type: "delta", text: "答案" });
  });

  it("parses tool cards emitted by the local agent", async () => {
    const events = await collect(
      streamFrom([
        'data: {"paper_reader_tool":{"id":"call_1","name":"sciverse_semantic_search","label":"Sciverse 学术检索","phase":"start","args":{"query":"graphene"}}}\n\n',
        'data: {"paper_reader_tool":{"id":"call_1","name":"sciverse_semantic_search","label":"Sciverse 学术检索","phase":"end","summary":"8 条证据","durationMs":900}}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    expect(events[0]).toMatchObject({
      type: "tool",
      tool: {
        id: "call_1",
        phase: "start",
        label: "Sciverse 学术检索",
        args: { query: "graphene" },
      },
    });
    expect(events[1]).toMatchObject({
      type: "tool",
      tool: { phase: "end", summary: "8 条证据", durationMs: 900 },
    });
  });

  it("surfaces upstream error payloads", async () => {
    const events = await collect(
      streamFrom(['data: {"error":{"message":"bad key","type":"auth_error"}}\n\n']),
    );
    expect(events[0]).toEqual({
      type: "error",
      error: { code: "auth_error", message: "bad key" },
    });
  });

  it("synthesizes done when the stream closes without [DONE]", async () => {
    const events = await collect(streamFrom(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n']));
    expect(events.at(-1)).toEqual({ type: "done" });
  });
});
