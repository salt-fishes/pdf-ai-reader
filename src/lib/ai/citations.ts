export type Citation = {
  page: number;
  /** A short verbatim excerpt from the cited page, when the model provided one. */
  quote?: string;
  raw: string;
};

export type CitationSegment = { type: "text"; value: string } | ({ type: "cite" } & Citation);

const CITE_RE = /\[\[p\.(\d+)(?:\|([^\]\n]+))?\]\]|\[p\.(\d+)(?:\|([^\]\n]+))?\]/g;

function cleanQuote(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const quote = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");
  if (!quote) return undefined;
  return quote.length > 160 ? quote.slice(0, 160) : quote;
}

function citationFromMatch(match: RegExpMatchArray): Citation {
  const page = Number(match[1] ?? match[3]);
  const quote = cleanQuote(match[2] ?? match[4]);
  const citation: Citation = { page, raw: match[0] };
  if (quote) citation.quote = quote;
  return citation;
}

/**
 * Rewrite citation markers inside a non-code Markdown run while keeping the
 * surrounding Markdown intact.
 */
export function mapCitations(markdown: string, mapper: (citation: Citation) => string): string {
  let output = "";
  let last = 0;
  CITE_RE.lastIndex = 0;
  for (const match of markdown.matchAll(CITE_RE)) {
    const index = match.index ?? 0;
    if (index > last) output += markdown.slice(last, index);
    output += mapper(citationFromMatch(match));
    last = index + match[0].length;
  }
  if (last < markdown.length) output += markdown.slice(last);
  return output;
}

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
    const citation = citationFromMatch(match);
    segments.push(
      allowed.has(citation.page)
        ? { type: "cite", ...citation }
        : { type: "text", value: citation.raw },
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

export function extractCitations(markdown: string): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  CITE_RE.lastIndex = 0;
  for (const match of markdown.matchAll(CITE_RE)) {
    const citation = citationFromMatch(match);
    const key = `${citation.page}|${citation.quote ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push(citation);
  }
  return citations;
}

export function extractCitedPages(markdown: string): number[] {
  return [...new Set(extractCitations(markdown).map((citation) => citation.page))];
}

/** Rough count of citations that point outside the provided pages. */
export function countInvalidCitations(markdown: string, allowed: Set<number>): number {
  return extractCitedPages(markdown).filter((page) => !allowed.has(page)).length;
}

function normalizeForSearch(value: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\s/.test(character)) continue;
    const lower = character.toLocaleLowerCase("zh-CN");
    for (const part of lower) {
      text += part;
      map.push(index);
    }
  }
  return { text, map };
}

/**
 * Best-effort 1-based line number for a quote inside extracted page text.
 * Whitespace, line wrapping and letter case are ignored so quotes copied from
 * a rendered line still match the extraction.
 */
export function findQuoteLine(text: string, quote: string): number | null {
  const needle = normalizeForSearch(quote).text.slice(0, 80);
  if (!needle) return null;
  const haystack = normalizeForSearch(text);
  let index = haystack.text.indexOf(needle);
  if (index < 0 && needle.length > 16) {
    index = haystack.text.indexOf(needle.slice(0, 16));
  }
  if (index < 0) return null;
  const original = haystack.map[index] ?? 0;
  return text.slice(0, original).split(/\r\n|\r|\n/).length;
}
