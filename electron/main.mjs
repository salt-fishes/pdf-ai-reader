import { app, BrowserWindow, dialog, ipcMain, net, session, shell } from "electron";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  associationPowerShellScript,
  pdfAssociationStatus,
  registerPdfAssociation,
  removePdfAssociation,
  removeUserPdfRegistration,
  unsupportedPdfAssociation,
} from "./pdf-association.mjs";
import { pdfArgFrom, readPdfPayload } from "./pdf-args.mjs";

const exec = promisify(execFile);

const DEV_URL = process.env.PDF_AI_DESKTOP_URL;
const APP_PORT = 8787;
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const RELEASES_API = "https://api.github.com/repos/salt-fishes/pdf-ai-reader/releases/latest";
const isDev = Boolean(DEV_URL);
const PDF_ASSOCIATION_SUPPORTED =
  process.platform === "win32" && !/electron\.exe$/i.test(process.execPath);
const POWERSHELL = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
const IS_WINDOWS = process.platform === "win32";
const TITLEBAR_HEIGHT = 52;
const TITLEBAR_COLORS = {
  light: { color: "#f6f3ed", symbolColor: "#1b1a22" },
  dark: { color: "#121016", symbolColor: "#ece8e2" },
};

let serverProcess = null;
let window = null;
let rendererReady = false;
/** One-slot queue shared by startup and second-instance file opens. */
let pendingPdf = null;
/** Startup path, read lazily after the app is ready. */
let pendingPdfPath = pdfArgFrom(process.argv);

function appIconPath() {
  const appDir = app.getAppPath();
  const production = join(appDir, "dist", "icon.png");
  if (existsSync(production)) return production;
  return join(appDir, "public", "icon.png");
}

async function queuePdfFile(file) {
  try {
    pendingPdf = await readPdfPayload(file);
    return pendingPdf;
  } catch (error) {
    console.error("[pdf-open]", error instanceof Error ? error.message : error);
    return null;
  }
}

async function consumePendingPdf() {
  if (!pendingPdf && pendingPdfPath) {
    const file = pendingPdfPath;
    pendingPdfPath = null;
    await queuePdfFile(file);
  }
  const payload = pendingPdf;
  pendingPdf = null;
  return payload;
}

// Trim Chromium background work that this single-window reader never uses.
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-features", "MediaSessionService,HardwareMediaKeyHandling");

