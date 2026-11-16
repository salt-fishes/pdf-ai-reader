import type { ChatMessage } from "./types";

export type TrimmedHistory = {
  messages: ChatMessage[];
  omitted: number;
};

/**
 * Keep the most recent turns under a message-count limit. Starting a prompt
 * with an orphaned assistant message confuses most chat models, so snap the
 * window forward to the next user message when necessary. A limit of 0 keeps
 * everything.
 */
export function trimHistory(messages: ChatMessage[], limit: number): TrimmedHistory {
  if (!Number.isFinite(limit) || limit <= 0 || messages.length <= limit) {
    return { messages, omitted: 0 };
  }
  let start = Math.max(0, messages.length - Math.round(limit));
  while (start < messages.length && messages[start].role !== "user") start += 1;
  if (start >= messages.length) {
    const lastUser = messages.map((message) => message.role).lastIndexOf("user");
    start = lastUser >= 0 ? lastUser : Math.max(0, messages.length - 1);
  }
  return {
    messages: messages.slice(start),
    omitted: start,
  };
}
