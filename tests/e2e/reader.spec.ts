import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeAll(async ({ request }) => {
  const config = (await (await request.get("http://127.0.0.1:8787/api/config")).json()) as {
    mock?: boolean;
  };
  if (!config.mock) {
    throw new Error(
      "E2E 只应在 mock 代理上运行：检测到 8787 正在使用真实模型。请先停止 npm start / npm run dev:all，再运行 npm run test:e2e。",
    );
  }
});

async function openSample(
  page: Page,
  fileName = "sample-cn.pdf",
  options: { waitForText?: boolean } = {},
): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("#root > div", { timeout: 20_000 });
  await page.evaluate(async (name) => {
    const blob = await (await fetch(`/samples/${name}`)).blob();
    const file = new File([blob], name, { type: "application/pdf" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const root = document.querySelector("#root > div");
    if (!root) throw new Error("app root missing");
    root.dispatchEvent(
      new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
  }, fileName);
  await expect(page.locator("header")).toContainText(fileName);
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

/** Open another sample without reloading the page, preserving in-memory state. */
async function dropSample(page: Page, fileName: string): Promise<void> {
  await page.evaluate(async (name) => {
    const blob = await (await fetch(`/samples/${name}`)).blob();
    const file = new File([blob], name, { type: "application/pdf" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const root = document.querySelector("#root > div");
    if (!root) throw new Error("app root missing");
    root.dispatchEvent(
      new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
  }, fileName);
  await expect(page.locator("header")).toContainText(fileName);
}

test("reads a Chinese PDF, sends context, cites and jumps", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await openSample(page);
  await expect(page.locator('header [class*="pager"]')).toContainText("/ 6");

  // Text layer must contain the real Chinese title, not garbled CID bytes.
  const firstPageText = await page.locator('[data-page="1"]').innerText();
  expect(firstPageText).toContain("深度学习时代的文档阅读");

  const fab = page.locator("[data-assistant-fab]");
  await expect(fab).toBeVisible();
  await fab.click();

  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();
  await expect(fab).toBeHidden();
  await expect(panel).toContainText("1 个来源");

  // Page range 2-3 via the composer popover.
  await panel.locator('button[aria-label="限定页码"]').click();
  await panel.locator('[class*="popover"] input').fill("2-3");
  await panel
    .locator('[class*="popover"]')
    .getByRole("button", { name: "确定", exact: true })
    .click();
  await panel.locator('button[aria-label="上下文详情"]').click();
  await expect(panel).toContainText("第 2–3 页");
  await expect(panel).not.toContainText("P1 当前页");

  // Screenshot current page.
  await panel.locator('button[aria-label="截取当前页"]').click();
  await expect(panel).toContainText("P1 截图", { timeout: 15_000 });
  await expect(panel).toContainText("2 个来源");

  // The preview is portaled to <body>, so the panel cannot clip it.
  await panel.locator('[class*="chipLabel"]').filter({ hasText: "P1 截图" }).click();
  const preview = page.getByRole("dialog", { name: "截图预览" });
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((element) => element.parentElement === document.body)).toBe(true);
  const previewImage = await preview.locator("img").boundingBox();
  expect(previewImage).not.toBeNull();
  expect(previewImage!.width).toBeLessThanOrEqual(1440);
  expect(previewImage!.height).toBeLessThanOrEqual(900);
  await preview.getByRole("button", { name: "关闭预览" }).click();
  await expect(preview).toBeHidden();

  await panel.locator("textarea").fill("第 2 页的主要结论是什么？");
  await panel.locator('button[aria-label="发送"]').click();
  await expect(panel).toContainText("本地 mock 模型", { timeout: 20_000 });
  await expect(panel.locator('button[aria-label="发送"]')).toBeVisible();

  const cites = panel.locator("button[class*='cite']");
  await expect(cites.first()).toBeVisible();
  expect(await cites.count()).toBeGreaterThanOrEqual(2);

  // Context details show the provider usage buckets.
  const contextButton = panel.locator('button[aria-label="上下文详情"]');
  if ((await contextButton.getAttribute("aria-expanded")) !== "true") {
    await contextButton.click();
  }
  await expect(panel).toContainText("缓存命中");
  await expect(panel).toContainText("未命中输入");

  // Citation jump scrolls to the referenced page.
  const cite2 = panel.locator("button[aria-label='引用第 2 页']").last();
  await cite2.click();
  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLElement>('[data-page="2"]');
    if (!element) return false;
    return Math.abs(element.getBoundingClientRect().top - 48) < 30;
  });

  expect(errors).toEqual([]);
});

test("region capture sends only the dragged area", async ({ page }) => {
  await openSample(page);
  await expect(page.locator('header [class*="pager"]')).toContainText("/ 6");

  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();

  await panel.locator('button[aria-label="框选截图"]').click();
  await expect(panel).toBeHidden();
  const overlay = page.locator('[data-region="1"]');
  await expect(overlay).toBeVisible({ timeout: 10_000 });

  const box = await page.locator('[data-page="1"]').boundingBox();
  if (!box) throw new Error("page 1 missing");
  const start = { x: box.x + box.width * 0.12, y: box.y + box.height * 0.2 };
  const end = { x: box.x + box.width * 0.82, y: box.y + box.height * 0.3 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();

  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText("2 个来源");
  await panel.locator('button[aria-label="上下文详情"]').click();
  await expect(panel).toContainText("P1 框选");

  await panel.locator("textarea").fill("这张框选截图里是什么？");
  await panel.locator('button[aria-label="发送"]').click();
  await expect(panel).toContainText("本地 mock 模型", { timeout: 20_000 });
  await expect(panel.locator('button[aria-label="发送"]')).toBeVisible();
});

test("toggles floating window and sidebar modes", async ({ page }) => {
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toHaveAttribute("data-assistant-mode", "float");
  await page.waitForTimeout(500);

  const floatBox = await panel.boundingBox();
  if (!floatBox) throw new Error("float panel missing");
  expect(floatBox.width).toBeGreaterThan(300);
  expect(floatBox.width).toBeLessThan(500);

  await panel.getByRole("button", { name: "侧边栏", exact: true }).click();
  await expect(panel).toHaveAttribute("data-assistant-mode", "sidebar");
  await page.waitForTimeout(400);
  const sidebarBox = await panel.boundingBox();
  if (!sidebarBox) throw new Error("sidebar missing");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport missing");
  expect(Math.round(sidebarBox.y)).toBe(48);
  expect(Math.round(sidebarBox.x + sidebarBox.width)).toBe(viewport.width);
  expect(Math.round(sidebarBox.height)).toBe(viewport.height - 48);

  const reader = await page.locator("main").boundingBox();
  expect(reader!.width).toBeLessThan(viewport.width - 300);

  await panel.getByRole("button", { name: "悬浮窗", exact: true }).click();
  await expect(panel).toHaveAttribute("data-assistant-mode", "float");
  await page.waitForTimeout(400);
  const back = await panel.boundingBox();
  expect(back!.width).toBeCloseTo(floatBox.width, 0);
});

test("smart filter narrows a long PDF to relevant pages", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await openSample(page, "sample-long.pdf");
  await expect(page.locator('header [class*="pager"]')).toContainText("/ 32");

  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();

  await panel.locator("textarea").fill("量子纠缠的实验验证有哪些？");
  await panel.locator('button[aria-label="限定页码"]').click();
  await panel.getByRole("button", { name: /智能筛选全文/ }).click();

  const contextButton = panel.locator('button[aria-label="上下文详情"]');
  // 智能筛选会替换当前页上下文，因此只剩 1 个来源。
  await expect(contextButton).toContainText("1 个来源", { timeout: 30_000 });
  await contextButton.click();
  await expect(panel.getByText(/智能筛选 · \d+ 段/)).toBeVisible();
  const smartNote = panel.locator('[class*="smartNote"]');
  await expect(smartNote).toContainText("已从 32 页筛出 4 段");
  await expect(smartNote).toContainText("P4");
  await expect(smartNote).toHaveAttribute("title", /量子纠缠/);

  // 只发送筛选出的段落，而不是整本 32 页。
  const tokenHint = await panel.locator('[title="本次发送的 token 估算"]').innerText();
  expect(tokenHint).toMatch(/≈\s*[\d.]+k?/);

  await panel.locator('button[aria-label="发送"]').click();
  await expect(panel).toContainText("本地 mock 模型", { timeout: 30_000 });
  await expect(panel.locator('button[aria-label="发送"]')).toBeVisible();

  const cites = panel.locator("button[class*='cite']");
  await expect(cites.first()).toBeVisible();
  const labels = await cites.allInnerTexts();
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(label).toMatch(/^p\.(4|12|20|28)$/);
  }

  expect(errors).toEqual([]);
});

test("keeps multiple chat sessions per document", async ({ page }) => {
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();

  const ask = async (question: string) => {
    await panel.locator("textarea").fill(question);
    await panel.locator('button[aria-label="发送"]').click();
    await expect(panel).toContainText("本地 mock 模型", { timeout: 20_000 });
    await expect(panel.locator('button[aria-label="发送"]')).toBeVisible();
  };

  await ask("第一篇的问题");
  await panel.locator('button[aria-label="对话会话"]').click();
  await panel.getByRole("button", { name: /新对话/ }).click();
  await expect(panel.getByText("上下文已就绪")).toBeVisible();

  await ask("第二篇的问题");
  await panel.locator('button[aria-label="对话会话"]').click();
  const rows = panel.locator('[class*="sessionRow"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "第一篇的问题" })).toBeVisible();
  await expect(rows.filter({ hasText: "第二篇的问题" })).toBeVisible();

  await rows.filter({ hasText: "第一篇的问题" }).click();
  await expect(panel).toContainText("第一篇的问题");
  await expect(panel).toContainText("本地 mock 模型");

  // Reload and reopen the same PDF: sessions and the active one are restored.
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  await panel.locator('button[aria-label="对话会话"]').click();
  await expect(panel.locator('[class*="sessionRow"]')).toHaveCount(2);
  await expect(panel.locator('[class*="sessionRowActive"]')).toContainText("第一篇的问题");

  const second = panel.locator('[class*="sessionRow"]').filter({ hasText: "第二篇的问题" });
  await second.locator('button[aria-label^="删除对话"]').click();
  await panel.getByRole("button", { name: "删除", exact: true }).click();
  await expect(panel.locator('[class*="sessionRow"]')).toHaveCount(1);
});

test("recognizes a scanned page in the background and builds a selectable OCR layer", async ({
  page,
  request,
}) => {
  const status = (await (await request.get("http://127.0.0.1:8787/api/ocr/status")).json()) as {
    installed?: boolean;
  };
  test.skip(!status.installed, "OCR 模型未下载，跳过实际识别");

  await openSample(page);
  const pageInput = page.locator('header input[class*="pageInput"]');
  await pageInput.fill("6");
  await pageInput.press("Enter");
  await expect(page.getByText("当前第 6 页，共 6 页")).toBeAttached({ timeout: 15_000 });

  // No button and no dialog: the current scanned page is recognized after a
  // short idle, then a line-level transparent text layer appears.
  const ocrLayer = page.locator('[data-page="6"] [data-ocr-layer]');
  await expect(ocrLayer).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-page="6"] [class*="ocrBadge"]')).toBeVisible();
  await expect(page.getByRole("dialog", { name: "扫描件 OCR" })).toHaveCount(0);

  // OCR text participates in full-text search and is labelled.
  await page.keyboard.press("Control+F");
  const search = page.getByRole("dialog", { name: "搜索文档" });
  await search.locator("input").fill("图A-1");
  const ocrResult = search.locator('[class*="searchResult"]').filter({ hasText: "P6" }).first();
  await expect(ocrResult).toBeVisible({ timeout: 15_000 });
  await expect(ocrResult.locator('[class*="searchOcr"]')).toBeVisible();
  await ocrResult.click();
  const ocrHit = page.locator('[data-page="6"] span[class*="searchHit"]').first();
  await expect(ocrHit).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const viewport = document.querySelector<HTMLElement>("[data-reader]");
          const hit = document.querySelector<HTMLElement>(
            '[data-page="6"] span[class*="searchHit"]',
          );
          if (!viewport || !hit) return -1;
          const viewportRect = viewport.getBoundingClientRect();
          const rect = hit.getBoundingClientRect();
          const position = (rect.top - viewportRect.top) / viewportRect.height;
          return position > 0.02 && position < 0.45 ? 1 : 0;
        }),
      { timeout: 6_000 },
    )
    .toBe(1);
  await page.keyboard.press("Escape");

  // Select the first OCR line and quote it like native text.
  await page.evaluate(() => {
    const line = document.querySelector('[data-page="6"] [data-ocr-line]');
    if (!line) throw new Error("OCR line missing");
    const range = document.createRange();
    range.selectNodeContents(line);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document
      .querySelector("[data-reader]")
      ?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  const toolbar = page.getByRole("toolbar", { name: "选中文字操作" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toContainText("OCR");
  await toolbar.getByRole("button", { name: "引用" }).click();

  const panel = page.locator("[data-assistant-panel]");
  await panel.locator('button[aria-label="上下文详情"]').click();
  await expect(panel).toContainText("选中（OCR）", { timeout: 15_000 });
  await expect(panel).not.toContainText("没有文字层");

  // The line layer is restored from IndexedDB after reopening the document.
  await openSample(page, "sample-cn.pdf", { waitForText: false });
  await pageInput.fill("6");
  await pageInput.press("Enter");
  await expect(page.getByText("当前第 6 页，共 6 页")).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('[data-page="6"] [data-ocr-layer]')).toBeVisible({
    timeout: 30_000,
  });
});

test("prepares an optional OCR model automatically without a modal", async ({ page }) => {
  let installed = false;
  await page.route("**/api/ocr/status", (route) =>
    route.fulfill({
      json: {
        installed,
        ready: false,
        downloading: false,
        downloaded: 0,
        total: 6_270_385,
        progress: 0,
        model: "PP-OCRv6 tiny",
        activeModel: "v6-tiny",
        availableModels: [
          {
            id: "v6-tiny",
            label: "PP-OCRv6 tiny",
            speed: "fast",
            note: "",
            approxBytes: 6_270_385,
            installed,
            downloading: false,
            progress: 0,
          },
        ],
        installedModels: installed ? ["v6-tiny"] : [],
        error: null,
        dir: "",
        busy: false,
        queued: 0,
      },
    }),
  );
  const installRequest = page.waitForRequest("**/api/ocr/install");
  await page.route("**/api/ocr/install", (route) => {
    installed = true;
    return route.fulfill({ json: { ok: true, model: "v6-tiny" } });
  });
  await page.route("**/api/ocr", (route) =>
    route.fulfill({
      json: {
        text: "后台识别文字",
        lines: [
          {
            text: "后台识别文字",
            confidence: 0.9,
            box: { x: 20, y: 20, width: 200, height: 20 },
          },
        ],
        ms: 10,
      },
    }),
  );

  await openSample(page);
  const pageInput = page.locator('header input[class*="pageInput"]');
  await pageInput.fill("6");
  await pageInput.press("Enter");
  await installRequest;
  await expect(page.getByRole("dialog", { name: "扫描件 OCR" })).toHaveCount(0);
  await expect(page.locator('[data-page="6"] [data-ocr-layer]')).toContainText("后台识别文字", {
    timeout: 30_000,
  });
});

test("opens a password-protected PDF without losing the current document", async ({ page }) => {
  await openSample(page);
  await page.evaluate(async () => {
    const blob = await (await fetch("/samples/sample-encrypted.pdf")).blob();
    const file = new File([blob], "sample-encrypted.pdf", { type: "application/pdf" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document
      .querySelector("#root > div")
      ?.dispatchEvent(
        new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }),
      );
  });

  const dialog = page.getByRole("dialog", { name: "输入 PDF 密码" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel("PDF 密码").fill("wrong");
  await dialog.getByRole("button", { name: "打开文档" }).click();
  await expect(dialog).toContainText("密码不正确", { timeout: 15_000 });
  await dialog.getByLabel("PDF 密码").fill("reader");
  await dialog.getByRole("button", { name: "打开文档" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.locator("header")).toContainText("sample-encrypted.pdf");
  await expect(page.locator('header [class*="pager"]')).toContainText("/ 3");
  await expect(page.locator('[data-page="1"] .textLayer span').first()).toBeVisible({
    timeout: 20_000,
  });
});

test("page thumbnails load and jump", async ({ page }) => {
  await openSample(page, "sample-long.pdf");
  await expect(page.locator('header [class*="pager"]')).toContainText("/ 32");

  await page.locator('[aria-label="页面"]').click();
  const sidebar = page.locator('aside[aria-label="页面"]');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator('button[aria-label="第 1 页"]')).toHaveAttribute(
    "aria-current",
    "page",
  );

  const thumbs = sidebar.locator('[class*="thumbFrame"] img');
  await expect(thumbs.first()).toBeVisible({ timeout: 15_000 });
  expect(await thumbs.count()).toBeGreaterThan(3);

  await sidebar.locator('button[aria-label="第 5 页"]').click();
  await expect(page.locator('header input[class*="pageInput"]')).toHaveValue("5");
});

test("text layer stays aligned with the rendered page while zooming", async ({ page }) => {
  await openSample(page);
  const read = () =>
    page.evaluate(() => {
      const pageElement = document.querySelector('[data-page="1"]');
      const layer = pageElement?.querySelector(".textLayer");
      const span = layer?.querySelector("span");
      if (!pageElement || !layer || !span) return null;
      const pageRect = pageElement.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      const spanRect = span.getBoundingClientRect();
      return {
        page: [pageRect.width, pageRect.height],
        layer: [layerRect.width, layerRect.height],
        span: [spanRect.width, spanRect.height],
        font: parseFloat(getComputedStyle(span).fontSize),
        scale: getComputedStyle(layer).getPropertyValue("--total-scale-factor"),
      };
    });

  const before = await read();
  expect(before).not.toBeNull();
  if (!before) return;
  expect(Number(before.scale)).toBeGreaterThan(1.5);
  expect(before.font).toBeGreaterThan(20);
  expect(Math.abs(before.layer[0] - before.page[0])).toBeLessThan(1.5);
  expect(Math.abs(before.layer[1] - before.page[1])).toBeLessThan(1.5);

  await page.getByRole("button", { name: "放大页面" }).click();
  await expect.poll(async () => (await read())?.font ?? 0).toBeGreaterThan(before.font);
  const after = await read();
  expect(after).not.toBeNull();
  if (!after) return;
  expect(after.font).toBeGreaterThan(before.font);

  const spanBox = await page.locator('[data-page="1"] .textLayer span').first().boundingBox();
  expect(spanBox).not.toBeNull();
  if (!spanBox) return;
  const y = spanBox.y + spanBox.height / 2;
  await page.mouse.move(spanBox.x + 3, y);
  await page.mouse.down();
  await page.mouse.move(spanBox.x + spanBox.width * 0.8, y, { steps: 12 });
  await page.mouse.up();
  const selection = await page.evaluate(() => {
    const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    const rect = range?.getClientRects()[0];
    return rect ? { top: rect.top, height: rect.height } : null;
  });
  expect(selection).not.toBeNull();
  if (!selection) return;
  // Chromium's range rects follow the fallback font metrics, which differ a
  // few pixels between Windows and the Linux CI runner. Scale the tolerance
  // with the font size; a real zoom/transform drift is far larger than this.
  const slack = Math.max(2, spanBox.height * 0.25);
  expect(Math.abs(selection.top - spanBox.y)).toBeLessThan(slack);
  expect(Math.abs(selection.height - spanBox.height)).toBeLessThan(slack);
});

test("page picker offers current, all pages and typed ranges", async ({ page }) => {
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();

  await panel.locator('button[aria-label="限定页码"]').click();
  const scopeRow = panel.locator('[class*="pageScopeRow"]');
  await expect(scopeRow.getByRole("button", { name: /当前页/ })).toBeVisible();
  await expect(scopeRow.getByRole("button", { name: /全部页/ })).toBeVisible();
  await expect(scopeRow.getByRole("button", { name: /自定义/ })).toBeVisible();

  await scopeRow.getByRole("button", { name: /全部页/ }).click();
  await page.waitForTimeout(600);
  await expect(panel.locator('button[aria-label="上下文详情"]')).toContainText("1 个来源");
  await panel.locator('button[aria-label="上下文详情"]').click();
  await expect(panel).toContainText("第 1–6 页");

  await panel.getByRole("button", { name: "选择…" }).click();
  await panel.locator('[class*="pagePicker"] input').fill("2-3");
  await panel.getByRole("button", { name: "确定", exact: true }).click();
  await page.waitForTimeout(600);
  await expect(panel).toContainText("第 2–3 页");
});

test("document summary sends every page and renders LaTeX", async ({ page }) => {
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();

  let requestBody: unknown = null;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/chat") && request.method() === "POST") {
      requestBody = request.postDataJSON();
    }
  });

  await panel.locator('[class*="summarySuggestion"]').click();
  await expect(panel).toContainText("本地 mock 模型", { timeout: 30_000 });
  await expect(panel.locator('button[aria-label="发送"]')).toBeVisible({ timeout: 30_000 });
  await expect(panel).toContainText("1 个来源");

  const json = JSON.stringify(requestBody);
  const pages = [...json.matchAll(/<<<PAGE (\d+)>>>/g)].map((match) => Number(match[1]));
  expect([...new Set(pages)]).toEqual([1, 2, 3, 4, 5, 6]);

  // Inline, $$…$$ and \[…\] formulas all become KaTeX nodes.
  expect(await panel.locator(".katex").count()).toBeGreaterThanOrEqual(3);
  expect(await panel.locator(".katex-display").count()).toBeGreaterThanOrEqual(2);
});

