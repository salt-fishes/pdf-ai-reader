import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { config } from "./config";
import { applySecurityHeaders, jsonError, trustedMutation } from "./http";
import { installEnvProxy } from "./proxy";
import { provider } from "./provider";
import { registerChatRoute } from "./routes/chat";
import { registerOcrRoutes } from "./routes/ocr";
import { registerProviderRoutes } from "./routes/provider";

installEnvProxy();

const app = new Hono();

app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && !trustedMutation(c)) {
    return jsonError(403, "cross_site_blocked", "已阻止跨站请求", "只允许本机阅读器修改配置");
  }
  await next();
});

app.use("*", async (c, next) => {
  await next();
  applySecurityHeaders({ set: (name, value) => c.header(name, value) });
  // The reader is a local SPA. Never let Chromium reuse a previous version's
  // index.html and hashed chunks after an update; local files are already fast.
  c.header(
    "Cache-Control",
    c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-store",
  );
});

app.get("/api/health", (c) => c.json({ ok: true }));

registerProviderRoutes(app);
registerOcrRoutes(app);
registerChatRoute(app);

// Production: serve the built SPA from dist/.
const distIndex = fileURLToPath(new URL("../../dist/index.html", import.meta.url));
if (existsSync(distIndex)) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", async (c) => {
    // A missing hashed chunk must 404 instead of receiving index.html with a
    // 200, which previously let a stale cached page look healthy.
    if (c.req.path.startsWith("/assets/") || c.req.path.startsWith("/pdfjs/")) {
      return c.notFound();
    }
    const html = await readFile(distIndex, "utf8");
    return c.html(html);
  });
}

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return jsonError(404, "not_found", "接口不存在");
  }
  return c.text("Not found", 404);
});

app.onError((error) => {
  const message = error instanceof Error ? error.message : "unknown";
  return jsonError(500, "internal_error", "服务端错误", message.slice(0, 300));
});

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(
    `[api] http://${config.host}:${info.port}  model=${provider.model}  key=${provider.apiKey ? "set" : "missing"}`,
  );
});
