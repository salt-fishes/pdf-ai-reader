# 架构

## 进程

```text
Electron 主进程 ── 启动/停止 ──> 本地代理 (Hono, 127.0.0.1:8787)
      │                                 │
      │ preload: checkForUpdates         │ /api/*: provider、OCR、配置
      ▼                                 │
渲染进程 (React + pdf.js) ──────────────┘
      │
      ├─ IndexedDB：文档、对话、高亮、OCR、摘要、最近文档
      └─ localStorage：界面偏好
```

浏览器模式由 Vite 开发服务器代理 `/api` 到 8787；生产模式由本地代理同时托管 `dist/`。

服务端入口只负责中间件、静态资源与启动；provider 状态与保存规则在 `provider.ts`，请求校验在
`schemas.ts`，HTTP 助手在 `http.ts`，mock 流在 `mock.ts`，路由按 `routes/provider.ts`、
`routes/chat.ts`、`routes/ocr.ts` 拆分。

## 阅读器

- pdf.js 6.5.438，自绘虚拟列表；只挂载可视区附近的页面。
- 每页尺寸写入 IndexedDB（`metrics:<hash>`），首屏后用缓存避免跳动。
- 画布按真实 DPR 与 2²⁵ 像素预算渲染；`--total-scale-factor` 驱动文字层对齐。
- 色彩模式在画布像素上完成，不用 CSS 滤镜；智能暗色使用 48px 亮度蒙版。
- 搜索命中、高亮、OCR 行框都是绝对定位覆盖层。

## 助手

- 上下文：当前页、页码范围、目录章节、选中文字、截图、附件、对话引用。
- 长文档在浏览器本地做 800 字切块与中文 bigram BM25，只发送高分段落。
- 整本总结走 map-reduce：按约 3 万字分段摘要，再合并；结果按文档/模型缓存。
- SSE 解析在 `src/lib/ai/sse.ts`；provider usage 锚点 + 增量估算驱动 TokenMeter。
- 消息、思考流、引用和 KaTeX 统一由 `MessageView` 渲染。

## 本地存储

| Key                                        | 内容                                          |
| ------------------------------------------ | --------------------------------------------- |
| `doc:<hash>`                               | 阅读位置、缩放、页码                          |
| `chat:<hash>`                              | 多会话消息、模型、token 锚点                  |
| `highlights:<hash>`                        | 高亮矩形与文本                                |
| `ocr:<hash>` / `ocrpage:<hash>:<page>`     | OCR 文本与行框                                |
| `ocrindex:<hash>`                          | 已识别页码                                    |
| `metrics:<hash>`                           | 页面尺寸                                      |
| `summary:<hash>`                           | 分段摘要缓存                                  |
| `recent:documents:v1`                      | 最近文档（≤8 条，单文件 ≤24MB，总缓存 ≤64MB） |
| `meta:db`                                  | IndexedDB schema 版本；当前为 2               |
| `pdf-ai-reader:settings:v1` (localStorage) | 界面偏好                                      |

旧版单会话/主题字段在读取时迁移；清空所有本地数据会删除全部 key 并刷新页面。
`migrateLocalData()` 在渲染进程启动时执行一次，版本落后时裁剪最近文档缓存并写入 `meta:db`。

## OCR

- 页面无文字层时进入队列，按优先级在本机 worker 线程识别。
- tiny 随桌面版分发；small/medium 按需下载，默认官方源，可配置镜像根地址。
- 设置页切换未下载模型会先询问；下载成功后切换 active model，失败保留旧模型。
- 识别结果写入 IndexedDB，生成行级文本层，参与搜索、引用、BM25 与整本总结。

## 更新

- 只手动触发，只查 GitHub Releases。
- Electron 主进程通过 `net.fetch` 请求并在主进程比较版本；preload 暴露只读 bridge。
- 浏览器模式回退到 renderer `fetch`；结果缓存 5 分钟，不后台轮询、不自动下载。
