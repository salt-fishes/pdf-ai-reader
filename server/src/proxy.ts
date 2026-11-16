import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

/**
 * Node's fetch ignores the Windows proxy settings that Electron's net module
 * follows. Electron resolves the system proxy and passes it in HTTPS_PROXY;
 * installing that dispatcher keeps pack/model downloads working on machines
 * that cannot reach GitHub directly. Localhost always bypasses the proxy so
 * Ollama and other on-device providers keep working.
 */
export function installEnvProxy(): void {
  const proxy =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.ALL_PROXY ??
    "";
  if (!proxy.trim()) return;

  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? "";
  process.env.NO_PROXY = [noProxy, "127.0.0.1", "localhost"].filter(Boolean).join(",");
  try {
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch (error) {
    console.warn(`[proxy] 无法启用系统代理：${error instanceof Error ? error.message : "unknown"}`);
  }
}