test("long document summary is split into chunks", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/chat") && request.method() === "POST") {
      requests.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  await openSample(page, "sample-xlong.pdf");
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();
  await panel.locator('[class*="summarySuggestion"]').click();

  await expect.poll(() => requests.length, { timeout: 120_000 }).toBeGreaterThan(2);
  await expect(panel.locator('[class*="summaryStatus"]')).toBeHidden({ timeout: 120_000 });
  await expect(panel).toContainText("本地 mock 模型", { timeout: 30_000 });
  expect(requests.length).toBeGreaterThan(2);

  const allPages = new Set<number>();
  for (const request of requests) {
    const text = JSON.stringify(request);
    for (const match of text.matchAll(/<<<PAGE (\d+)>>>/g)) allPages.add(Number(match[1]));
  }
  expect(allPages.size).toBeGreaterThan(60);

  // Chunk summaries are cached per document/model, so a second run only makes
  // the final synthesis request.
  const before = requests.length;
  await panel.locator('button[aria-label="总结整份文档"]').click();
  await expect.poll(() => requests.length, { timeout: 60_000 }).toBeGreaterThan(before);
  await expect(panel.locator('[class*="summaryStatus"]')).toBeHidden({ timeout: 60_000 });
  expect(requests.length - before).toBe(1);
});

