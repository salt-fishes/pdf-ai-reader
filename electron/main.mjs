import { app, BrowserWindow, dialog, shell } from "electron";
import { spawn } from "node:child_process";
import { join } from "node:path";

const DEV_URL = process.env.PDF_AI_DESKTOP_URL;
const APP_PORT = 8787;
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const isDev = Boolean(DEV_URL);

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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function startServer() {
  if (isDev) return DEV_URL;
  if (await waitForHealth(APP_ORIGIN, 600)) {
    throw new Error("端口 8787 已被占用，请先关闭正在运行的代理或其他纸间实例。");
  }

  const appDir = app.getAppPath();
  const entry = join(appDir, "server", "dist", "index.mjs");
  const userData = app.getPath("userData");
  serverProcess = spawn(process.execPath, [entry], {
    cwd: appDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: "127.0.0.1",
      PORT: String(APP_PORT),
      PDF_AI_DATA_DIR: join(userData, "data"),
      OCR_MODEL_DIR: join(userData, "ocr-models"),
      APP_ORIGIN,
      NODE_ENV: "production",
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
  const origin = await startServer();
  window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#f4f2ec",
    autoHideMenuBar: true,
    title: "纸间 · PDF × AI 阅读器",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window?.show());
  window.on("closed", () => {
    window = null;
  });

  const allowedOrigin = new URL(origin).origin;
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== allowedOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  await window.loadURL(origin);
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
