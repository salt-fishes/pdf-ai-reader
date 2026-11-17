import type { ChatMessage } from "../mock";
import { runAgentChat, type AgentEvent } from "./agent";
import type { Toolset } from "./types";

/**
 * Streams the same OpenAI-shaped chunks the client already understands, plus a
 * `paper_reader_tool` payload for tool cards. Keeping the upstream shape means
 * the existing SSE parser only needs one extra branch.
 */
export function agentChatResponse(options: {
  messages: ChatMessage[];
  model: string;
  effortFields: Record<string, unknown>;
  toolset: Toolset;
  signal: AbortSignal;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const emit = (event: AgentEvent) => {
        if (event.type === "delta") write({ choices: [{ delta: { content: event.text } }] });
        else if (event.type === "reasoning") {
          write({ choices: [{ delta: { reasoning_content: event.text } }] });
        } else if (event.type === "usage") write({ choices: [], usage: event.usage });
        else write({ paper_reader_tool: event.tool });
      };

      try {
        await runAgentChat({
          messages: options.messages,
          model: options.model,
          effortFields: options.effortFields,
          toolset: options.toolset,
          signal: options.signal,
          emit,
        });
        if (!closed) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        if (!options.signal.aborted) {
          write({
            error: {
              code: "mcp_agent_error",
              message: error instanceof Error ? error.message : "外部工具调用失败",
            },
          });
          if (!closed) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // The renderer may have already canceled the stream.
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
