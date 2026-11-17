import type { SciverseSettings } from "./config";
import type { ToolDefinition, ToolResult } from "./types";

const BASE = "https://api.sciverse.space";
const TIMEOUT_MS = 25_000;

type Json = Record<string, unknown>;

function timeoutSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function request(
  path: string,
  init: RequestInit,
  token: string,
  signal?: AbortSignal,
): Promise<Json> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...init.headers,
      },
      signal: timeoutSignal(signal),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Sciverse 请求已取消或超时");
    }
    throw new Error(`无法连接 Sciverse：${error instanceof Error ? error.message : "网络错误"}`);
  }

  const text = await response.text();
  let payload: Json = {};
  try {
    payload = text ? (JSON.parse(text) as Json) : {};
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const detail =
      (payload.error as { message?: string } | undefined)?.message ??
      (typeof payload.message === "string" ? payload.message : "") ??
      "";
    throw new Error(`Sciverse ${response.status}${detail ? `：${detail}` : ""}`);
  }
  return payload;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactHit(hit: Json) {
  return {
    title: text(hit.title),
    doc_id: text(hit.doc_id),
    chunk: text(hit.chunk).slice(0, 1800),
    score: number(hit.score),
    page: number(hit.page_no),
    year: number(hit.publication_published_year),
    venue: text(hit.publication_venue_name_unified),
    authors: array(hit.author).slice(0, 5),
  };
}

export function sciverseTools(settings: SciverseSettings): ToolDefinition[] {
  if (!settings.enabled || !settings.token) return [];

  const semanticSearch: ToolDefinition = {
    name: "sciverse_semantic_search",
    label: "Sciverse 学术检索",
    description:
      "检索 Sciverse 的论文全文证据片段。适合回答研究进展、方法对比、实验结论等需要外部文献证据的问题。返回标题、doc_id、片段、页码、年份与 venue。",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "自然语言检索问题，1–2048 字符，尽量具体",
        },
        top_k: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "返回的证据片段数量，默认 8",
        },
        year_from: {
          type: "integer",
          minimum: 1900,
          maximum: 2100,
          description: "只看该年份及以后发表的文献，可选",
        },
        lang: {
          type: "string",
          enum: ["zh", "en"],
          description: "文献语言，可选",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async execute(args, signal): Promise<ToolResult> {
      const query = text(args.query).trim();
      if (!query) throw new Error("query 不能为空");
      const topK = Math.min(20, Math.max(1, Math.round(Number(args.top_k) || 8)));
      const yearFrom = number(args.year_from);
      const lang = text(args.lang);
      const filters: Json = {};
      if (yearFrom) filters.publication_published_year = { gte: yearFrom };
      if (lang === "zh" || lang === "en") filters.lang = lang;

      const payload = await request(
        "/agentic-search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, top_k: topK, filters }),
        },
        settings.token,
        signal,
      );
      const hits = array(payload.hits).map((hit) => compactHit(hit as Json));
      const result = {
        query,
        count: hits.length,
        hits,
      };
      return {
        text: JSON.stringify(result, null, 2),
        summary: hits.length ? `${hits.length} 条证据` : "没有检索到证据",
      };
    },
  };

  const readContent: ToolDefinition = {
    name: "sciverse_read_content",
    label: "Sciverse 读取全文",
    description:
      "按 doc_id 读取 Sciverse 论文全文的字符切片。先用 sciverse_semantic_search 获得 doc_id；用 offset 与 next_offset 继续读取。",
    inputSchema: {
      type: "object",
      properties: {
        doc_id: { type: "string", description: "semantic_search 返回的 doc_id" },
        offset: {
          type: "integer",
          minimum: 0,
          description: "起始字符偏移，默认 0",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 12000,
          description: "本次读取的最大字符数，默认 4000",
        },
      },
      required: ["doc_id"],
      additionalProperties: false,
    },
    async execute(args, signal): Promise<ToolResult> {
      const docId = text(args.doc_id).trim();
      if (!docId) throw new Error("doc_id 不能为空");
      const offset = Math.max(0, Math.round(Number(args.offset) || 0));
      const limit = Math.min(12000, Math.max(200, Math.round(Number(args.limit) || 4000)));
      const query = new URLSearchParams({
        doc_id: docId,
        offset: String(offset),
        limit: String(limit),
      });
      const payload = await request(
        `/content?${query.toString()}`,
        { method: "GET" },
        settings.token,
        signal,
      );
      const body = text(payload.text);
      const result = {
        doc_id: docId,
        offset,
        text: body,
        text_length: number(payload.text_length),
        next_offset: number(payload.next_offset),
        more: payload.more === true,
      };
      return {
        text: JSON.stringify(result, null, 2),
        summary: `${body.length.toLocaleString("zh-CN")} 字${payload.more === true ? "，还有后续" : ""}`,
      };
    },
  };

  const relations: ToolDefinition = {
    name: "sciverse_paper_relations",
    label: "Sciverse 引用关系",
    description:
      "查询论文的引用、被引或相关工作。需要论文的 unique_id（通常形如 paper:10.xxxx/...）；doc_id 不能用于此工具。",
    inputSchema: {
      type: "object",
      properties: {
        unique_id: { type: "string", description: "论文 unique_id，例如 paper:10.1038/..." },
        relation: {
          type: "string",
          enum: ["CITATIONS", "REFERENCES", "RELATED_WORKS"],
          description: "CITATIONS=被引，REFERENCES=参考文献，RELATED_WORKS=相关工作",
        },
        page: { type: "integer", minimum: 1, description: "页码，默认 1" },
        page_size: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "每页数量，默认 20",
        },
      },
      required: ["unique_id", "relation"],
      additionalProperties: false,
    },
    async execute(args, signal): Promise<ToolResult> {
      const uniqueId = text(args.unique_id).trim();
      const relation = text(args.relation).toUpperCase();
      if (!uniqueId) throw new Error("unique_id 不能为空");
      if (!["CITATIONS", "REFERENCES", "RELATED_WORKS"].includes(relation)) {
        throw new Error("relation 必须是 CITATIONS / REFERENCES / RELATED_WORKS");
      }
      const page = Math.max(1, Math.round(Number(args.page) || 1));
      const pageSize = Math.min(50, Math.max(1, Math.round(Number(args.page_size) || 20)));
      const payload = await request(
        "/meta-paper-relations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unique_id: uniqueId,
            relation,
            page,
            page_size: pageSize,
          }),
        },
        settings.token,
        signal,
      );
      const items = array(payload.items).map((item) => {
        const row = item as Json;
        return {
          id: text(row.id),
          id_type: text(row.id_type),
          title: text(row.title),
        };
      });
      return {
        text: JSON.stringify(
          {
            unique_id: uniqueId,
            relation,
            page,
            total_count: number(payload.total_count),
            total_pages: number(payload.total_pages),
            items,
          },
          null,
          2,
        ),
        summary: `${number(payload.total_count) ?? items.length} 条关系`,
      };
    },
  };

  return [semanticSearch, readContent, relations];
}

export async function testSciverse(token: string, signal?: AbortSignal): Promise<string[]> {
  const payload = await request(
    "/agentic-search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "science", top_k: 1 }),
    },
    token,
    signal,
  );
  const count = array(payload.hits).length;
  return [`连接成功，测试检索返回 ${count} 条结果`];
}
