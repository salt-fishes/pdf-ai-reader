export type ToolResult = {
  text: string;
  summary?: string;
  isError?: boolean;
};

export type ToolDefinition = {
  /** OpenAI-safe unique name, e.g. sciverse_semantic_search. */
  name: string;
  /** Human label shown in the chat tool card. */
  label: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolResult>;
};

export type Toolset = {
  tools: ToolDefinition[];
  prompt: string;
};
