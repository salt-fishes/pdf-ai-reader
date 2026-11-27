import { describe, expect, it } from "vitest";
import { filterDocumentHistory } from "../../src/lib/ai/history";
import type { ChatMessage } from "../../src/lib/ai/types";

function message(
  role: "user" | "assistant",
  content: string,
  index: number,
  docHash = "doc-a",
): ChatMessage {
  return {
    id: `m${index}`,
    role,
    content,
    status: "done",
    createdAt: index,
    docHash,
  };
}

describe("filterDocumentHistory", () => {
  it("keeps only turns from the active document in a shared workspace", () => {
    const shared = [
      message("user", "a1", 1),
      message("assistant", "a2", 2),
      message("user", "b1", 3, "doc-b"),
      message("assistant", "b2", 4, "doc-b"),
      message("user", "a3", 5),
      message("assistant", "a4", 6),
    ];
    expect(filterDocumentHistory(shared, "doc-a").messages.map((item) => item.content)).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
    ]);
  });

  it("drops an orphaned assistant message after document filtering", () => {
    const shared = [
      message("user", "other", 1, "doc-b"),
      message("assistant", "orphan", 2),
      message("user", "question", 3),
      message("assistant", "answer", 4),
    ];
    expect(filterDocumentHistory(shared, "doc-a").messages.map((item) => item.content)).toEqual([
      "question",
      "answer",
    ]);
  });

  it("does not impose a message-count limit", () => {
    const messages = Array.from({ length: 250 }, (_, index) =>
      message(index % 2 === 0 ? "user" : "assistant", `m${index}`, index),
    );
    expect(filterDocumentHistory(messages, "doc-a").messages).toHaveLength(250);
  });

  it("returns no history when the document has no user turn", () => {
    expect(filterDocumentHistory([message("assistant", "orphan", 1)], "doc-a")).toEqual({
      messages: [],
      omitted: 0,
    });
  });
});
