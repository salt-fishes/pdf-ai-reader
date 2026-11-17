import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const FIXTURES = join(fileURLToPath(new URL(".", import.meta.url)), "..", "fixtures", "pdf");
const API_ORIGIN = `http://127.0.0.1:${process.env.PDF_AI_PROXY_PORT ?? "8787"}`;

function fixtureBase64(name: string): string {
  return readFileSync(join(FIXTURES, name)).toString("base64");
}

export async function verifyMockProxy(request: APIRequestContext): Promise<void> {
  const config = (await (await request.get(`${API_ORIGIN}/api/config`)).json()) as {
    mock?: boolean;
  };
  if (!config.mock) {
    throw new Error(
      "E2E 只应在 mock 代理上运行：检测到真实模型。请先停止 npm start / npm run dev:all，再运行 npm run test:e2e。",
    );
  }
}

/** Drop a PDF fixture into the app without relying on a static /samples directory. */
export async function dropFixture(
  page: Page,
  fileName: string,
  options: { waitForHeader?: boolean } = {},
): Promise<void> {
  const base64 = fixtureBase64(fileName);
  await page.evaluate(
    ({ name, data }) => {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const file = new File([bytes], name, { type: "application/pdf" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const root = document.querySelector("#root > div");
      if (!root) throw new Error("app root missing");
      root.dispatchEvent(
        new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }),
      );
    },
    { name: fileName, data: base64 },
  );
  if (options.waitForHeader !== false) {
    await expect(page.locator("header")).toContainText(fileName);
  }
}

export async function openSample(
  page: Page,
  fileName = "sample-cn.pdf",
  options: { waitForText?: boolean } = {},
): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("#root > div", { timeout: 20_000 });
  await dropFixture(page, fileName);
  if (options.waitForText !== false) {
    await expect(page.locator('[data-page="1"] .textLayer span').first()).toBeVisible({
      timeout: 20_000,
    });
  } else {
    await expect(page.locator("[data-reader] [data-page]").first()).toBeVisible({
      timeout: 20_000,
    });
  }
}

/** Open another fixture without reloading the page, preserving in-memory state. */
export async function dropSample(page: Page, fileName: string): Promise<void> {
  await dropFixture(page, fileName);
}

export function registerMockGuard(): void {
  test.beforeAll(async ({ request }) => verifyMockProxy(request));
}
