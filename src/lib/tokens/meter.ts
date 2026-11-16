import { estimateImages, estimateText } from "./estimate";

export type UsageBuckets = {
  uncachedInput: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  imageTokens: number;
};

export type Anchor = {
  envelopeHash: string;
  promptTokens: number;
  surfaceEstimate: number;
  usage: UsageBuckets;
  at: number;
};

export const EMPTY_USAGE: UsageBuckets = {
  uncachedInput: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  imageTokens: 0,
};

export function addUsage(a: UsageBuckets, b: UsageBuckets): UsageBuckets {
  return {
    uncachedInput: a.uncachedInput + b.uncachedInput,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    output: a.output + b.output,
    imageTokens: a.imageTokens + b.imageTokens,
  };
}

/** Stable, cheap fingerprint for the request envelope (model + base URL + system prompt). */
export function envelopeHash(parts: Array<string | number | undefined | null>): string {
  const input = parts.filter((part) => part != null).join("\u0000");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 + code, 0x85ebca6b) ^ (h2 >>> 13);
  }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

export function projectTokens(
  anchor: Anchor | null,
  surfaceNow: number,
  hash: string,
): number {
  if (!anchor || anchor.envelopeHash !== hash) return Math.max(0, surfaceNow);
  const delta = surfaceNow - anchor.surfaceEstimate;
  return Math.max(0, anchor.promptTokens + delta);
}

/** Normalize DeepSeek / OpenAI / generic usage shapes into four buckets. */
export function usageFromProvider(raw: unknown): UsageBuckets | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const num = (key: string): number => {
    const value = u[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };

  const prompt = num("prompt_tokens") || num("input_tokens");
  const completion = num("completion_tokens") || num("output_tokens");
  if (!prompt && !completion) return null;

  const details = (u.prompt_tokens_details ?? u.input_tokens_details ?? {}) as Record<string, unknown>;
  const imageTokens =
    typeof details.image_tokens === "number" ? details.image_tokens : 0;

  const cacheRead =
    num("prompt_cache_hit_tokens") ||
    num("cache_read_input_tokens") ||
    (typeof details.cached_tokens === "number" ? details.cached_tokens : 0);

  const explicitMiss = num("prompt_cache_miss_tokens");
  let uncachedInput = explicitMiss || Math.max(0, prompt - cacheRead);

  const cacheWrite = num("cache_creation_input_tokens");

  // Some providers count cached tokens inside prompt_tokens, others alongside it.
  if (cacheWrite > 0 && uncachedInput + cacheRead + cacheWrite > prompt) {
    uncachedInput = Math.max(0, prompt - cacheRead);
  }

  return {
    uncachedInput,
    cacheRead,
    cacheWrite,
    output: completion,
    imageTokens,
  };
}

export type Pricing = {
  /** CNY yuan per million tokens. Example defaults; providers differ. */
  inputMiss: number;
  inputHit: number;
  output: number;
};

export const DEFAULT_PRICING: Pricing = {
  inputMiss: 2,
  inputHit: 0.04,
  output: 8,
};

export function estimateCost(usage: UsageBuckets, pricing: Pricing = DEFAULT_PRICING): number {
  return (
    (usage.uncachedInput / 1_000_000) * pricing.inputMiss +
    (usage.cacheRead / 1_000_000) * pricing.inputHit +
    (usage.cacheWrite / 1_000_000) * pricing.inputMiss +
    (usage.output / 1_000_000) * pricing.output
  );
}

export function formatCny(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value < 0.0001) return "<¥0.0001";
  if (value < 0.01) return `¥${value.toFixed(4)}`;
  if (value < 1) return `¥${value.toFixed(3)}`;
  return `¥${value.toFixed(2)}`;
}

export type SurfaceParts = {
  system: string;
  context: string;
  history: string[];
  question: string;
  imageCount: number;
};

export function estimateSurface(parts: SurfaceParts): number {
  let total = estimateText(parts.system);
  total += estimateText(parts.context);
  for (const message of parts.history) total += estimateText(message);
  total += estimateText(parts.question);
  total += estimateImages(parts.imageCount);
  return total;
}
