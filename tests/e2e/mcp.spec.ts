import { expect, test } from "@playwright/test";
import { openSample, registerMockGuard } from "./helpers";

registerMockGuard();

test("model settings expose Sciverse and MCP tool configuration", async ({ page }) => {
  await openSample(page);
  await page.locator('button[aria-label="设置"]').first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "模型服务", exact: true }).click();

  await expect(settings.getByText("外部工具（MCP / Skills）")).toBeVisible();
  await expect(settings.getByText("学术检索 · Sciverse")).toBeVisible();
  await expect(settings.getByRole("switch", { name: "允许 AI 调用外部工具" })).toBeVisible();
  await expect(settings.getByText("添加 MCP 服务器", { exact: true })).toBeVisible();
});

test("renders external tool cards from the chat stream", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    const body = [
      `data: ${JSON.stringify({
        paper_reader_tool: {
          id: "call_1",
          name: "sciverse_semantic_search",
          label: "Sciverse 学术检索",
          phase: "start",
          args: { query: "graphene battery" },
        },
      })}\n\n`,
      `data: ${JSON.stringify({
        paper_reader_tool: {
          id: "call_1",
          name: "sciverse_semantic_search",
          label: "Sciverse 学术检索",
          phase: "end",
          summary: "8 条证据",
          durationMs: 900,
        },
      })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "检索完成。" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body,
    });
  });

  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await panel.locator("textarea").fill("查一下石墨烯电池的循环稳定性");
  await panel.locator('button[aria-label="发送"]').click();

  await expect(panel.getByLabel("外部工具调用")).toBeVisible();
  await expect(panel).toContainText("Sciverse 学术检索");
  await expect(panel).toContainText("8 条证据");
  await expect(panel).toContainText("检索完成。");
});
