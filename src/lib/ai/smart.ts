import type { SmartContext } from "./types";

/**
 * Local BM25 pre-filter for long PDFs.
 *
 * The document never leaves the browser for this step: pages are chunked,
 * scored against the user's question with Chinese bigrams, and only the
 * highest-ranked excerpts are placed in the prompt. Citations still use the
 * original page numbers.
 */

const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const ASCII_WORD = /[a-z0-9][a-z0-9._-]*/g;

/** Very common question words and function words add noise, not signal. */
const STOP_TERMS = new Set([
  "什么", "么是", "是什", "怎么", "怎样", "如何", "为何", "哪些", "哪个", "多少",
  "是否", "可以", "能否", "请问", "请", "介绍", "说明", "解释", "总结", "概括",
  "主要", "内容", "这一", "这个", "那个", "这些", "那些", "一下", "一种", "一个",
  "我们", "你们", "他们", "它们", "自己", "以及", "并且", "但是", "因为", "所以",
  "如果", "然后", "其中", "而且", "不过", "因此", "由于", "通过", "对于", "关于",
  "根据", "没有", "不是", "就是", "还是", "或者", "问题", "第一", "第二", "第三",
  "的", "了", "是", "在", "和", "与", "及", "或", "对", "把", "被", "将", "从",
  "到", "中", "上", "下", "里", "这", "那", "有", "也", "都", "而", "其", "之",
  "吗", "呢", "啊", "吧", "页", "第", "说", "讲", "写",
]);

/** Chinese bigrams (per the plan) plus lowercase ASCII words. */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const terms: string[] = [];

  for (const match of lower.matchAll(CJK_RUN)) {
    const run = match[0];
    if (run.length === 1) {
      if (!STOP_TERMS.has(run)) terms.push(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      const bigram = run.slice(index, index + 2);
      if (!STOP_TERMS.has(bigram)) terms.push(bigram);
    }
  }

  for (const match of lower.matchAll(ASCII_WORD)) {
    if (match[0].length > 1) terms.push(match[0]);
  }

  return terms;
}

type Chunk = {
  page: number;
  start: number;
  end: number;
  len: number;
  tf: Map<string, number>;
  unique: Set<string>;
};

const SENTENCE_END = /[。！？!?；;]/;

function normalizePageText(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function chunkPage(
  page: number,
  text: string,
  size: number,
  overlap: number,
): Chunk[] {
  const source = text;
  if (!source) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + size);
    if (end < source.length) {
      const window = source.slice(start, end);
      // Prefer a sentence boundary in the last 35% of the window.
      const floor = Math.floor(window.length * 0.65);
      let cut = -1;
      for (let index = window.length - 1; index >= floor; index -= 1) {
        if (SENTENCE_END.test(window[index])) {
          cut = index;
          break;
        }
      }
      if (cut >= 0) end = start + cut + 1;
    }

    const slice = source.slice(start, end);
    const tokens = tokenize(slice);
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    chunks.push({
      page,
      start,
      end,
      len: tokens.length,
      tf,
      unique: new Set(tokens),
    });

    if (end >= source.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

type Interval = { start: number; end: number };

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    // Overlapping windows and tiny gaps produce a continuous excerpt.
    if (last && interval.start <= last.end + 80) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

export type SmartPageText = { page: number; text: string };

export type SmartOptions = {
  chunkSize?: number;
  overlap?: number;
  maxChunks?: number;
  maxChars?: number;
  /** Drop chunks scoring below this fraction of the best chunk (noise control). */
  minScoreRatio?: number;
  /** Document length when only the first N pages were scanned. */
  totalPages?: number;
};

export function selectSmartContext(
  pages: SmartPageText[],
  query: string,
  options: SmartOptions = {},
): SmartContext | null {
  const chunkSize = options.chunkSize ?? 800;
  const overlap = options.overlap ?? 120;
  const maxChunks = options.maxChunks ?? 8;
  const maxChars = options.maxChars ?? 12_000;
  const minScoreRatio = options.minScoreRatio ?? 0.15;

  const chunks: Chunk[] = [];
  const scanned = pages.map((page) => ({
    page: page.page,
    text: normalizePageText(page.text),
  }));
  for (const page of scanned) {
    chunks.push(...chunkPage(page.page, page.text, chunkSize, overlap));
  }
  const queryTerms = [...new Set(tokenize(query))];
  if (!chunks.length || !queryTerms.length) return null;

  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of chunk.unique) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const averageLength =
    chunks.reduce((sum, chunk) => sum + chunk.len, 0) / chunks.length;
  const k1 = 1.2;
  const b = 0.75;

  const scored = chunks
    .map((chunk) => {
      let score = 0;
      for (const term of queryTerms) {
        const frequency = chunk.tf.get(term);
        if (!frequency) continue;
        const docs = documentFrequency.get(term) ?? 0;
        if (!docs) continue;
        const idf = Math.log(1 + (chunks.length - docs + 0.5) / (docs + 0.5));
        const norm = 1 - b + b * (chunk.len / (averageLength || 1));
        score += idf * ((frequency * (k1 + 1)) / (frequency + k1 * norm));
      }
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b2) =>
        b2.score - a.score ||
        a.chunk.page - b2.chunk.page ||
        a.chunk.start - b2.chunk.start,
    );

  const picked: Chunk[] = [];
  const floor = (scored[0]?.score ?? 0) * minScoreRatio;
  let used = 0;
  for (const { chunk, score } of scored) {
    if (picked.length >= maxChunks) break;
    // Very weak chunks are usually shared boilerplate, not the asked-about topic.
    if (score < floor) break;
    const length = chunk.end - chunk.start;
    if (picked.length > 0 && used + length > maxChars) continue;
    picked.push(chunk);
    used += length;
  }
  if (!picked.length) return null;

  const intervalsByPage = new Map<number, Interval[]>();
  for (const chunk of picked) {
    const list = intervalsByPage.get(chunk.page) ?? [];
    list.push({ start: chunk.start, end: chunk.end });
    intervalsByPage.set(chunk.page, list);
  }

  const textByPage = new Map(scanned.map((page) => [page.page, page.text]));
  const orderedPages = [...intervalsByPage.keys()].sort((a, b2) => a - b2);
  const blocks: string[] = [];
  let chars = 0;

  for (const page of orderedPages) {
    const source = textByPage.get(page) ?? "";
    const merged = mergeIntervals(intervalsByPage.get(page) ?? []);
    const pieces = merged
      .map((interval) => source.slice(interval.start, interval.end).trim())
      .filter(Boolean);
    if (!pieces.length) continue;
    const body = pieces.join("\n…\n");
    chars += body.length;
    blocks.push(`<<<PAGE ${page}>>>\n${body}`);
  }

  if (!blocks.length) return null;

  return {
    pages: orderedPages,
    text: blocks.join("\n\n"),
    chunks: picked.length,
    chars,
    scannedPages: pages.length,
    totalPages: options.totalPages ?? pages.length,
    query,
  };
}
