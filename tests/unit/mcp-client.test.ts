import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchMcpConfig,
  saveMcpConfig,
  testMcpServer,
  testSciverse,
  type McpPublicConfig,
} from "../../src/lib/mcp/client";

const sample: McpPublicConfig = {
  enabled: true,
  sciverse: { enabled: false, hasToken: false, tokenHint: "", prompt: "" },
  servers: [
    { id: "demo", name: "Demo", url: "https://example.com/mcp", enabled: true, headerNames: [] },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchMcpConfig", () => {
  it("loads the public config", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(sample));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMcpConfig()).resolves.toEqual(sample);
    expect(fetchMock).toHaveBeenCalledWith("/api/mcp");
  });

  it("includes the server hint in errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "连接失败", hint: "检查 token" } }, 502)),
    );

    await expect(fetchMcpConfig()).rejects.toThrow("连接失败（检查 token）");
  });

  it("falls back to the status when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));

    await expect(fetchMcpConfig()).rejects.toThrow("请求失败（500）");
  });
});

describe("saveMcpConfig", () => {
  it("PUTs the edited config", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(sample));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveMcpConfig({ enabled: false })).resolves.toEqual(sample);
    expect(fetchMock).toHaveBeenCalledWith("/api/mcp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
  });

  it("uses the error message when no hint is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "参数不合法" } }, 400)),
    );

    await expect(saveMcpConfig({})).rejects.toThrow("参数不合法");
  });
});

describe("connection tests", () => {
  it("returns the tools reported by an MCP server", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ tools: ["search", "read"] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testMcpServer("demo")).resolves.toEqual(["search", "read"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/mcp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId: "demo" }),
    });
  });

  it("defaults to an empty tool list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({})));
    await expect(testMcpServer("demo")).resolves.toEqual([]);
  });

  it("tests the built-in Sciverse skill", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ tools: ["sciverse_semantic_search"] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testSciverse()).resolves.toEqual(["sciverse_semantic_search"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/mcp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sciverse: true }),
    });
  });

  it("surfaces test failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "无法连接" } }, 502)),
    );
    await expect(testSciverse()).rejects.toThrow("无法连接");
  });
});
