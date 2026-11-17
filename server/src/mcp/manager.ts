import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerSettings } from "./config";
import type { ToolDefinition, ToolResult } from "./types";

const CACHE_MS = 60_000;
const FAILURE_MS = 30_000;
const CONNECT_TIMEOUT_MS = 8_000;
const CALL_TIMEOUT_MS = 20_000;

type Cached = {
  client: Client;
  tools: ToolDefinition[];
  expires: number;
};

const cache = new Map<string, Cached>();
const failures = new Map<string, { expires: number; message: string }>();

function safeToolName(name: string): string {
  return (
    name
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 47) || "tool"
  ).replace(/_+$/, "");
}

function prefixedName(server: McpServerSettings, name: string): string {
  const id = server.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  return `mcp_${id}_${safeToolName(name)}`.slice(0, 64);
}

function extractResult(input: unknown): ToolResult {
  const result = input as { content?: unknown; isError?: boolean };
  const parts = Array.isArray(result.content) ? result.content : [];
  const texts: string[] = [];
  let images = 0;
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const item = part as { type?: string; text?: string };
    if (item.type === "text" && typeof item.text === "string") texts.push(item.text);
    else if (item.type === "image") images += 1;
  }
  const text =
    texts.join("\n\n") ||
    (images ? `（工具返回 ${images} 张图片，当前只展示文本结果）` : "（工具没有返回文本内容）");
  return {
    text,
    summary: texts.length ? `${text.length.toLocaleString("zh-CN")} 字` : `${images} 张图片`,
    isError: result.isError === true,
  };
}

async function connect(server: McpServerSettings): Promise<Cached> {
  const client = new Client({ name: "paper-reader", version: "0.9.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: server.headers },
  });
  await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
  const listed = await client.listTools({}, { timeout: CONNECT_TIMEOUT_MS });
  const tools: ToolDefinition[] = listed.tools.map((tool) => ({
    name: prefixedName(server, tool.name),
    label: tool.annotations?.title ?? tool.name,
    description: tool.description ?? `${server.name} 提供的 ${tool.name} 工具`,
    inputSchema: tool.inputSchema as Record<string, unknown>,
    async execute(args, signal): Promise<ToolResult> {
      const result = await client.callTool({ name: tool.name, arguments: args }, undefined, {
        timeout: CALL_TIMEOUT_MS,
        signal,
      });
      return extractResult(result);
    },
  }));
  return { client, tools, expires: Date.now() + CACHE_MS };
}

export async function getMcpTools(servers: McpServerSettings[]): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];
  for (const server of servers) {
    if (!server.enabled) continue;
    const cached = cache.get(server.id);
    if (cached && cached.expires > Date.now()) {
      tools.push(...cached.tools);
      continue;
    }
    const failed = failures.get(server.id);
    if (failed && failed.expires > Date.now()) {
      console.warn(`[mcp] ${server.name}: ${failed.message}（暂时跳过）`);
      continue;
    }
    try {
      if (cached) await cached.client.close().catch(() => undefined);
      const connection = await connect(server);
      cache.set(server.id, connection);
      failures.delete(server.id);
      tools.push(...connection.tools);
    } catch (error) {
      const message = error instanceof Error ? error.message : "连接失败";
      failures.set(server.id, { expires: Date.now() + FAILURE_MS, message });
      console.warn(`[mcp] ${server.name}: ${message}`);
    }
  }
  return tools;
}

export async function testMcpServer(server: McpServerSettings): Promise<string[]> {
  const connection = await connect(server);
  try {
    return connection.tools.map((tool) => tool.label);
  } finally {
    await connection.client.close().catch(() => undefined);
  }
}

export async function invalidateMcp(): Promise<void> {
  const clients = [...cache.values()].map((item) => item.client);
  cache.clear();
  failures.clear();
  await Promise.all(clients.map((client) => client.close().catch(() => undefined)));
}
