import { config } from "./config";

export function jsonError(status: number, code: string, message: string, hint?: string) {
  return Response.json({ error: { code, message, hint } }, { status });
}

export function isJsonRequest(c: {
  req: { header: (name: string) => string | undefined };
}): boolean {
  return /^application\/json\b/i.test(c.req.header("content-type") ?? "");
}

/**
 * Mutating endpoints are only reachable from the app itself. A browser always
 * sends Origin for POST, so a missing Origin is accepted only for local
 * scripts/tests; cross-site and same-site (subdomain) requests are rejected
 * before they can change the provider URL or spend tokens.
 */
const ALLOWED_ORIGINS = new Set([
  config.appOrigin,
  `http://127.0.0.1:${config.port}`,
  `http://localhost:${config.port}`,
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

export function trustedMutation(c: {
  req: { header: (name: string) => string | undefined };
}): boolean {
  const origin = c.req.header("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return false;
  const site = c.req.header("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return false;
  return true;
}

export function applySecurityHeaders(headers: { set(name: string, value: string): void }): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  // pdf.js uses WebAssembly for image decoding and some ICC paths; without
  // 'wasm-unsafe-eval' production falls back to slower JS and logs errors.
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
}