const SPLASH_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="color-scheme" content="light"><title>文疏</title>
<style>
*{box-sizing:border-box}html,body{height:100%}body{margin:0;display:grid;place-items:center;
background:#f6f3ed;color:#1b1a22;font-family:"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif}
main{display:flex;flex-direction:column;align-items:center;gap:14px;transform:translateY(-12px)}
.mark{width:64px;height:64px;display:grid;place-items:center;
filter:drop-shadow(0 18px 30px rgb(27 26 34 / 24%))}
h1{margin:0;font-size:24px;font-weight:600;letter-spacing:.04em}
p{margin:0;color:#66626d;font-size:13px}
.dots{display:flex;gap:6px;margin-top:6px}
.dots i{width:6px;height:6px;border-radius:50%;background:#c2410c;opacity:.25;animation:pulse 1.2s ease-in-out infinite}
.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes pulse{50%{opacity:.9;transform:scale(1.15)}}
@media (prefers-reduced-motion:reduce){.dots i{animation:none;opacity:.55}}
</style></head><body><main>
<div class="mark"><svg width="64" height="64" viewBox="0 0 512 512" fill="none">
<rect width="512" height="512" rx="116" fill="#14131A"/>
<rect x="104" y="88" width="58" height="336" rx="20" fill="#FF7A59"/>
<rect x="184" y="88" width="222" height="336" rx="26" fill="#FFFDF7"/>
<path d="M344 327c1.6 20.9 10.1 29.4 31 31-20.9 1.6-29.4 10.1-31 31-1.6-20.9-10.1-29.4-31-31 20.9-1.6 29.4-10.1 31-31Z" fill="#FF7A59"/>
</svg></div><h1>文疏</h1><p>正在启动本地阅读环境…</p><div class="dots"><i></i><i></i><i></i></div>
</main></body></html>`;
const SPLASH_URL = `data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`;

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
  if (!match) return null;
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePrerelease(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    if (a[index] === b[index]) continue;
    const aNumber = /^\d+$/.test(a[index]);
    const bNumber = /^\d+$/.test(b[index]);
    if (aNumber && bNumber) return Number(a[index]) > Number(b[index]) ? 1 : -1;
    if (aNumber) return -1;
    if (bNumber) return 1;
    return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function isNewer(current, latest) {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (b.numbers[index] !== a.numbers[index]) return b.numbers[index] > a.numbers[index];
  }
  return comparePrerelease(b.prerelease, a.prerelease) > 0;
}

function currentAssociationStatus() {
  return PDF_ASSOCIATION_SUPPORTED
    ? pdfAssociationStatus(process.execPath)
    : Promise.resolve(unsupportedPdfAssociation());
}

/** Heal installs that registered both scopes before 0.8.1. */
async function cleanupDuplicatePdfRegistration() {
  if (!PDF_ASSOCIATION_SUPPORTED) return;
  try {
    const status = await currentAssociationStatus();
    if (status.registered && status.scope === "machine") {
      await removeUserPdfRegistration();
    }
  } catch {
    // Registration status is advisory; startup must not fail because of it.
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Windows 11 lists both per-user and machine-wide registrations. A machine-wide
 * entry makes the app available to every account, so run the registry writes in
 * an elevated PowerShell process.
 */
function associationScript(scope, mode) {
  return associationPowerShellScript({ exePath: process.execPath, scope, mode });
}

async function runElevatedAssociation(scope, mode) {
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logFile = join(tmpdir(), `paper-reader-assoc-${stamp}.log`);
  const scriptFile = join(tmpdir(), `paper-reader-assoc-${stamp}.ps1`);
  // Start-Process cannot combine -Verb RunAs with redirected output, so the
  // elevated script writes its own log. The script goes to a BOM-prefixed file:
  // passing it through -EncodedCommand makes UAC fail silently with longer
  // scripts, leaving no log at all.
  const wrapped = [
    "$ErrorActionPreference = 'Stop'",
    `$log = ${psQuote(logFile)}`,
    "try {",
    `  'starting' | Set-Content -Path $log -Encoding utf8`,
    ...associationScript(scope, mode)
      .split("\r\n")
      .map((line) => `  ${line}`),
    `  'ok' | Add-Content -Path $log -Encoding utf8`,
    "} catch {",
    "  ($_ | Out-String) | Add-Content -Path $log -Encoding utf8",
    "  exit 1",
    "}",
  ].join("\r\n");
  await writeFile(scriptFile, `\uFEFF${wrapped}`, "utf8");
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    `  $p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','"${scriptFile}"')`,
    "} catch {",
    "  if ($_.Exception.NativeErrorCode -eq 1223 -or ($_.Exception.HResult -band 0xFFFF) -eq 1223) { exit 1223 }",
    "  [Console]::Error.WriteLine($_.Exception.Message)",
    "  exit 1",
    "}",
    "exit $p.ExitCode",
  ].join("\r\n");
  try {
    await exec(POWERSHELL, ["-NoProfile", "-Command", command], {
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 256 * 1024,
    });
  } catch (error) {
    const code = error?.code ?? error?.status;
    if (code === 1223 || /canceled|cancelled|已取消/i.test(String(error?.message))) {
      throw new Error("已取消管理员授权，未修改系统级关联。");
    }
    const output = (await readFile(logFile, "utf8").catch(() => "")).trim();
    const detail = output
      ? output.slice(-1600)
      : error instanceof Error
        ? error.message
        : "需要管理员权限";
    throw new Error(`系统级注册失败：${detail}`);
  } finally {
    await Promise.all([
      unlink(logFile).catch(() => undefined),
      unlink(scriptFile).catch(() => undefined),
    ]);
  }
}

ipcMain.handle("app:pdf-association-status", () => currentAssociationStatus());

ipcMain.handle("app:pdf-association-register", async (_event, scope = "user") => {
  if (!PDF_ASSOCIATION_SUPPORTED) {
    throw new Error("只有 Windows 桌面版支持注册 PDF 打开方式。");
  }
  if (scope === "machine") {
    await runElevatedAssociation("machine", "register");
    // A machine-wide entry wins; remove the per-user copy so Settings does not
    // list 文疏 twice.
    await removeUserPdfRegistration().catch(() => undefined);
    return currentAssociationStatus();
  }
  return registerPdfAssociation(process.execPath, "user");
});

ipcMain.handle("app:pdf-association-remove", async (_event, requestedScope) => {
  if (!PDF_ASSOCIATION_SUPPORTED) {
    throw new Error("只有 Windows 桌面版支持移除 PDF 打开方式。");
  }
  const status = await currentAssociationStatus();
  if (status.isDefault) {
    throw new Error("文疏当前是默认 PDF 应用，请先在 Windows 设置中改为其他应用，再移除关联。");
  }
  const scope = requestedScope ?? status.scope ?? "user";
  if (scope === "machine") {
    await runElevatedAssociation("machine", "remove");
    await removePdfAssociation(process.execPath, "user").catch(() => undefined);
    return currentAssociationStatus();
  }
  return removePdfAssociation(process.execPath, "user");
});

ipcMain.handle("app:pdf-association-open-settings", async () => {
  if (!PDF_ASSOCIATION_SUPPORTED) {
    throw new Error("只有 Windows 桌面版支持打开默认应用设置。");
  }
  const status = await currentAssociationStatus();
  // Windows uses different deep-link parameters for per-user and machine-wide
  // registrations; passing the wrong one opens the page without selecting the
  // app.
  const parameter = status.scope === "machine" ? "registeredAppMachine" : "registeredAppUser";
  try {
    await shell.openExternal(
      status.registered
        ? `ms-settings:defaultapps?${parameter}=${encodeURIComponent(status.appName)}`
        : "ms-settings:defaultapps",
    );
  } catch {
    await shell.openExternal("ms-settings:defaultapps");
  }
  return status;
});

ipcMain.handle("app:check-for-updates", async () => {
  const current = app.getVersion();
  const response = await net.fetch(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "paper-reader" },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 403 || response.status === 429) {
    throw new Error("GitHub API 请求过于频繁，请稍后重试。");
  }
  if (!response.ok) {
    throw new Error(`无法连接 GitHub（HTTP ${response.status}），请稍后重试。`);
  }
  const data = await response.json();
  const latest = String(data.tag_name ?? "").replace(/^v/, "");
  if (!parseVersion(latest)) throw new Error("最新的发布标签不是有效版本号，无法比较。");
  return {
    current,
    latest,
    hasUpdate: isNewer(current, latest),
    url: data.html_url || `https://github.com/salt-fishes/pdf-ai-reader/releases/tag/v${latest}`,
    notes: String(data.body ?? "").slice(0, 4000),
    publishedAt: data.published_at,
  };
});

