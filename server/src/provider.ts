import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";
import type { ProviderConfigInput } from "./schemas";

export type ProviderState = {
  baseUrl: string;
  apiKey: string;
  model: string;
  modelAllow: string[];
};

export const MODEL_RE = /^[a-zA-Z0-9._:/-]{1,96}$/;
export const MOCK_MODELS = ["deepseek-flash", "deepseek-v4.1-flash", "qwen-vl-max", "glm-4v-plus"];

const PROVIDER_FILE = join(config.dataDir, "provider.json");

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function normalizeAllow(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
}

function envProvider(): ProviderState {
  return {
    baseUrl: normalizeBaseUrl(config.ai.baseUrl),
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    modelAllow: normalizeAllow(config.ai.modelAllow),
  };
}

function readProviderFile(): Partial<ProviderState> {
  try {
    if (!existsSync(PROVIDER_FILE)) return {};
    const raw = JSON.parse(readFileSync(PROVIDER_FILE, "utf8")) as Partial<ProviderState>;
    return {
      baseUrl: typeof raw.baseUrl === "string" ? normalizeBaseUrl(raw.baseUrl) : undefined,
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined,
      model: typeof raw.model === "string" ? raw.model : undefined,
      modelAllow: Array.isArray(raw.modelAllow) ? normalizeAllow(raw.modelAllow) : undefined,
    };
  } catch {
    return {};
  }
}

const fileProvider = readProviderFile();
export const provider: ProviderState = {
  baseUrl: fileProvider.baseUrl ?? envProvider().baseUrl,
  apiKey: fileProvider.apiKey !== undefined ? fileProvider.apiKey : envProvider().apiKey,
  model: fileProvider.model ?? envProvider().model,
  modelAllow: fileProvider.modelAllow ?? envProvider().modelAllow,
};
let apiKeyFromFile = fileProvider.apiKey !== undefined;

async function writeProviderFile(next: {
  baseUrl: string;
  model: string;
  modelAllow: string[];
  apiKey?: string;
}): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(PROVIDER_FILE, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

export function publicConfig() {
  let host = "";
  try {
    host = new URL(provider.baseUrl).host;
  } catch {
    host = provider.baseUrl;
  }
  return {
    mode: "server",
    model: provider.model,
    models: config.mockAi
      ? MOCK_MODELS
      : provider.modelAllow.length
        ? provider.modelAllow
        : [provider.model],
    baseUrlHost: host,
    baseUrl: provider.baseUrl,
    modelAllow: provider.modelAllow,
    hasKey: Boolean(provider.apiKey),
    keyHint: provider.apiKey ? provider.apiKey.slice(-4) : "",
    mock: config.mockAi,
    origin: config.appOrigin,
    budget: { input: 1_000_000, output: 8_000 },
    contextWindow: 1_000_000,
  };
}

export type ProviderUpdate =
  | { ok: true; keyCleared: boolean; config: ReturnType<typeof publicConfig> }
  | { ok: false; status: number; code: string; message: string; hint?: string };

/** Validates and persists a provider change, including key/host safety rules. */
export async function updateProvider(input: ProviderConfigInput): Promise<ProviderUpdate> {
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? provider.baseUrl);
  const hostChanged = Boolean(
    hostOf(provider.baseUrl) && hostOf(baseUrl) && hostOf(provider.baseUrl) !== hostOf(baseUrl),
  );
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid_base_url",
      message: "Base URL 必须是 http(s) 地址",
    };
  }

  const model = input.model?.trim() ? input.model.trim() : provider.model;
  if (!MODEL_RE.test(model)) {
    return { ok: false, status: 400, code: "invalid_model", message: "模型名不合法" };
  }
  const modelAllow = normalizeAllow(input.modelAllow ?? provider.modelAllow);
  for (const item of modelAllow) {
    if (!MODEL_RE.test(item)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_model",
        message: `允许列表中的模型名不合法：${item}`,
      };
    }
  }

  let runtimeKey = provider.apiKey;
  let savedKey: string | undefined = apiKeyFromFile ? provider.apiKey : undefined;
  let keyCleared = false;

  if (input.clearKey === true) {
    runtimeKey = "";
    savedKey = "";
    keyCleared = true;
  }

  const providedKey = input.apiKey?.trim() ?? "";
  if (providedKey) {
    if (providedKey.length > 512) {
      return { ok: false, status: 400, code: "invalid_key", message: "API Key 过长" };
    }
    runtimeKey = providedKey;
    savedKey = providedKey;
  } else if (hostChanged && input.clearKey !== true) {
    // Never forward a key to a different host silently. Changing the base URL
    // without supplying a key clears it; the UI asks for the new key.
    runtimeKey = "";
    savedKey = "";
    keyCleared = true;
  }

  try {
    await writeProviderFile({ baseUrl, model, modelAllow, apiKey: savedKey });
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: "provider_save_failed",
      message: "无法保存模型服务配置",
      hint: error instanceof Error ? error.message : "无法写入配置文件",
    };
  }
  apiKeyFromFile = savedKey !== undefined;
  Object.assign(provider, { baseUrl, apiKey: runtimeKey, model, modelAllow });
  return { ok: true, keyCleared, config: publicConfig() };
}
