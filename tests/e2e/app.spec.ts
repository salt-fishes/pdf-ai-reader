import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dropFixture, openSample, registerMockGuard } from "./helpers";
registerMockGuard();
test("opens a password-protected PDF without losing the current document", async ({ page }) => {
  await openSample(page);
  await dropFixture(page, "sample-encrypted.pdf", { waitForHeader: false });

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
  await dropFixture(page, "sample-encrypted.pdf", { waitForHeader: false });
  await page.getByRole("dialog", { name: "输入 PDF 密码" }).waitFor();
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")),
  ).toEqual([]);
});