ipcMain.handle("app:open-data-folder", async () => {
  const result = await shell.openPath(app.getPath("userData"));
  if (result) throw new Error(result);
});

ipcMain.handle("app:take-pending-pdf", async () => consumePendingPdf());

ipcMain.on("app:renderer-ready", (event) => {
  if (window && event.sender === window.webContents) rendererReady = true;
});

ipcMain.handle("window:set-titlebar-theme", (event, dark) => {
  if (!IS_WINDOWS) return;
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target || target.isDestroyed()) return;
  target.setTitleBarOverlay({
    ...(dark ? TITLEBAR_COLORS.dark : TITLEBAR_COLORS.light),
    height: TITLEBAR_HEIGHT,
  });
});

async function waitForHealth(url, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(800),
      });
      if (response.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/**
 * Node fetch does not read the Windows proxy settings. Resolve the proxy that
 * Electron's net stack would use and pass it to the local server so OCR pack
 * and model downloads work behind a system proxy or VPN client.
 */
async function systemProxyEnv() {
  try {
    const resolved = await session.defaultSession.resolveProxy("https://github.com");
    const match = /(?:PROXY|HTTPS)\s+([^;\s]+)/i.exec(resolved);
    if (!match) return {};
    const server = /^[a-z]+:\/\//i.test(match[1]) ? match[1] : `http://${match[1]}`;
    return { HTTPS_PROXY: server, HTTP_PROXY: server };
  } catch {
    return {};
  }
}

async function startServer() {
  if (isDev) return DEV_URL;
  if (await waitForHealth(APP_ORIGIN, 600)) {
    throw new Error("端口 8787 已被占用，请先关闭正在运行的代理或其他文疏实例。");
  }

  const appDir = app.getAppPath();
  const entry = join(appDir, "server", "dist", "index.mjs");
  const userData = app.getPath("userData");
  const proxyEnv = await systemProxyEnv();
  serverProcess = spawn(process.execPath, [entry], {
    cwd: appDir,
    env: {
      ...process.env,
      ...proxyEnv,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: "127.0.0.1",
      PORT: String(APP_PORT),
      PDF_AI_DATA_DIR: join(userData, "data"),
      OCR_MODEL_DIR: join(userData, "ocr-models"),
      OCR_RUNTIME_DIR: join(userData, "ocr-runtime"),
      OCR_PACK_VERSION: app.getVersion(),
      APP_ORIGIN,
      NODE_ENV: "production",
      NO_PROXY: [process.env.NO_PROXY, "127.0.0.1,localhost"].filter(Boolean).join(","),
    },
    stdio: "ignore",
    windowsHide: true,
  });
  serverProcess.on("error", (error) => {
    console.error("server failed", error);
  });

  if (!(await waitForHealth(APP_ORIGIN))) {
    throw new Error("本地代理启动超时。请检查 8787 端口和安装目录。");
  }
  return APP_ORIGIN;
}

async function createWindow() {
  const started = Date.now();
  window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#f6f3ed",
    autoHideMenuBar: true,
    title: "文疏 · PDF 阅读器",
    icon: appIconPath(),
    ...(IS_WINDOWS
      ? {
          titleBarStyle: "hidden",
          titleBarOverlay: { ...TITLEBAR_COLORS.light, height: TITLEBAR_HEIGHT },
        }
      : {}),
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.once("ready-to-show", () => window?.show());
  window.webContents.on("did-start-loading", () => {
    rendererReady = false;
  });
  window.on("closed", () => {
    rendererReady = false;
    window = null;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    try {
      const allowed = new URL(DEV_URL ?? APP_ORIGIN).origin;
      if (new URL(url).origin !== allowed) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  // Show the branded shell immediately; the local proxy starts in parallel.
  const serverReady = startServer();
  await window.loadURL(SPLASH_URL);
  const splashAt = Date.now() - started;
  const origin = await serverReady;
  const serverAt = Date.now() - started;
  // Include the app version in the initial URL so an older Chromium cache
  // cannot keep serving the previous release's index.html after an update.
  const appUrl = isDev ? origin : `${origin}/?v=${encodeURIComponent(app.getVersion())}`;
  await window.loadURL(appUrl);
  console.log(
    `[startup] splash ${splashAt}ms · proxy ${serverAt}ms · app ${Date.now() - started}ms`,
  );
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", async (_event, argv) => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();

    const file = pdfArgFrom(argv);
    if (!file) return;
    const payload = await queuePdfFile(file);
    if (!payload) return;
    if (rendererReady && !window.webContents.isLoadingMainFrame()) {
      pendingPdf = null;
      window.webContents.send("app:open-pdf", payload);
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("cn.paperreader.app");
    try {
      await createWindow();
      void cleanupDuplicatePdfRegistration();
    } catch (error) {
      dialog.showErrorBox("文疏启动失败", error instanceof Error ? error.message : String(error));
      app.quit();
    }
    app.on("activate", () => {
      if (!window) void createWindow();
    });
  });
}

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
