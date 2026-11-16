export type PageRange =
  | { pages: number[]; count: number }
  | null;

/**
 * Parse "3", "3-7", "2,5,9-12" into a sorted unique page list.
 * Returns null on empty, malformed, out-of-range or reversed input.
 */
export function parsePageRange(input: string, total: number): number[] | null {
  const trimmed = input.trim();
  if (!trimmed || total <= 0) return null;

  const pages = new Set<number>();
  for (const chunk of trimmed.split(/[,，、\s]+/).filter(Boolean)) {
    const match = chunk.match(/^(\d+)(?:\s*[-–—~]\s*(\d+))?$/);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (start < 1 || end > total || start > end) return null;
    for (let page = start; page <= end; page += 1) pages.add(page);
  }

  return pages.size ? [...pages].sort((a, b) => a - b) : null;
}

export function formatPageList(pages: number[]): string {
  if (pages.length === 0) return "—";
  if (pages.length === 1) return `第 ${pages[0]} 页`;
  const contiguous = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
  if (contiguous) return `第 ${pages[0]}–${pages[pages.length - 1]} 页`;
  return `第 ${pages.join(", ")} 页`;
}
