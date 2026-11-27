import type { ChatMessage } from "./types";

export type HistorySelection = {
  messages: ChatMessage[];
  omitted: number;
};

/**
 * Keep only turns sourced from one document in a shared, document-only chat.
 * History is no longer count-limited; only orphaned assistant turns are dropped.
 */
export function filterDocumentHistory(messages: ChatMessage[], docHash: string): HistorySelection {
  const scoped = messages.filter((message) => message.docHash === docHash);
  const firstUser = scoped.findIndex((message) => message.role === "user");
  return {
    messages: firstUser < 0 ? [] : scoped.slice(firstUser),
    omitted: 0,
  };
}
