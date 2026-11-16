import { chromium } from "@playwright/test";
import path from "node:path";

const BASE = "http://127.0.0.1:8787";
const outDir = path.resolve("docs");

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const errors = [];
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#root > div");
await page.evaluate(async () => {
  const blob = await (await fetch("/samples/sample-cn.pdf")).blob();
  const file = new File([blob], "sample-cn.pdf", { type: "application/pdf" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  document
    .querySelector("#root > div")
    ?.dispatchEvent(
      new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
});
await page.locator("header").filter({ hasText: "sample-cn.pdf" }).waitFor();
await page.locator('[data-page="1"] .textLayer span').first().waitFor();

await page.locator("[data-assistant-fab]").click();
const panel = page.locator("[data-assistant-panel]");
await panel.waitFor({ state: "visible" });
await panel.locator('button[aria-label="框选截图"]').click();
await page.locator('[data-region="1"]').waitFor({ state: "visible" });

const box = await page.locator('[data-page="1"]').boundingBox();
const start = { x: box.x + box.width * 0.07, y: box.y + box.height * 0.12 };
const end = { x: box.x + box.width * 0.92, y: box.y + box.height * 0.34 };
await page.mouse.move(start.x, start.y);
await page.mouse.down();
await page.mouse.move(end.x, end.y, { steps: 12 });
await page.waitForTimeout(220);
await page.screenshot({ path: path.join(outDir, "region-select.png") });
await page.mouse.up();

await panel.waitFor({ state: "visible" });
await panel.locator('button[aria-label="上下文详情"]').click();
await panel.locator("text=P1 框选").waitFor({ timeout: 15_000 });
console.log(
  "context:",
  (await panel.locator('button[aria-label="上下文详情"]').innerText()).replace(/\s+/g, " "),
);
await page.screenshot({ path: path.join(outDir, "region-result.png") });

await panel
  .locator("textarea")
  .fill("只看这张框选截图，回答：主标题和副标题分别是什么？只输出两行。");
await panel.locator('button[aria-label="发送"]').click();
await panel
  .locator('button[aria-label="停止生成"]')
  .waitFor({ state: "detached", timeout: 120_000 });
await panel.locator('button[aria-label="发送"]').waitFor();

const answer = await panel.locator('[class*="assistantMessage"]').last().innerText();
console.log("\n--- 回答 ---\n" + answer.slice(0, 500));
console.log(
  "context next:",
  (await panel.locator('button[aria-label="上下文详情"]').innerText()).replace(/\s+/g, " "),
);
await page.screenshot({ path: path.join(outDir, "real-region.png") });

const ok =
  answer.includes("深度学习时代的文档阅读") && answer.includes("从整本上传到按需引用的上下文设计");
console.log(
  `标题匹配: ${ok ? "OK" : "FAIL"} · 页面错误: ${errors.length ? errors.join(" | ") : "无"}`,
);
await browser.close();
process.exit(ok && !errors.length ? 0 : 1);
