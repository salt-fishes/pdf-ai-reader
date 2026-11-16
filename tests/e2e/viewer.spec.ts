import { expect, test } from "@playwright/test";
import { openSample, registerMockGuard } from "./helpers";
registerMockGuard();
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
  const viewport = page.locator("[data-reader]");
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight * 0.8;
  });
  await page.waitForTimeout(300);
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
