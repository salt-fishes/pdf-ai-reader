import { expect, test } from "@playwright/test";
import { openSample, registerMockGuard } from "./helpers";
registerMockGuard();
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
