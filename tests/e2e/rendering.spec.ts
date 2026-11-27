import { expect, test } from "@playwright/test";
import { dropFixture, openSample, registerMockGuard } from "./helpers";
registerMockGuard();
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

test("color modes recolor pages and persist independently from app theme", async ({ page }) => {
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
  await expect(app).toHaveAttribute("data-theme", "paper");
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
  const tokenColor = (name: string) =>
    page.evaluate((token) => {
      // Theme variables live on the app shell, not :root; read them inside the
      // header so the probe resolves the same scope as the header background.
      const host = document.querySelector("header") ?? document.body;
      const probe = document.createElement("span");
      probe.style.color = `var(${token})`;
      host.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }, name);
  expect(headerBg).toBe(await tokenColor("--paper"));

  await page.keyboard.press("Escape");
  await page.locator('button[aria-label="设置"]').first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "深色 低亮度界面，适合夜间使用" }).click();
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await expect(app).toHaveAttribute("data-theme", "night");
  const headerNight = await page
    .locator("header")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(headerNight).toBe(await tokenColor("--paper"));

  await trigger.click();
  const colorDialog = page.getByRole("dialog", { name: "色彩模式" });
  await colorDialog.getByRole("button", { name: "智能暗色" }).click();
  const intensity = colorDialog.getByRole("slider", { name: "色彩强度" });
  await intensity.evaluate((element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "65");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(intensity).toHaveAttribute("aria-valuetext", "65%");
  await page.keyboard.press("Escape");
  await expect(colorDialog).toBeHidden();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "色彩模式" })).toBeVisible();

  await page.locator("[data-assistant-fab]").click();
  const panel = page.locator("[data-assistant-panel]");
  await expect(panel).toBeVisible();
  const panelBg = await panel.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(panelBg).not.toBe("rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(650);

  await page.reload();
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-theme", "night");
  await openSample(page);
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

test("full-strength invert keeps raw canvas pixels crisp", async ({ page }) => {
  await openSample(page);
  const sample = () =>
    page.locator('[data-page="1"] canvas').evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (!context) return [];
      const x = Math.max(0, Math.floor(canvas.width / 2) - 32);
      const y = Math.max(0, Math.floor(canvas.height / 2) - 32);
      return Array.from(context.getImageData(x, y, 64, 64).data);
    });

  const original = await sample();
  await page.locator('[aria-label^="色彩模式"]').click();
  const dialog = page.getByRole("dialog", { name: "色彩模式" });
  await dialog.getByRole("button", { name: "反转" }).click();
  await page.waitForTimeout(250);
  const inverted = await sample();
  expect(inverted.length).toBe(original.length);
  let maxError = 0;
  for (let index = 0; index < original.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      maxError = Math.max(
        maxError,
        Math.abs(original[index + channel] - (255 - inverted[index + channel])),
      );
    }
  }
  expect(maxError).toBeLessThanOrEqual(1);
});

test("application theme and per-document PDF color stay independent", async ({ page }) => {
  await openSample(page, "sample-cn.pdf");
  await page.locator('[aria-label^="色彩模式"]').click();
  await page
    .getByRole("dialog", { name: "色彩模式" })
    .getByRole("button", { name: "智能暗色" })
    .click();
  await page.keyboard.press("Escape");

  const app = page.locator("[data-theme]").first();
  await expect(app).toHaveAttribute("data-color-mode", "smart");
  await expect(app).toHaveAttribute("data-theme", "paper");

  await page.locator('button[aria-label="设置"]').first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "深色 低亮度界面，适合夜间使用" }).click();
  await expect(settings).toHaveAttribute("data-theme", "night");
  await expect(app).toHaveAttribute("data-theme", "night");
  await expect(app).toHaveAttribute("data-color-mode", "smart");
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await page.waitForTimeout(650);

  await openSample(page, "sample-cn.pdf");
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-color-mode", "smart");
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-theme", "night");

  await dropFixture(page, "sample-small.pdf");
  await expect(page.locator('[data-page="1"] .textLayer span').first()).toBeVisible();
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-color-mode", "original");
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-theme", "night");
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
