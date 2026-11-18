import { expect, test } from "@playwright/test";
import { dropSample, openSample, registerMockGuard } from "./helpers";
registerMockGuard();
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

  // The quiet badge in the top-right corner lists every source.
  const citationBadge = panel.getByRole("button", { name: "查看引用" }).last();
  await citationBadge.click();
  const citationMenu = panel.getByRole("menu", { name: "引用来源" });
  await expect(citationMenu).toBeVisible();
  await expect(citationMenu).toContainText("p.2");
  await page.keyboard.press("Escape");
  await expect(citationMenu).toBeHidden();
  await expect(panel).toBeVisible();

  // Context details show the provider usage buckets.
  const contextButton = panel.locator('button[aria-label="上下文详情"]');
  if ((await contextButton.getAttribute("aria-expanded")) !== "true") {
    await contextButton.click();
  }
  await expect(panel).toContainText("缓存命中");
  await expect(panel).toContainText("输入");

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

test("line-level citations jump to the quoted line and flash", async ({ page }) => {
  await openSample(page);
  const quote = await page.evaluate(() => {
    const spans = [...document.querySelectorAll<HTMLElement>('[data-page="2"] .textLayer span')];
    const span = spans.find((element) => (element.textContent ?? "").trim().length >= 8);
    return (span?.textContent ?? "").replace(/\s+/g, " ").replace(/\]/g, "").trim().slice(0, 24);
  });
  expect(quote.length).toBeGreaterThan(7);

  await page.route("**/api/chat", async (route) => {
    const answer = `这段的重点是 [[p.2|${quote}]]，可以回到原文定位。`;
    const payload = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}`,
      "",
      `data: ${JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: 120,
          prompt_cache_hit_tokens: 20,
          prompt_cache_miss_tokens: 100,
          completion_tokens: 30,
        },
      })}`,
      "",
      "data: [DONE]",
      "",
      "",
    ].join("\n");
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: payload,
    });
  });

  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();
  await panel.locator("textarea").fill("第 2 页这句话在哪里？");
  await panel.locator('button[aria-label="发送"]').click();

  const badge = panel.getByRole("button", { name: "查看引用" }).last();
  await expect(badge).toBeVisible({ timeout: 20_000 });
  await badge.click();
  const menu = panel.getByRole("menu", { name: "引用来源" });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText(quote.slice(0, 8));
  await expect(menu).toContainText(/\d+ 行/);

  await menu.locator('[role="menuitem"]').first().click();
  const flash = page.locator('[data-page="2"] span[class*="citationFlash"]').first();
  await expect(flash).toBeVisible({ timeout: 10_000 });
  await expect(flash).toBeHidden({ timeout: 6_000 });
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

  await panel.locator('button[aria-label="更多操作"]').click();
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

test("document-only mode disables external knowledge and marks general answers", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | null = null;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/chat") && request.method() === "POST") {
      requestBody = request.postDataJSON() as Record<string, unknown>;
    }
  });
  await page.route("**/api/chat", async (route) => {
    const answer = "这是文档之外的通用知识，不引用页码。";
    const payload = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}`,
      "",
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 80, completion_tokens: 12 } })}`,
      "",
      "data: [DONE]",
      "",
      "",
    ].join("\n");
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: payload,
    });
  });

  await openSample(page);
  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();

  await panel.locator('button[aria-label="更多操作"]').click();
  const docOnly = panel.getByRole("menuitemcheckbox", { name: /仅依据文档/ });
  await expect(docOnly).toHaveAttribute("aria-checked", "false");
  await docOnly.click();
  await expect(docOnly).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("button", { name: "仅依据文档，点击关闭" })).toBeVisible();

  await panel.locator("textarea").fill("Transformer 是什么？");
  await panel.locator('button[aria-label="发送"]').click();
  await expect(panel).toContainText("这是文档之外的通用知识");
  await expect(panel.getByLabel("通用知识，非文档内容")).toBeVisible();

  const body = requestBody as unknown as {
    documentOnly?: boolean;
    messages: Array<{ role: string; content: unknown }>;
  };
  expect(body.documentOnly).toBe(true);
  expect(String(body.messages[0].content)).toContain("本次只依据");
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