test("canvas re-renders at the new device pixel ratio after browser zoom", async ({ page }) => {
  await openSample(page);
  const canvas = page.locator('[data-page="1"] canvas');
  await expect(canvas).toBeVisible();

  // Simulate browser zoom / moving the window to a 3x monitor. The CSS
  // viewport does not change, only devicePixelRatio; the page must re-render
  // instead of letting the compositor upscale the old canvas. This also
  // guards the old 2.5x DPR ceiling, which left high-DPI text slightly soft.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 3,
    mobile: false,
  });

  await page.waitForFunction(
    () => {
      const element = document.querySelector<HTMLCanvasElement>('[data-page="1"] canvas');
      if (!element) return false;
      const width = element.getBoundingClientRect().width;
      return width > 0 && element.width / width > 2.8;
    },
    null,
    { timeout: 20_000 },
  );

  const ratio = await canvas.evaluate(
    (element) => (element as HTMLCanvasElement).width / element.getBoundingClientRect().width,
  );
  expect(ratio).toBeGreaterThan(2.8);
  expect(ratio).toBeLessThan(3.2);
});

test("color modes recolor pages, sync chrome and persist strength", async ({ page }) => {
  await openSample(page);
  const app = page.locator("[data-theme]").first();
  await expect(app).toHaveAttribute("data-theme", "paper");
  await expect(app).toHaveAttribute("data-color-mode", "original");

  const canvas = page.locator('[data-page="1"] canvas');
  const stats = () =>
    canvas.evaluate((element) => {
      const canvasElement = element as HTMLCanvasElement;
      const sample = document.createElement("canvas");
      sample.width = 24;
      sample.height = 24;
      const context = sample.getContext("2d");
      if (!context) return { luminance: 0, saturation: 0 };
      context.drawImage(canvasElement, 0, 0, 24, 24);
      const data = context.getImageData(0, 0, 24, 24).data;
      let luminance = 0;
      let saturation = 0;
      for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        luminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        saturation += Math.max(r, g, b) - Math.min(r, g, b);
      }
      const pixels = data.length / 4;
      return { luminance: luminance / pixels, saturation: saturation / pixels };
    });

  const original = await stats();

  const trigger = page.locator('[aria-label^="色彩模式"]');
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "色彩模式" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "智能暗色" }).click();
  await expect(app).toHaveAttribute("data-color-mode", "smart");
  await expect(app).toHaveAttribute("data-theme", "night");
  await page.waitForTimeout(250);
  const smart = await stats();
  expect(smart.luminance).toBeLessThan(original.luminance - 50);

  const slider = dialog.getByRole("slider", { name: "色彩强度" });
  await slider.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, 40);
  await expect(slider).toHaveAttribute("aria-valuetext", "40%");
  await page.waitForTimeout(150);
  const soft = await stats();
  expect(soft.luminance).toBeGreaterThan(smart.luminance);
  expect(soft.luminance).toBeLessThan(original.luminance);

  await slider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "100");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await dialog.getByRole("button", { name: "灰度" }).click();
  await expect(app).toHaveAttribute("data-theme", "paper");
  await page.waitForTimeout(250);
  const gray = await stats();
  expect(gray.saturation).toBeLessThan(4);

  await dialog.getByRole("button", { name: "护眼" }).click();
  await expect(app).toHaveAttribute("data-color-mode", "eye");
  await page.waitForTimeout(250);
  const eye = await stats();
  expect(eye.luminance).toBeGreaterThan(120);

  const headerBg = await page
    .locator("header")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(headerBg).toBe("rgb(246, 245, 242)");

  await dialog.getByRole("button", { name: "智能暗色" }).click();
  await expect(app).toHaveAttribute("data-theme", "night");
  const headerNight = await page
    .locator("header")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(headerNight).toBe("rgb(15, 19, 27)");

  await slider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "65");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(slider).toHaveAttribute("aria-valuetext", "65%");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "色彩模式" })).toBeVisible();

  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();
  const panelBg = await panel.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(panelBg).not.toBe("rgb(255, 255, 255)");
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-theme", "night");
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-color-mode", "smart");
  await expect(page.locator('[aria-label^="色彩模式"]')).toHaveAttribute(
    "aria-label",
    "色彩模式：智能暗色",
  );
  await page.locator('[aria-label^="色彩模式"]').click();
  await expect(
    page.getByRole("dialog", { name: "色彩模式" }).getByRole("slider", { name: "色彩强度" }),
  ).toHaveAttribute("aria-valuetext", "65%");

  await page.keyboard.press("Shift+D");
  await expect(page.locator("[data-theme]").first()).toHaveAttribute(
    "data-color-mode",
    "grayscale",
  );
});

