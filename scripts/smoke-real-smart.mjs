import { chromium } from "@playwright/test";
import path from "node:path";
import { dropSample } from "./lib/sample.mjs";

const BASE = "http://127.0.0.1:8787";
const outDir = path.resolve("docs");

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const errors = [];
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#root > div");
await dropSample(page, "sample-long.pdf");
await page.locator("header").filter({ hasText: "sample-long.pdf" }).waitFor();
await page.locator('[data-page="1"] .textLayer span').first().waitFor();

await page.locator("[data-assistant-fab]").click();
const panel = page.locator("[data-assistant-panel]");
await panel.waitFor({ state: "visible" });

await panel.locator("textarea").fill("量子纠缠的实验验证有哪些？请给出两条实验证据，并标注引用。");
await panel.locator('button[aria-label="限定页码"]').click();
await panel.getByRole("button", { name: /智能筛选全文/ }).click();

const contextButton = panel.locator('button[aria-label="上下文详情"]');
await contextButton.filter({ hasText: "1 个来源" }).waitFor({ timeout: 30_000 });
console.log("上下文行:", (await contextButton.innerText()).replace(/\s+/g, " "));

await contextButton.click();
const smartNote = panel.locator('[class*="smartNote"]');
await smartNote.waitFor();
console.log("筛选说明:", (await smartNote.innerText()).replace(/\s+/g, " "));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, "real-smart-context.png") });

await panel.locator('button[aria-label="发送"]').click();
await panel
  .locator('button[aria-label="停止生成"]')
  .waitFor({ state: "detached", timeout: 120_000 });
await panel.locator('button[aria-label="发送"]').waitFor();

const assistant = panel.locator('[class*="assistantMessage"]').last();
const answer = await assistant.innerText();
console.log("\n--- 回答 ---\n" + answer.slice(0, 1200));

const cites = panel.locator("button[class*='cite']");
const labels = await cites.allInnerTexts();
console.log("\n引用:", labels.join(" "));
console.log("上下文（下一轮）:", (await contextButton.innerText()).replace(/\s+/g, " "));
await page.screenshot({ path: path.join(outDir, "real-smart.png") });

const allowed = new Set(["p.4", "p.12", "p.20", "p.28"]);
const bad = labels.filter((label) => !allowed.has(label));
console.log("页面错误:", errors.length ? errors.join(" | ") : "无");

await browser.close();
process.exit(bad.length || !answer.trim() || errors.length ? 1 : 0);
