export type OutlineEntry = {
  title: string;
  page: number | null;
  depth: number;
};

export type ChapterRange = {
  title: string;
  start: number;
  end: number;
  depth: number;
};

/**
 * Turn a flat PDF outline into chapter page ranges. A chapter ends on the page
 * before the next outline item with a later start page. Duplicate starts
 * (nested headings) keep the first, shallowest entry.
 */
export function chapterRanges(outline: OutlineEntry[], numPages: number): ChapterRange[] {
  const items = outline.filter(
    (item) => typeof item.page === "number" && item.page >= 1 && item.page <= numPages,
  );
  const seen = new Set<number>();
  const ranges: ChapterRange[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const start = items[index].page!;
    if (seen.has(start)) continue;
    seen.add(start);
    let end = numPages;
    for (let next = index + 1; next < items.length; next += 1) {
      const page = items[next].page!;
      if (page > start) {
        end = Math.max(start, page - 1);
        break;
      }
    }
    ranges.push({ title: items[index].title, start, end, depth: items[index].depth });
  }

  return ranges;
}