test("virtualizes pages and mounts the jump target", async ({ page }) => {
  await openSample(page, "sample-long.pdf");
  const mounted = await page.locator("[data-page]").count();
  expect(mounted).toBeLessThan(10);
  expect(mounted).toBeGreaterThan(0);

  const pageInput = page.locator('header input[class*="pageInput"]');
  await pageInput.fill("30");
  await pageInput.press("Enter");
  await expect(page.getByText("当前第 30 页，共 32 页")).toBeAttached({ timeout: 10_000 });
  await expect(page.locator('[data-page="30"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-page="1"]')).toHaveCount(0);
  expect(await page.locator("[data-page]").count()).toBeLessThan(10);
});

test("virtualizes mixed page sizes without shifting the scroll height", async ({ page }) => {
  await openSample(page, "sample-mixed.pdf");
  const input = page.locator('header input[class*="pageInput"]');
  await input.fill("4");
  await input.press("Enter");
  await expect(page.getByText("当前第 4 页，共 40 页")).toBeAttached({ timeout: 10_000 });
  const tall = await page.locator('[data-page="4"]').evaluate((element) => {
    const viewport = document.querySelector<HTMLElement>("[data-reader]")!;
    return {
      height: element.getBoundingClientRect().height,
      scrollHeight: viewport.scrollHeight,
    };
  });

  await input.fill("5");
  await input.press("Enter");
  await expect(page.getByText("当前第 5 页，共 40 页")).toBeAttached({ timeout: 10_000 });
  const short = await page.locator('[data-page="5"]').evaluate((element) => {
    const viewport = document.querySelector<HTMLElement>("[data-reader]")!;
    return {
      height: element.getBoundingClientRect().height,
      scrollHeight: viewport.scrollHeight,
    };
  });

  expect(tall.height).toBeGreaterThan(short.height * 2);
  expect(Math.abs(tall.scrollHeight - short.scrollHeight)).toBeLessThan(5);
});

