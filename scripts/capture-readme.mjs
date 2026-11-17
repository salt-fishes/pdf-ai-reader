import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { dropSample } from "./lib/sample.mjs";

const OUT = "docs/screenshots";
const RAW = "C:/Users/15572/AppData/Local/Temp/opencode/readme-raw";
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: "zh-CN",
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:5173/");
await page.waitForSelector("#root > div", { timeout: 30_000 });

async function drop(name) {
  await dropSample(page, name);
  await page.locator('[data-page="1"] .textLayer span').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(700);
}

async function shot(name) {
  const raw = `${RAW}/${name}.png`;
  await page.screenshot({ path: raw });
  await sharp(raw)
    .resize({ width: 1200 })
    .png({ compressionLevel: 9, palette: true, quality: 92 })
    .toFile(`${OUT}/${name}.png`);
  console.log("shot", name);
}

await drop("sample-cn.pdf");
await shot("reading");

await page.keyboard.press("Control+J");
const panel = page.locator("[data-assistant-panel]");
await panel.waitFor();
await page.waitForTimeout(500);
await panel.locator("textarea").fill("第 2 页的主要结论是什么？");
await panel.locator('button[aria-label="发送"]').click();
await panel.getByText("本地 mock 模型", { exact: false }).waitFor({ timeout: 20_000 });
await panel.locator('button[aria-label="发送"]').waitFor({ timeout: 20_000 });
await page.waitForTimeout(500);
await shot("assistant");

await panel.locator('button[aria-label="上下文详情"]').click();
await page.waitForTimeout(500);
await shot("context");

await panel.locator('button[aria-label="上下文详情"]').click();
await panel.getByRole("button", { name: "侧边栏", exact: true }).click();
await page.waitForTimeout(700);
await shot("sidebar");

await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.keyboard.press("Control+F");
await page.waitForTimeout(400);
await page.locator('input[placeholder*="搜索全文"]').fill("文档");
await page.waitForTimeout(1200);
await shot("search");
await page.keyboard.press("Escape");

await page.locator('button[aria-label="设置"]').first().click();
const settings = page.getByRole("dialog", { name: "设置" });
await settings.getByRole("button", { name: "隐私与数据", exact: true }).click();
await page.waitForTimeout(500);
await shot("privacy");
await settings.getByRole("button", { name: "关于", exact: true }).click();
await page.waitForTimeout(500);
await shot("about");
await page.keyboard.press("Escape");

// Scanned page 6 of sample-cn: wait for the local OCR line layer, then capture.
await drop("sample-cn.pdf");
const pageInput = page.locator('header input[class*="pageInput"]');
await pageInput.fill("6");
await pageInput.press("Enter");
await page.locator('[data-page="6"] [data-ocr-layer]').waitFor({ timeout: 60_000 });
await page.locator('[data-page="6"] [class*="ocrBadge"]').waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: /缩放 \d+%/ }).click();
await page.getByRole("menuitem", { name: "适合页面" }).click();
await page.waitForTimeout(900);
// The OCR badge sits next to the page label at the bottom of the page.
await page.locator('[data-page="6"] [class*="label"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await shot("ocr");

await browser.close();
console.log("captured", OUT);
