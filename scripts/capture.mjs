import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = new URL("../docs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });

await page.goto("http://127.0.0.1:5173/");
await page.evaluate(async () => {
  const blob = await (await fetch("/samples/sample-cn.pdf")).blob();
  const file = new File([blob], "sample-cn.pdf", { type: "application/pdf" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  document
    .querySelector("#root > div")
    ?.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
});
await page.locator('[data-page="1"] .textLayer span').first().waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/app-reading.png` });

await page.keyboard.press("Control+J");
await page.waitForTimeout(500);
await page.locator('[data-assistant-panel] textarea').fill("第 2 页的主要结论是什么？");
await page.locator('[data-assistant-panel] button[aria-label="发送"]').click();
await page.locator('[data-assistant-panel]').getByText("本地 mock 模型", { exact: false }).waitFor({
  timeout: 20_000,
});
await page.locator('[data-assistant-panel] button[aria-label="发送"]').waitFor({ timeout: 20_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/app-panel.png` });

const panel = page.locator("[data-assistant-panel]");
await panel.locator('button[aria-label="上下文详情"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/app-context.png` });

// Docked sidebar mode.
await panel.locator('button[aria-label="上下文详情"]').click();
await panel.getByRole("button", { name: "侧边栏", exact: true }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/app-sidebar.png` });

// Mobile bottom sheet (sidebar mode collapses to a sheet).
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/app-mobile-panel.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/app-mobile-reading.png` });

await page.setViewportSize({ width: 1440, height: 900 });
await browser.close();
console.log("captured", OUT);