test("reopens a recent document from the local cache", async ({ page }) => {
  await openSample(page, "sample-small.pdf");
  await page.locator('button[aria-label="更多"]').click();
  await page.getByRole("menuitem", { name: /关闭文档/ }).click();
  await expect(page.getByText("最近文档")).toBeVisible({ timeout: 15_000 });
  const recent = page.locator('[class*="recentItem"]').filter({ hasText: "sample-small.pdf" });
  await expect(recent).toBeVisible();
  await recent.click();
  await expect(page.locator("header")).toContainText("sample-small.pdf", { timeout: 15_000 });
  await expect(page.locator('header [class*="pager"]')).toContainText("/ 3");
});

test("search highlights matches in the text layer", async ({ page }) => {
  await openSample(page);
  await page.keyboard.press("Control+F");
  const search = page.getByRole("dialog", { name: "搜索文档" });
  await search.locator("input").fill("上下文");

  const result = search.locator('[class*="searchResult"]').filter({ hasText: "P2" }).first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  await result.click();

  const hits = page.locator('[data-page="2"] span[class*="searchHit"]');
  await expect(hits.first()).toBeVisible({ timeout: 10_000 });
  expect(await hits.count()).toBeGreaterThan(0);

  // The clicked occurrence is scrolled into the upper-middle of the viewport,
  // not just the page top.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const viewport = document.querySelector<HTMLElement>("[data-reader]");
          const hit = document.querySelector<HTMLElement>(
            '[data-page="2"] span[class*="searchHit"]',
          );
          if (!viewport || !hit) return -1;
          const viewportRect = viewport.getBoundingClientRect();
          const rect = hit.getBoundingClientRect();
          const position = (rect.top - viewportRect.top) / viewportRect.height;
          return position > 0.02 && position < 0.45 ? 1 : 0;
        }),
      { timeout: 6_000 },
    )
    .toBe(1);

  await page.keyboard.press("Escape");
  await expect(page.locator('[class*="searchHit"]')).toHaveCount(0);
});

test("zoom controls, thinking effort and context budget", async ({ page }) => {
  await openSample(page);
  const zoomLabel = page.locator("header button[aria-label^='缩放 ']");
  const before = Number((await zoomLabel.innerText()).replace("%", ""));
  await page.getByRole("button", { name: "放大页面" }).click();
  await expect(zoomLabel).not.toHaveText(`${before}%`, { timeout: 5_000 });
  await page.getByRole("button", { name: "缩小页面" }).click();

  await zoomLabel.click();
  await page.getByRole("menuitem", { name: "适合页面" }).click();
  await page.waitForTimeout(500);
  const pageHeight = await page
    .locator('[data-page="1"]')
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(pageHeight).toBeLessThan(900);

  await page.locator('[aria-label="设置"]').last().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  const settingsBox = await settings.boundingBox();
  expect(settingsBox!.width).toBeGreaterThan(800);
  await expect(
    settings.getByRole("navigation", { name: "设置分类" }).getByRole("button"),
  ).toHaveCount(6);
  await settings.getByRole("button", { name: "对话", exact: true }).click();
  await settings.getByRole("button", { name: "128k", exact: true }).click();
  await settings.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(settings.getByRole("button", { name: "128k", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(settings.getByRole("button", { name: "关闭", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await settings.getByRole("button", { name: "关闭设置" }).click();

  let effort: string | null = null;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/chat") && request.method() === "POST") {
      effort = (request.postDataJSON() as { effort?: string }).effort ?? null;
    }
  });
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await panel.locator("textarea").fill("测试思考强度");
  await panel.locator('button[aria-label="发送"]').click();
  await expect(panel).toContainText("本地 mock 模型", { timeout: 20_000 });
  expect(effort).toBe("none");
});

test("settings dialog traps Tab focus and restores it", async ({ page }) => {
  await openSample(page);
  const trigger = page.locator('button[aria-label="设置"]').first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
    .toBe("设置");
});

test("privacy section opens the bundled privacy document", async ({ page }) => {
  await openSample(page);
  await page.locator('button[aria-label="设置"]').first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "隐私与数据", exact: true }).click();
  await settings.getByRole("button", { name: "查看完整隐私说明 →" }).click();
  const doc = page.getByRole("dialog", { name: "隐私说明" });
  await expect(doc).toBeVisible();
  await expect(doc).toContainText("本地处理");
  await expect(doc).toContainText("不会发送整份 PDF");
  await page.keyboard.press("Escape");
  await expect(doc).toBeHidden();
  await expect(settings).toBeVisible();
});

test("update check only runs on demand and reports a newer release", async ({ page }) => {
  const calls: string[] = [];
  await page.route(
    "https://api.github.com/repos/salt-fishes/pdf-ai-reader/releases/latest",
    (route) => {
      calls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tag_name: "v9.9.9",
          html_url: "https://example.com/releases/v9.9.9",
          body: "test release",
          published_at: "2026-12-01T00:00:00Z",
        }),
      });
    },
  );
  await openSample(page);
  await page.locator('button[aria-label="设置"]').first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "关于", exact: true }).click();
  expect(calls).toHaveLength(0);
  await settings.getByRole("button", { name: "检查更新" }).click();
  await expect(settings).toContainText("发现新版本 9.9.9");
  expect(calls).toHaveLength(1);
  await expect(settings.getByRole("link", { name: "打开发布页" })).toHaveAttribute(
    "href",
    "https://example.com/releases/v9.9.9",
  );
});

