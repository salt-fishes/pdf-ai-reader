import type { NormalizedRect } from "./useViewerStore";

type CharacterRef = { node: Text; offset: number };

export type LocatedQuote = {
  rects: NormalizedRect[];
  match: string;
};

function pageRects(range: Range, pageRect: DOMRect): NormalizedRect[] {
  if (!pageRect.width || !pageRect.height) return [];
  const seen = new Set<string>();
  const rects: NormalizedRect[] = [];
  for (const rect of range.getClientRects()) {
    if (rect.width < 1 || rect.height < 1) continue;
    const normalized = {
      x: (rect.left - pageRect.left) / pageRect.width,
      y: (rect.top - pageRect.top) / pageRect.height,
      w: rect.width / pageRect.width,
      h: rect.height / pageRect.height,
    };
    if (normalized.x < -0.05 || normalized.x > 1.05) continue;
    if (normalized.y < -0.05 || normalized.y > 1.05) continue;
    const key = `${Math.round(normalized.x * 1000)}_${Math.round(normalized.y * 1000)}_${Math.round(normalized.w * 1000)}_${Math.round(normalized.h * 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rects.push(normalized);
    if (rects.length >= 80) break;
  }
  return rects.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Locate a verbatim quote in the rendered text layer of one page. Whitespace
 * and case are ignored; if the full quote does not match (the model may have
 * normalized punctuation), progressively shorter prefixes are tried so the
 * jump still lands on the right line.
 */
export function locateQuote(pageElement: HTMLElement, quote: string): LocatedQuote | null {
  const pageRect = pageElement.getBoundingClientRect();
  if (!pageRect.width || !pageRect.height) return null;

  const needle = quote.replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
  if (!needle) return null;

  let haystack = "";
  const refs: CharacterRef[] = [];
  const walker = document.createTreeWalker(pageElement, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const node = current as Text;
    if (!node.parentElement?.closest(".textLayer, [data-ocr-layer]")) continue;
    const value = node.nodeValue ?? "";
    if (!value) continue;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (/\s/.test(character)) continue;
      const lower = character.toLocaleLowerCase("zh-CN");
      for (const part of lower) {
        haystack += part;
        refs.push({ node, offset: index });
      }
    }
    if (haystack.length > 400_000) break;
  }

  if (!haystack) return null;

  const lengths = [needle.length];
  for (const length of [56, 40, 28, 18, 10]) {
    if (length < needle.length && length >= 6 && !lengths.includes(length)) lengths.push(length);
  }

  for (const length of lengths) {
    const candidate = needle.slice(0, length);
    const index = haystack.indexOf(candidate);
    if (index < 0) continue;
    const start = refs[index];
    const end = refs[index + candidate.length - 1];
    if (!start || !end) continue;
    const range = document.createRange();
    try {
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset + 1);
    } catch {
      continue;
    }
    const rects = pageRects(range, pageRect);
    if (rects.length) return { rects, match: candidate };
  }

  return null;
}
