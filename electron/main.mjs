import { app, BrowserWindow, dialog, ipcMain, net, session, shell } from "electron";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  pdfAssociationStatus,
  registerPdfAssociation,
  removePdfAssociation,
  unsupportedPdfAssociation,
} from "./pdf-association.mjs";

const DEV_URL = process.env.PDF_AI_DESKTOP_URL;
const APP_PORT = 8787;
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const RELEASES_API = "https://api.github.com/repos/salt-fishes/pdf-ai-reader/releases/latest";
const isDev = Boolean(DEV_URL);
const PDF_ASSOCIATION_SUPPORTED =
  process.platform === "win32" && !/electron\.exe$/i.test(process.execPath);

// Trim Chromium background work that this single-window reader never uses.
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-features", "MediaSessionService,HardwareMediaKeyHandling");

const SPLASH_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="color-scheme" content="light"><title>纸间</title>
<style>
*{box-sizing:border-box}html,body{height:100%}body{margin:0;display:grid;place-items:center;
background:#f6f5f2;color:#18202f;font-family:"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif}
main{display:flex;flex-direction:column;align-items:center;gap:14px;transform:translateY(-12px)}
.mark{width:64px;height:64px;border-radius:18px;background:#5b5bd6;display:grid;place-items:center;
box-shadow:0 18px 40px -18px rgb(91 91 214 / 65%)}
h1{margin:0;font-size:24px;font-weight:600;letter-spacing:.04em}
p{margin:0;color:#5f6675;font-size:13px}
.dots{display:flex;gap:6px;margin-top:6px}
.dots i{width:6px;height:6px;border-radius:50%;background:#5b5bd6;opacity:.25;animation:pulse 1.2s ease-in-out infinite}
.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes pulse{50%{opacity:.9;transform:scale(1.15)}}
@media (prefers-reduced-motion:reduce){.dots i{animation:none;opacity:.55}}
</style></head><body><main>
<div class="mark"><svg width="38" height="38" viewBox="0 0 24 24" fill="none">
<rect x="3.2" y="2.4" width="17.6" height="19.2" rx="4.2" fill="#fff" opacity=".16"/>
<path d="M7.4 7.4h6.1M7.4 11h9.2M7.4 14.6h5.2" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>
<path d="M16.5 13.2c.2 2.2 1.3 3.3 3.5 3.5-2.2.2-3.3 1.3-3.5 3.5-.2-2.2-1.3-3.3-3.5-3.5 2.2-.2 3.3-1.3 3.5-3.5Z" fill="#fff"/>
</svg></div><h1>纸间</h1><p>正在启动本地阅读环境…</p><div class="dots"><i></i><i></i><i></i></div>
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

ipcMain.handle("app:pdf-association-status", () => currentAssociationStatus());

ipcMain.handle("app:pdf-association-register", async () => {
  if (!PDF_ASSOCIATION_SUPPORTED) {
    throw new Error("只有 Windows 桌面版支持注册 PDF 打开方式。");
  }
  return registerPdfAssociation(process.execPath);
});

ipcMain.handle("app:pdf-association-remove", async () => {
  if (!PDF_ASSOCIATION_SUPPORTED) {
    throw new Error("只有 Windows 桌面版支持移除 PDF 打开方式。");
  }
  return removePdfAssociation(process.execPath);
});

ipcMain.handle("app:pdf-association-open-settings", async () => {
  if (!PDF_ASSOCIATION_SUPPORTED) {
    throw new Error("只有 Windows 桌面版支持打开默认应用设置。");
  }
  try {
    await shell.openExternal("ms-settings:defaultapps?registeredAppUser=PaperReader");
  } catch {
    await shell.openExternal("ms-settings:defaultapps");
  }
  return currentAssociationStatus();
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

let serverProcess = null;
let window = null;

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
    throw new Error("端口 8787 已被占用，请先关闭正在运行的代理或其他纸间实例。");
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
    backgroundColor: "#f6f5f2",
    autoHideMenuBar: true,
    title: "纸间 · PDF × AI 阅读器",
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.once("ready-to-show", () => window?.show());
  window.on("closed", () => {
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
  await window.loadURL(origin);
  console.log(
    `[startup] splash ${splashAt}ms · proxy ${serverAt}ms · app ${Date.now() - started}ms`,
  );
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("cn.paperreader.app");
    try {
      await createWindow();
    } catch (error) {
      dialog.showErrorBox("纸间启动失败", error instanceof Error ? error.message : String(error));
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