test("clearing all local data requires a second confirmation and reloads empty", async ({
  page,
}) => {
  await openSample(page);
  await page.locator('button[aria-label="设置"]').first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "隐私与数据", exact: true }).click();
  await settings.getByRole("button", { name: "清空所有本地数据" }).click();
  await expect(settings).toContainText("操作不可撤销");
  await Promise.all([
    page.waitForEvent("load"),
    settings.getByRole("button", { name: "再次点击确认清空所有本地数据" }).click(),
  ]);
  await expect(page.getByText("打开 PDF 开始阅读")).toBeVisible();
});

test("switching to an uninstalled OCR model asks first and cancel keeps the active model", async ({
  page,
}) => {
  let installs = 0;
  const models = [
    {
      id: "v6-tiny",
      label: "PP-OCRv6 tiny",
      speed: "fast",
      note: "",
      approxBytes: 6_270_385,
      installed: true,
      downloading: false,
      progress: 0,
    },
    {
      id: "v6-small",
      label: "PP-OCRv6 small",
      speed: "balanced",
      note: "",
      approxBytes: 12_000_000,
      installed: false,
      downloading: false,
      progress: 0,
    },
    {
      id: "v6-medium",
      label: "PP-OCRv6 medium",
      speed: "accurate",
      note: "",
      approxBytes: 27_000_000,
      installed: false,
      downloading: false,
      progress: 0,
    },
  ];
  await page.route("**/api/ocr/status", (route) =>
    route.fulfill({
      json: {
        installed: true,
        ready: true,
        downloading: false,
        downloaded: 0,
        total: 0,
        progress: 0,
        model: "PP-OCRv6 tiny",
        activeModel: "v6-tiny",
        availableModels: models,
        installedModels: ["v6-tiny"],
        error: null,
        dir: "models",
      },
    }),
  );
  await page.route("**/api/ocr/install", (route) => {
    installs += 1;
    return route.fulfill({ json: { ok: true, model: "v6-small" } });
  });
  await openSample(page);
  await page.locator('button[aria-label="设置"]').first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "扫描件 OCR", exact: true }).click();
  const ocr = settings.locator('[data-settings-section="ocr"]');
  await expect(ocr).toContainText("PP-OCRv6 tiny · 已安装");
  await ocr.getByRole("button", { name: "small", exact: true }).click();
  await expect(ocr).toContainText("尚未下载");
  expect(installs).toBe(0);
  await ocr.getByRole("button", { name: "取消", exact: true }).click();
  await expect(ocr).toContainText("PP-OCRv6 tiny · 已安装");
  expect(installs).toBe(0);
});

test("custom OCR mirror must be tested before saving and can be reset", async ({ page }) => {
  await page.route("**/api/ocr/status", (route) =>
    route.fulfill({
      json: {
        installed: true,
        ready: true,
        downloading: false,
        downloaded: 0,
        total: 0,
        progress: 0,
        model: "PP-OCRv6 tiny",
        activeModel: "v6-tiny",
        availableModels: [
          {
            id: "v6-tiny",
            label: "PP-OCRv6 tiny",
            speed: "fast",
            note: "",
            approxBytes: 6_270_385,
            installed: true,
            downloading: false,
            progress: 0,
          },
        ],
        installedModels: ["v6-tiny"],
        error: null,
        dir: "models",
      },
    }),
  );
  const source = {
    customBaseUrl: null as string | null,
    defaultBaseUrl: "https://github.com/GreatV/oar-ocr/releases/download/v0.7.0",
    officialBaseUrls: {
      tiny: "https://github.com/GreatV/oar-ocr/releases/download/v0.7.0",
      small: "https://huggingface.co",
      medium: "https://huggingface.co",
    },
    models: [
      {
        id: "v6-tiny",
        label: "PP-OCRv6 tiny",
        files: [
          {
            name: "det.onnx",
            url: "https://mirror.example.com/ppocrv6/pp-ocrv6_tiny_det.onnx",
            bytes: 1,
          },
        ],
      },
    ],
  };
  await page.route("**/api/ocr/source", (route) => {
    if (route.request().method() === "POST") {
      source.customBaseUrl = "https://mirror.example.com/ppocrv6";
      return route.fulfill({ json: { ok: true, source } });
    }
    return route.fulfill({ json: source });
  });
  await page.route("**/api/ocr/source/test", (route) =>
    route.fulfill({
      json: {
        baseUrl: "https://mirror.example.com/ppocrv6",
        ok: true,
        files: [
          {
            name: "det.onnx",
            url: "https://mirror.example.com/ppocrv6/pp-ocrv6_tiny_det.onnx",
            ok: true,
            status: 200,
            bytes: 1024,
          },
        ],
      },
    }),
  );
  await page.route("**/api/ocr/source/reset", (route) => {
    source.customBaseUrl = null;
    return route.fulfill({ json: { ok: true, source } });
  });

  await openSample(page);
  await page.locator('button[aria-label="设置"]').first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "扫描件 OCR", exact: true }).click();
  const ocr = settings.locator('[data-settings-section="ocr"]');
  await ocr.getByRole("button", { name: "自定义镜像", exact: true }).click();
  const input = ocr.locator('input[placeholder*="mirror.example.com"]');
  await input.fill("https://mirror.example.com/ppocrv6");
  const save = ocr.getByRole("button", { name: "保存", exact: true });
  await expect(save).toBeDisabled();
  await ocr.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(ocr).toContainText("3 个文件均可访问");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(ocr).toContainText("镜像已保存");
  await ocr.getByRole("button", { name: "恢复默认", exact: true }).click();
  await expect(ocr).toContainText("已恢复官方下载源");
});

