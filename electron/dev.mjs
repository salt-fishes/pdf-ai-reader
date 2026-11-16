import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const isWindows = process.platform === "win32";

const dev = spawn(isWindows ? "npm.cmd" : "npm", ["run", "dev:all"], {
  stdio: "inherit",
  env: process.env,
  // Windows needs shell: true for .cmd shims; without it Node throws EINVAL.
  shell: isWindows,
});

async function waitFor(url, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (response.ok) return true;
    } catch {
      // not ready
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

function stopDev() {
  if (dev.killed) return;
  if (isWindows && dev.pid) {
    spawn("taskkill", ["/pid", String(dev.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    dev.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  stopDev();
  process.exit(0);
});
process.on("exit", stopDev);

const ready = await waitFor("http://127.0.0.1:5173");
if (!ready) {
  console.error("Vite 未能在 45 秒内启动。");
  stopDev();
  process.exit(1);
}

const desktop = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: { ...process.env, PDF_AI_DESKTOP_URL: "http://127.0.0.1:5173" },
});

desktop.on("exit", (code) => {
  stopDev();
  process.exit(code ?? 0);
});
