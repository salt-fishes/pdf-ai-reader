// 真实模型截图理解 UI 冒烟：截取当前页 → 提问 → 校验标题。
// 用法：node scripts/smoke-real-vision.mjs [http://127.0.0.1:8787]
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const errors = [];
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#root > div", { timeout: 20_000 });
await dropSample(page, "sample-cn.pdf");
await page.locator("header").filter({ hasText: "sample-cn.pdf" }).waitFor({ timeout: 20_000 });
await page.locator('[data-page="1"] .textLayer span').first().waitFor();

await page.locator("[data-assistant-fab]").click();
const panel = page.locator("[data-assistant-panel]");
await panel.waitFor({ state: "visible" });

// 移除默认的“当前页文字”，只保留截图，验证模型确实看图而不是读文字层。
await panel.locator('button[aria-label="上下文详情"]').click();
await panel.locator('button[aria-label="移除当前页"]').click();
await panel.locator('button[aria-label="截取当前页"]').click();
await panel.getByText("P1 截图").waitFor({ timeout: 20_000 });

const context = (await panel.locator('button[aria-label="上下文详情"]').innerText()).replace(
  /\s+/g,
  " ",
);
console.log("上下文:", context);

await panel.locator("textarea").fill("只看截图，回答这一页的大标题是什么？只输出标题本身。");
await panel.locator('button[aria-label="发送"]').click();
await panel
  .locator('button[aria-label="停止生成"]')
  .waitFor({ state: "detached", timeout: 120_000 });
await panel.locator('button[aria-label="发送"]').waitFor();

const assistant = panel.locator('[class*="assistantMessage"]').last();
const answer = await assistant.innerText();
console.log("回答:", answer.slice(0, 400));
console.log(
  "上下文（下一轮）:",
  (await panel.locator('button[aria-label="上下文详情"]').innerText()).replace(/\s+/g, " "),
);
await page.screenshot({ path: path.join(outDir, "real-vision.png") });

const ok = answer.includes("深度学习时代的文档阅读");
console.log(
  `标题匹配: ${ok ? "OK" : "FAIL"} · 页面错误: ${errors.length ? errors.join(" | ") : "无"}`,
);
await browser.close();
process.exit(ok && !errors.length ? 0 : 1);
