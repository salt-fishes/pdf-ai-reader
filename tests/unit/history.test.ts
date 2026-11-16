import { describe, expect, it } from "vitest";
import { trimHistory } from "../../src/lib/ai/history";
import type { ChatMessage } from "../../src/lib/ai/types";

function message(role: "user" | "assistant", content: string, index: number): ChatMessage {
  return {
    id: `m${index}`,
    role,
    content,
    status: "done",
    createdAt: index,
  };
}

describe("trimHistory", () => {
  const messages = [
    message("user", "u1", 1),
    message("assistant", "a1", 2),
    message("user", "u2", 3),
    message("assistant", "a2", 4),
    message("user", "u3", 5),
    message("assistant", "a3", 6),
  ];

  it("keeps everything when the limit is zero or large enough", () => {
    expect(trimHistory(messages, 0)).toEqual({ messages, omitted: 0 });
    expect(trimHistory(messages, 10)).toEqual({ messages, omitted: 0 });
  });

  it("keeps the newest window and starts on a user message", () => {
    const result = trimHistory(messages, 3);
    expect(result.messages.map((item) => item.content)).toEqual(["u3", "a3"]);
    expect(result.omitted).toBe(4);
  });

  it("handles a window that lands on an assistant message", () => {
    const result = trimHistory(messages, 4);
    expect(result.messages.map((item) => item.content)).toEqual(["u2", "a2", "u3", "a3"]);
    expect(result.omitted).toBe(2);
  });

  it("keeps a complete last turn when the limit is tiny", () => {
    const result = trimHistory(messages, 1);
    expect(result.messages.map((item) => item.content)).toEqual(["u3", "a3"]);
    expect(result.omitted).toBe(4);
  });
});
