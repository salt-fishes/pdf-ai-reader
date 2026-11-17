import type { Hono } from "hono";
import { z } from "zod";
import { isJsonRequest, jsonError } from "../http";
import {
  getMcpSettings,
  publicMcpSettings,
  saveMcpSettings,
  type McpSettingsInput,
} from "../mcp/config";
import { invalidateMcp, testMcpServer } from "../mcp/manager";
import { testSciverse } from "../mcp/sciverse";

const serverInput = z.object({
  id: z.string().max(32).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  url: z.string().trim().min(8).max(2048).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

const configSchema = z.object({
  enabled: z.boolean().optional(),
  sciverse: z
    .object({
      enabled: z.boolean().optional(),
      token: z.string().max(512).optional(),
      clearToken: z.boolean().optional(),
      prompt: z.string().max(4000).optional(),
    })
    .optional(),
  servers: z.array(serverInput).max(8).optional(),
});

const testSchema = z.object({
  sciverse: z.boolean().optional(),
  serverId: z.string().max(32).optional(),
});

export function registerMcpRoutes(app: Hono): void {
  app.get("/api/mcp", (c) => c.json(publicMcpSettings()));

  app.put("/api/mcp", async (c) => {
    if (!isJsonRequest(c)) {
      return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
    }
    const parsed = configSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(
        400,
        "invalid_mcp_config",
        "MCP 配置不合法",
        parsed.error.issues[0]?.message,
      );
    }
    try {
      await saveMcpSettings(parsed.data as McpSettingsInput);
      await invalidateMcp();
      return c.json(publicMcpSettings());
    } catch (error) {
      return jsonError(
        400,
        "invalid_mcp_config",
        error instanceof Error ? error.message : "无法保存 MCP 配置",
      );
    }
  });

  app.post("/api/mcp/test", async (c) => {
    if (!isJsonRequest(c)) {
      return jsonError(415, "invalid_content_type", "请求必须使用 application/json");
    }
    const parsed = testSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, "invalid_mcp_test", "测试参数不合法");
    }
    const settings = getMcpSettings();
    try {
      if (parsed.data.sciverse) {
        if (!settings.sciverse.token) {
          return jsonError(400, "missing_sciverse_token", "请先保存 Sciverse token");
        }
        const tools = await testSciverse(settings.sciverse.token, c.req.raw.signal);
        return c.json({ ok: true, tools });
      }
      const server = settings.servers.find((item) => item.id === parsed.data.serverId);
      if (!server) return jsonError(404, "mcp_server_not_found", "找不到这个 MCP 服务器");
      const tools = await testMcpServer(server);
      return c.json({ ok: true, tools });
    } catch (error) {
      return jsonError(502, "mcp_test_failed", error instanceof Error ? error.message : "连接失败");
    }
  });
}
