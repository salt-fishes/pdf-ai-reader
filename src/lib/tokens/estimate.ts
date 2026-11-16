const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

export function isCjk(ch: string): boolean {
  return CJK_RE.test(ch);
}

/**
 * DeepSeek's published ratio: 1 Chinese char ≈ 0.6 token, 1 English char ≈ 0.3 token.
 * The +4 block overhead covers role markers and separators.
 */
export function estimateText(text: string): number {
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    if (isCjk(ch)) cjk += 1;
    else ascii += 1;
  }
  return Math.ceil(cjk * 0.6 + ascii * 0.3) + 4;
}

export const IMAGE_TOKEN_CAP = 1024;

export function estimateImages(count: number): number {
  return count * IMAGE_TOKEN_CAP;
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 100_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatChars(n: number): string {
  if (n < 1000) return `${n} 字`;
  return `${(n / 1000).toFixed(1)}k 字`;
}
