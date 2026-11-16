// 真实模型冒烟测试：直接打本地代理 /api/chat，不经过浏览器。
// 用法：node scripts/smoke-real.mjs [http://127.0.0.1:8787]
// 需要 server/.env 已配置 AI_API_KEY，且 MOCK_AI=0。
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = (process.argv[2] ?? process.env.API_BASE ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function streamChat(messages, { model, label }) {
  const started = performance.now();
  let firstTokenAt = 0;
  let text = "";
  let usage = null;
  let error = null;

  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173" },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`${label}: HTTP ${res.status} ${body.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const consume = (line) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    if (json.error) error = json.error;
    const delta = json.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) {
      if (!firstTokenAt) firstTokenAt = performance.now() - started;
      text += delta;
    }
    if (json.usage) usage = json.usage;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line.trim());
  }
  if (buffer.trim()) consume(buffer.trim());
  const totalMs = performance.now() - started;
  return { text, usage, firstTokenAt: Math.round(firstTokenAt), totalMs: Math.round(totalMs), error };
}

function report(name, result) {
  console.log(`\n=== ${name} ===`);
  console.log(`首字 ${result.firstTokenAt}ms · 总耗时 ${result.totalMs}ms · ${result.text.length} 字`);
  if (result.usage) console.log(`usage ${JSON.stringify(result.usage)}`);
  if (result.error) console.log(`error ${JSON.stringify(result.error)}`);
  console.log(result.text.slice(0, 600));
}

const health = await (await fetch(`${BASE}/api/health`)).json();
const config = await (await fetch(`${BASE}/api/config`)).json();
console.log(`proxy ${BASE} health=${health.ok} mock=${config.mock} model=${config.models.join(",")}`);
if (config.mock) {
  console.error("MOCK_AI=1：这是 mock 模式，冒烟测试无意义。");
  process.exit(2);
}
if (!config.hasKey) {
  console.error("服务端没有 AI_API_KEY。");
  process.exit(2);
}

const text = await streamChat(
  [
    { role: "system", content: "你是 PDF 阅读助手。只依据给定页面回答，必须用 [[p.页码]] 标注来源，中文作答，不超过 80 字。" },
    { role: "user", content: '第 2 页内容：“热传导在稳态下满足 ∇·(k∇T)=0。” 解释它的物理含义，并给出引用。' },
  ],
  { label: "text" },
);
report("文本 + 引用格式", text);
const hasCitation = /\[\[p\.\d+\]\]/.test(text.text);
console.log(`引用标记: ${hasCitation ? "OK" : "MISSING"}`);

const imagePath = path.join(root, "docs", "app-panel.png");
const image = await readFile(imagePath);
const vision = await streamChat(
  [
    { role: "system", content: "你是界面审阅助手，用中文简短回答。" },
    {
      role: "user",
      content: [
        { type: "text", text: "这张截图是一个 PDF 阅读器。请用一句话说明右侧面板顶部显示了什么，以及页面主要内容。" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}` } },
      ],
    },
  ],
  { label: "vision" },
);
report("图片理解（截图）", vision);

const rejected = await fetch(`${BASE}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: "not-a-model", messages: [{ role: "user", content: "hi" }] }),
});
console.log(`\n=== 非法模型拦截 === HTTP ${rejected.status} ${(await rejected.text()).slice(0, 160)}`);

const failed = [text, vision].some((r) => r.error || !r.text.trim());
process.exit(failed || !hasCitation ? 1 : 0);