test("axe scan finds no critical or serious issues in empty state and settings", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector("#root > div");
  let result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")),
  ).toEqual([]);

  await openSample(page);
  await page.locator('button[aria-label="设置"]').first().click();
  await page.getByRole("dialog", { name: "设置" }).waitFor();
  result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")),
  ).toEqual([]);
});

test("axe scan finds no critical or serious issues in the password dialog", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#root > div");
  await page.evaluate(async () => {
    const blob = await (await fetch("/samples/sample-encrypted.pdf")).blob();
    const file = new File([blob], "sample-encrypted.pdf", { type: "application/pdf" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    document
      .querySelector("#root > div")
      ?.dispatchEvent(
        new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }),
      );
  });
  await page.getByRole("dialog", { name: "输入 PDF 密码" }).waitFor();
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")),
  ).toEqual([]);
});

test("keyboard flow: open, minimize, close, search", async ({ page }) => {
  await openSample(page);

  await page.keyboard.press("Control+J");
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();
  await expect(panel.locator("textarea")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.locator("[data-assistant-fab]")).toBeVisible();

  await page.keyboard.press("Control+K");
  await expect(panel).toBeVisible();

  await page.keyboard.press("Alt+J");
  await expect(panel).toBeHidden();
  await expect(page.locator("[data-assistant-fab]")).toBeHidden();
  await expect(page.locator("[data-ai-entry]")).not.toHaveClass(/active/);

  await page.locator("[data-ai-entry]").click();
  await expect(panel).toBeVisible();

  await page.keyboard.press("Control+F");
  const search = page.locator('[role="dialog"][aria-label="搜索文档"]');
  await expect(search).toBeVisible();
  await search.locator("input").fill("上下文");
  await expect(search.locator('[class*="searchResult"]').first()).toBeVisible();
});

test("right-click removes a message from context and clear resets", async ({ page }) => {
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await panel.locator("textarea").fill("给我一个简短结论");
  await panel.locator('button[aria-label="发送"]').click();
  await expect(panel).toContainText("本地 mock 模型", { timeout: 20_000 });

  const assistant = panel.locator('[class*="assistantMessage"]').last();
  await assistant.click({ button: "right" });
  await page.getByRole("menuitem", { name: /从上下文移除/ }).click();
  await expect(assistant).toHaveClass(/excluded/);

  await panel.locator('button[aria-label="清空当前对话与上下文"]').click();
  await expect(panel.getByRole("alertdialog")).toContainText("PDF、页码和阅读位置保留");
  await panel.getByRole("button", { name: "清空", exact: true }).click();
  await expect(panel).not.toContainText("本地 mock 模型");
  await expect(panel).toContainText("1 个来源");
});

test("selection toolbar quotes text into the context", async ({ page }) => {
  await openSample(page);
  const page2 = page.locator('[data-page="2"]');
  await page2.scrollIntoViewIfNeeded();
  const span = page2.locator(".textLayer span").filter({ hasText: "阅读" }).first();
  await expect(span).toBeVisible({ timeout: 15_000 });

  const selectedText = await page.evaluate(() => {
    const pageElement = document.querySelector<HTMLElement>('[data-page="2"]');
    const target = [...(pageElement?.querySelectorAll<HTMLElement>(".textLayer span") ?? [])].find(
      (element) => (element.textContent ?? "").includes("阅读"),
    );
    if (!target) return "";
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    pageElement?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return selection?.toString() ?? "";
  });
  expect(selectedText.length).toBeGreaterThan(2);

  const toolbar = page.locator('[class*="selectionToolbar"]');
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: /引用/ }).click();

  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("2 个来源");
  await panel.locator('button[aria-label="上下文详情"]').click();
  await expect(panel).toContainText("选中");
});

test("inline PDF links navigate internally and expose external URLs", async ({ page }) => {
  await openSample(page, "sample-links.pdf");
  const external = page.locator('[data-page="1"] a[class*="link"]');
  await expect(external).toHaveCount(1);
  expect(await external.getAttribute("href")).toBe("https://openai.com/");

  await page.locator('[data-page="1"] button[class*="link"]').click();
  await expect(page.getByText("当前第 2 页，共 2 页")).toBeAttached({ timeout: 10_000 });
});

test("cross-page selection joins page ranges", async ({ page }) => {
  await openSample(page);
  await page.locator('[data-page="2"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-page="2"] .textLayer span').first()).toBeVisible({
    timeout: 15_000,
  });
  const selected = await page.evaluate(() => {
    const first = document.querySelector<HTMLElement>('[data-page="1"] .textLayer span');
    const second = document.querySelector<HTMLElement>('[data-page="2"] .textLayer span');
    if (!first?.firstChild || !second?.firstChild) return "";
    const range = document.createRange();
    range.setStart(first.firstChild, 0);
    range.setEnd(second.firstChild, Math.min(6, second.firstChild.nodeValue?.length ?? 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document
      .querySelector('[data-page="1"]')
      ?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return selection?.toString() ?? "";
  });
  expect(selected.length).toBeGreaterThan(10);

  const toolbar = page.locator('[class*="selectionToolbar"]');
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: /引用/ }).click();
  const panel = page.locator("[data-assistant-panel]");
  await panel.locator('button[aria-label="上下文详情"]').click();
  await expect(panel).toContainText("选中 · P1–P2");
});

test("highlights persist across reload and export as Markdown", async ({ page }) => {
  await openSample(page);
  const page2 = page.locator('[data-page="2"]');
  await page2.scrollIntoViewIfNeeded();
  await expect(page2.locator(".textLayer span").first()).toBeVisible({ timeout: 15_000 });

  const selectedText = await page.evaluate(() => {
    const pageElement = document.querySelector<HTMLElement>('[data-page="2"]');
    const target = [...(pageElement?.querySelectorAll<HTMLElement>(".textLayer span") ?? [])].find(
      (element) => (element.textContent ?? "").includes("阅读"),
    );
    if (!target) return "";
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    pageElement?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return selection?.toString() ?? "";
  });
  expect(selectedText.length).toBeGreaterThan(2);

  const toolbar = page.locator('[class*="selectionToolbar"]');
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: /高亮/ }).click();

  await page.locator('[aria-label="高亮"]').first().click();
  const sidebar = page.locator('aside[aria-label="高亮"]');
  await expect(sidebar).toContainText(selectedText.slice(0, 4));

  const downloadPromise = page.waitForEvent("download");
  await sidebar.getByRole("button", { name: "Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("highlights.md");

  await openSample(page);
  await page.locator('[aria-label="高亮"]').first().click();
  await expect(page.locator('aside[aria-label="高亮"]')).toContainText(selectedText.slice(0, 4));
});

