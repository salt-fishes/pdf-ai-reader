export type CitationSegment =
  { type: "text"; value: string } | { type: "cite"; page: number; raw: string };

const CITE_RE = /\[\[p\.(\d+)\]\]|\[p\.(\d+)\]/g;

/**
 * Split model markdown into text and citation segments. Only pages in the
 * allow-list become clickable; hallucinated pages stay as plain text.
 */
export function splitCitations(markdown: string, allowed: Set<number>): CitationSegment[] {
  const segments: CitationSegment[] = [];
  let last = 0;
  CITE_RE.lastIndex = 0;
  for (const match of markdown.matchAll(CITE_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: "text", value: markdown.slice(last, index) });
    }
    const page = Number(match[1] ?? match[2]);
    segments.push(
      allowed.has(page) ? { type: "cite", page, raw: match[0] } : { type: "text", value: match[0] },
    );
    last = index + match[0].length;
  }
  if (last < markdown.length) {
    segments.push({ type: "text", value: markdown.slice(last) });
  }

  // Merge adjacent text segments so non-allowed citations stay in one run.
  const merged: CitationSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (segment.type === "text" && previous?.type === "text") {
      previous.value += segment.value;
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

export function extractCitedPages(markdown: string): number[] {
  const pages = new Set<number>();
  CITE_RE.lastIndex = 0;
  for (const match of markdown.matchAll(CITE_RE)) {
    pages.add(Number(match[1] ?? match[2]));
  }
  return [...pages];
}

/** Rough count of citations that point outside the provided pages. */
export function countInvalidCitations(markdown: string, allowed: Set<number>): number {
  return extractCitedPages(markdown).filter((page) => !allowed.has(page)).length;
}
