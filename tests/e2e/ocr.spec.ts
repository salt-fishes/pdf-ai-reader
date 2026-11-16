import { expect, test } from "@playwright/test";
import { openSample, registerMockGuard } from "./helpers";
registerMockGuard();
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

test("an uninstalled OCR runtime is a single explicit component download", async ({ page }) => {
  let runtimeInstalled = false;
  let installs = 0;
  await page.route("**/api/ocr/status", (route) =>
    route.fulfill({
      json: {
        installed: true,
        ready: runtimeInstalled,
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
            progress: 1,
          },
        ],
        installedModels: ["v6-tiny"],
        error: null,
        dir: "models",
        runtime: {
          installed: runtimeInstalled,
          downloading: false,
          downloaded: 0,
          total: 0,
          progress: runtimeInstalled ? 1 : 0,
          approxBytes: 74_000_000,
          downloadable: true,
          error: null,
        },
      },
    }),
  );
  await page.route("**/api/ocr/install", (route) => {
    installs += 1;
    runtimeInstalled = true;
    return route.fulfill({ json: { ok: true, model: "v6-tiny", runtime: true } });
  });

  await openSample(page);
  await page.locator('button[aria-label="设置"]').first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "扫描件 OCR", exact: true }).click();
  const ocr = settings.locator('[data-settings-section="ocr"]');
  await expect(ocr).toContainText("组件未安装");
  const tiny = ocr.getByRole("button", { name: "tiny", exact: true });
  await expect(tiny).toBeDisabled();
  await ocr.getByRole("button", { name: /下载 OCR 组件/ }).click();
  await expect.poll(() => installs).toBe(1);
  await expect(ocr).toContainText("已安装");
});