test("highlight jump lands on the highlighted line, not the page top", async ({ page }) => {
  await openSample(page);
  const page2 = page.locator('[data-page="2"]');
  await page2.scrollIntoViewIfNeeded();
  await expect(page2.locator(".textLayer span").first()).toBeVisible({ timeout: 15_000 });

  const selectedText = await page.evaluate(() => {
    const pageElement = document.querySelector<HTMLElement>('[data-page="2"]');
    const spans = [...(pageElement?.querySelectorAll<HTMLElement>(".textLayer span") ?? [])];
    const target = spans.find((element) => (element.textContent ?? "").includes("阅读"));
    if (!target) return "";
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    pageElement?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return selection?.toString() ?? "";
  });
  expect(selectedText.length).toBeGreaterThan(2);

  const toolbar = page.locator('[class*="selectionToolbar"]');
  await toolbar.getByRole("button", { name: /高亮/ }).click();
  await page.locator('[aria-label="高亮"]').first().click();
  const sidebar = page.locator('aside[aria-label="高亮"]');
  await expect(sidebar).toContainText(selectedText.slice(0, 4));

  // Scroll far away, then jump from the sidebar.
  const pageInput = page.locator('header input[class*="pageInput"]');
  await pageInput.fill("5");
  await pageInput.press("Enter");
  await expect(page.getByText("当前第 5 页，共 6 页")).toBeAttached({ timeout: 10_000 });
  await sidebar.locator('[class*="highlightItem"]').first().click();

  const highlightPosition = () =>
    page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>("[data-reader]");
      const highlight = document.querySelector<HTMLElement>('[data-page="2"] [class*="highlight"]');
      if (!viewport || !highlight) return -1;
      const viewportRect = viewport.getBoundingClientRect();
      const rect = highlight.getBoundingClientRect();
      return (rect.top - viewportRect.top) / viewportRect.height;
    });

  await expect
    .poll(
      async () => {
        const position = await highlightPosition();
        return position > 0.06 && position < 0.45;
      },
      { timeout: 6_000 },
    )
    .toBe(true);
});

test("restores the saved scroll offset, not just the page number", async ({ page }) => {
  await openSample(page, "sample-long.pdf");
  await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("[data-reader]");
    if (viewport) viewport.scrollTop = 1800;
  });
  await page.waitForTimeout(1000);

  await openSample(page, "sample-long.pdf", { waitForText: false });
  await expect
    .poll(
      () =>
        page.evaluate(() => document.querySelector<HTMLElement>("[data-reader]")?.scrollTop ?? 0),
      { timeout: 8_000 },
    )
    .toBeGreaterThan(1750);
});

test("document switch keeps the old answer and does not leak it into the new document", async ({
  page,
}) => {
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  const question = "第一个文档的问题：这篇文档讲了什么？";
  await panel.locator("textarea").fill(question);
  await panel.locator('button[aria-label="发送"]').click();
  await expect(panel.locator('button[aria-label="停止生成"]')).toBeVisible();

  // Switch while the first answer is still streaming.
  await dropSample(page, "sample-long.pdf");
  await expect(panel).toContainText("直接提问，或从下面开始。", { timeout: 20_000 });
  await expect(panel).not.toContainText(question);

  // The new document can start its own run immediately.
  await panel.locator("textarea").fill("第二个文档的问题：总结当前页。");
  await panel.locator('button[aria-label="发送"]').click();
  await expect(panel).toContainText("本地 mock 模型", { timeout: 20_000 });
  await expect(panel.locator('button[aria-label="发送"]')).toBeVisible({ timeout: 20_000 });

  // Switching back restores the first document's answer.
  await dropSample(page, "sample-cn.pdf");
  await expect(panel).toContainText(question, { timeout: 20_000 });
  await expect(panel).toContainText("本地 mock 模型", { timeout: 20_000 });
  await expect(panel).not.toContainText("第二个文档的问题");
});

test("panel can be dragged, resized and restored after reload", async ({ page }) => {
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();
  await page.waitForTimeout(450);

  const before = await panel.boundingBox();
  if (!before) throw new Error("panel has no box");

  // Drag by the title area (header buttons keep their own pointer handling).
  const dragHandle = await panel.locator("[data-panel-drag]").boundingBox();
  if (!dragHandle) throw new Error("drag handle missing");
  await page.mouse.move(dragHandle.x + dragHandle.width / 2, dragHandle.y + dragHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    dragHandle.x + dragHandle.width / 2 - 120,
    dragHandle.y + dragHandle.height / 2 + 68,
    { steps: 6 },
  );
  await page.mouse.up();
  const after = await panel.boundingBox();
  expect(after!.x).toBeLessThan(before.x - 40);
  expect(after!.y).toBeGreaterThan(before.y + 30);

  // Resize from the bottom-right corner.
  const handle = await panel.locator('[class*="resizeSE"]').boundingBox();
  if (!handle) throw new Error("resize handle missing");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2 + 40, {
    steps: 6,
  });
  await page.mouse.up();
  const resized = await panel.boundingBox();
  expect(resized!.width).toBeGreaterThan(after!.width + 30);
  expect(resized!.height).toBeGreaterThan(after!.height + 20);

  // Reopen the same document after reload: geometry is restored.
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  await page.waitForTimeout(450);
  const restored = await page.locator("[data-assistant-panel]").boundingBox();
  expect(Math.abs((restored?.x ?? 0) - resized!.x)).toBeLessThan(12);
  expect(Math.abs((restored?.y ?? 0) - resized!.y)).toBeLessThan(12);
});

test("floating panel resizes from the bottom edge", async ({ page }) => {
  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();
  await page.waitForTimeout(450);

  const before = await panel.boundingBox();
  if (!before) throw new Error("panel has no box");
  const south = await panel.locator('[class*="resizeS"]').first().boundingBox();
  if (!south) throw new Error("south resize handle missing");
  await page.mouse.move(south.x + south.width / 2, south.y + 2);
  await page.mouse.down();
  await page.mouse.move(south.x + south.width / 2, south.y + 100, { steps: 10 });
  await page.mouse.up();
  const taller = await panel.boundingBox();
  expect(taller!.height).toBeGreaterThan(before.height + 60);

  const southAgain = await panel.locator('[class*="resizeS"]').first().boundingBox();
  if (!southAgain) throw new Error("south resize handle missing after resize");
  await page.mouse.move(southAgain.x + southAgain.width / 2, southAgain.y + 2);
  await page.mouse.down();
  await page.mouse.move(southAgain.x + southAgain.width / 2, southAgain.y - 70, { steps: 10 });
  await page.mouse.up();
  const shorter = await panel.boundingBox();
  expect(shorter!.height).toBeLessThan(taller!.height - 40);
});

test("responsive layout has no horizontal overflow at 1024 and 390", async ({ page }) => {
  for (const size of [
    { width: 1024, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await openSample(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.locator("[data-assistant-fab]").click();
    const panel = page.locator("[data-assistant-panel]");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(size.width - 8);
    await expect(panel.locator("textarea")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  }
});
