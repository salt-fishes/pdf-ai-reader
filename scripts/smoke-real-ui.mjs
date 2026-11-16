// 真实模型 UI 冒烟：Edge 无头浏览器，跑完整「打开 PDF → 选页 → 提问 → 流式 → 引用回跳」。
// 用法：node scripts/smoke-real-ui.mjs [http://127.0.0.1:8787]
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dropSample } from "./lib/sample.mjs";

const BASE = (process.argv[2] ?? process.env.API_BASE ?? "http://127.0.0.1:8787").replace(
  /\/+$/,
  "",
);
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "zh-CN",
});
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const t0 = Date.now();
const mark = (label) => console.log(`[${((Date.now() - t0) / 1000).toFixed(2)}s] ${label}`);

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#root > div", { timeout: 20_000 });
await dropSample(page, "sample-cn.pdf");
await page.locator("header").filter({ hasText: "sample-cn.pdf" }).waitFor({ timeout: 20_000 });
mark("PDF 已打开");

await page.locator("[data-assistant-fab]").click();
const panel = page.locator("[data-assistant-panel]");
await panel.waitFor({ state: "visible" });
mark("面板已打开");

// 限定第 2 页上下文，让模型必须引用 p.2。
await panel.locator('button[aria-label="限定页码"]').click();
await panel.locator('[class*="popover"] input').fill("2");
await panel.locator('[class*="popover"] button', { hasText: "确定" }).click();
await panel.locator('button[aria-label="发送"]').waitFor();
mark("已加入第 2 页上下文");

const contextRow = panel.locator('button[aria-label="上下文详情"]');
console.log("发送前上下文:", (await contextRow.innerText()).replace(/\s+/g, " "));

await panel.locator("textarea").fill("第 2 页说了什么？用两句话概括，并标注引用。");
await panel.locator('button[aria-label="发送"]').click();
mark("已发送");

// 思考阶段：等「思考过程」出现，证明 reasoning 流已被接收。
try {
  await panel
    .getByText(/思考过程/)
    .first()
    .waitFor({ timeout: 20_000 });
  mark("收到 reasoning 流（思考过程）");
  await page.screenshot({ path: path.join(outDir, "real-thinking.png") });
} catch {
  mark("未捕获到思考过程（模型可能未返回 reasoning）");
}

// 停止按钮消失 = 流结束
await panel
  .locator('button[aria-label="停止生成"]')
  .waitFor({ state: "detached", timeout: 120_000 });
mark("流结束");

await panel.locator('button[aria-label="发送"]').waitFor({ timeout: 10_000 });
const assistant = panel.locator('[class*="assistantMessage"]').last();
const answer = await assistant.innerText();
console.log("\n--- 回答 ---\n" + answer.slice(0, 900));
console.log("\n--- 上下文（下一轮）---\n" + (await contextRow.innerText()).replace(/\s+/g, " "));

const cites = panel.locator("button[class*='cite']");
const citeCount = await cites.count();
console.log(`引用按钮: ${citeCount}`);
if (citeCount) {
  await page.screenshot({ path: path.join(outDir, "real-answer.png") });
  const first = cites.first();
  console.log("引用按钮文案:", await first.innerText());
  await first.click();
  await page.waitForTimeout(700);
  const header = (await page.locator("header").innerText()).replace(/\s+/g, " ");
  console.log("点击引用后页头:", header);
}

console.log(`\n页面错误: ${errors.length ? errors.join(" | ") : "无"}`);
await browser.close();

if (!answer.trim() || citeCount === 0 || errors.length) process.exit(1);
process.exit(0);
