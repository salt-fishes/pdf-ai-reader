import type { StreamEvent } from "./types";

/**
 * Parse an SSE byte stream into normalized events. Handles CRLF, multi-line
 * data fields, comments, [DONE], and providers that attach usage to the final
 * chunk (with or without choices).
 */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const events = parseBlock(block);
        for (const event of events) {
          if (event.type === "done") sawDone = true;
          yield event;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n");
    if (buffer.trim()) {
      for (const event of parseBlock(buffer)) {
        if (event.type === "done") sawDone = true;
        yield event;
      }
    }
    if (!sawDone) yield { type: "done" };
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): StreamEvent[] {
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return [];

  const data = dataLines.join("\n").trim();
  if (!data) return [];
  if (data === "[DONE]") return [{ type: "done" }];

  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return [];
  }

  const events: StreamEvent[] = [];
  const obj = payload as {
    choices?: Array<{
      delta?: { content?: string | null; reasoning_content?: string | null };
      finish_reason?: string | null;
    }>;
    usage?: unknown;
    error?: { message?: string; code?: string; type?: string };
  };

  if (obj.error) {
    events.push({
      type: "error",
      error: {
        code: obj.error.code ?? obj.error.type ?? "upstream_error",
        message: obj.error.message ?? "模型返回错误",
      },
    });
    return events;
  }

  const delta = obj.choices?.[0]?.delta;
  const reasoning = delta?.reasoning_content;
  if (reasoning) events.push({ type: "reasoning", text: reasoning });
  const content = delta?.content;
  if (content) events.push({ type: "delta", text: content });
  if (obj.usage) events.push({ type: "usage", usage: obj.usage });

  return events;
}
