import { defineConfig, devices } from "@playwright/test";

const channel = process.env.PW_CHANNEL ?? "msedge";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "edge", use: { ...devices["Desktop Edge"] } }],
  webServer: [
    {
      command: "npm run start",
      url: "http://127.0.0.1:8787/api/health",
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MOCK_AI: "1" } as Record<string, string>,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
