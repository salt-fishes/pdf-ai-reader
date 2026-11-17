export type McpServerPublic = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  headerNames: string[];
};

export type McpPublicConfig = {
  enabled: boolean;
  sciverse: {
    enabled: boolean;
    hasToken: boolean;
    tokenHint: string;
    prompt: string;
  };
  servers: McpServerPublic[];
};

export type McpConfigInput = {
  enabled?: boolean;
  sciverse?: {
    enabled?: boolean;
    token?: string;
    clearToken?: boolean;
    prompt?: string;
  };
  servers?: Array<{
    id?: string;
    name?: string;
    url?: string;
    headers?: Record<string, string>;
    enabled?: boolean;
  }>;
};

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; hint?: string };
  } | null;
  return payload?.error?.hint
    ? `${payload.error.message ?? "请求失败"}（${payload.error.hint}）`
    : (payload?.error?.message ?? `请求失败（${response.status}）`);
}

export async function fetchMcpConfig(): Promise<McpPublicConfig> {
  const response = await fetch("/api/mcp");
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as McpPublicConfig;
}

export async function saveMcpConfig(input: McpConfigInput): Promise<McpPublicConfig> {
  const response = await fetch("/api/mcp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as McpPublicConfig;
}

export async function testMcpServer(serverId: string): Promise<string[]> {
  const response = await fetch("/api/mcp/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { tools?: string[] };
  return payload.tools ?? [];
}

export async function testSciverse(): Promise<string[]> {
  const response = await fetch("/api/mcp/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sciverse: true }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { tools?: string[] };
  return payload.tools ?? [];
}
