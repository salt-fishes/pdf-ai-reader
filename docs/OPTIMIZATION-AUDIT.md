# 架构审计：大文档、长会话与本机代理边界

> 历史审计（0.1.0 时期）。其中“所有页都挂载”“单一 2000 行 store”等问题已在 0.2.0 部分处理：页面已虚拟化，OCR 已后台化；当前测试数字与未完成项见 [CHANGELOG](../CHANGELOG.md) 与 [ROADMAP](ROADMAP.md)。

- 版本：0.1.0
- 日期：2026-11-16
- 范围：`src/features/viewer`、`src/features/assistant`、`server/src`、`src/lib/storage`、构建与桌面打包
- 方法：生产构建 + Edge/Playwright 实测；PyMuPDF 生成 1000/2000/5000 页与混合页尺寸样本；独立 mock/fake upstream 复现并发与安全边界。单元测试 63 项、E2E 33 项通过，`tsc -b` 通过。

## 结论

**不建议全量推倒重写。** PDF.js 集成、文字层对齐、CMap、色彩模式、SSE 客户端、引用/BM25/摘要算法和视觉系统都是这个项目最贵的资产，重写收益低、回归风险高。

真正需要重写的是三个边界，外加一个横切能力（OCR 后台化）：

1. **阅读器页面布局层**：当前是“所有页都挂载、画布懒渲染”，不是真正的虚拟列表。5000 页时滚动 p95 62–69ms，单帧长任务 50–82ms。
2. **助手运行时/状态层**：单一 2000 行 store、多个独立 busy flag、没有文档代际和运行互斥。已复现“切文档后旧请求继续跑、回答丢失”“总结和提问并发”。
3. **本机代理的信任边界**：已复现跨站 `text/plain` 请求修改 Base URL，并让旧 API Key 被发送到新 host。
4. **OCR 后台化 + 行级文本层**：当前是手动、弹窗、主线程阻塞；单页 0.7–1.6s，事件循环最长阻塞 690ms。要“无感”，必须 worker + 队列 + 自动准备；还要生成行级可选中文本层，并为后续 tiny/small/medium 模型切换留注册表。

其余问题（CSP、首屏载荷、滚动位置、混合页尺寸、总结费用、可访问性、包体积）可以在上述重构中一并解决，不需要另起炉灶。

## 0. 本轮实施进展（2026-11-16）

已完成并验证：

- **精确位置跳转**：`scrollTarget` 扩展为 `LocationTarget`，高亮使用归一化 `y` 落到高亮行，不再滚到页顶；目标高亮带 1.7s 脉冲。搜索结果也记录页内 occurrence，命中行进入视口 2–45% 区域；OCR 搜索同样精确落点。
- **阅读位置恢复**：打开文档时先应用保存的 `scrollTop`，并在页面尺寸稳定期间保持 1.2s；实测 1800px 恢复误差 < 50px（E2E 断言 >1750）。
- **虚拟页面列表**：PageMetrics + 前缀偏移 + 窗口化渲染，只挂载可视区 ±4800px；5000 页实测滚动 p95 **15ms**、最大帧 **16.6ms**、DOM **126**、同时挂载 **7 页**；跳到第 4999 页约 **44ms**。混合尺寸页使用 IDB 尺寸缓存并在后台补齐，40 页混合样本 scrollHeight 在跳页前后保持稳定。
- **本机代理边界**：POST 校验 `Origin` / `Sec-Fetch-Site`；JSON 端点强制 `application/json`；修改 Base URL 且未提供新 Key 时自动清空旧 Key，避免跨 host 泄露；CSP 加入 `'wasm-unsafe-eval'`。
- **OCR worker + 队列**：`worker_threads` 内运行 PP-OCRv6，按 high/normal/low 排队；HTTP 改为 JPEG/PNG 字节上传；切换模型自动重启 worker；服务端事件循环不再被推理阻塞。
- **OCR 无感化**：当前页空闲 650ms 后自动入队；模型缺失时后台下载，不再弹窗；ContextBar 只显示“正在后台识别 / 已加入队列 / 不影响阅读”。
- **OCR 行级文本层**：PP-OCR 行框归一化为 0–1，透明 span 支持拖选、双击、复制、高亮、引用、搜索；页面/侧栏/搜索/上下文显示 `OCR` 标签；`source: "ocr"` 贯穿 Selection、Highlight、Prompt。
- **OCR 模型注册表**：tiny / small / medium 统一 det+rec+dict 描述，tiny 随桌面包分发，small/medium 按需下载；设置里可切换，状态与进度可见。
- **助手运行边界**：新增 `ForegroundRun`（chat/summary 互斥）、`docEpoch` 文档代际、`boundDocHash` 会话归属。切文档先停止并保存旧文档的部分回答，再加载新文档；旧流的结果不会写进新文档，新文档也可以立即开始自己的回答。E2E 覆盖“切文档不丢答案、不串文档”。
- **总结用量**：map / reduce / final 三段 usage 累加后写入消息与会话锚点，不再只计算最终一段。
- **密码 PDF**：pdf.js `onPassword` + 密码重试；错误密码不销毁当前文档，取消后保留原文档。
- **最近文档**：≤24MB 的 PDF 在本机 IDB 缓存字节，空文档页和“更多”菜单可直接重开；超过 24MB 不进入最近列表。
- **引用回跳**：记录每页最后阅读位置，引用点击回到该页的阅读锚点；没有锚点时回页首。
- **可访问性**：设置、快捷键、密码对话框共用 `useFocusTrap`，Tab 循环、Esc 关闭、关闭后焦点回到触发按钮。
- **首屏与打包**：`AssistantPanel` 首次打开后才加载；桌面包保留 zh-CN/en-US，移除 DirectML/dxcompiler、win32-arm64 与 darwin/linux ONNX Runtime。实际打包 **183MB zip / 405.6MB unpacked**（原 235.7MB zip），locale 只剩 2 个，tiny OCR 模型 5.98MB 随包。

尚未完成 / 已知边界：

- OCR 仍是行级框，词级命中框是后续增强。
- zip 183MB，未达到 150–160MB 目标；剩余体积主要是 Electron 本体、ONNX Runtime 与 canvas/opencv 运行时。
- 引用回跳使用“该页最后阅读位置”作为启发式锚点，不是模型引用语句的字级定位。
- 最近文档超过 24MB 不缓存字节，需重新选择文件。

## 1. 实测结果

### 1.1 大文档：组件全量挂载

样本为 PyMuPDF 生成的 A4 文档，生产构建，1440×900，Edge。

|                         页数 | 首次出现标题 | DOM 节点 | `[data-page]` | canvas | textLayer |   滚动 p50 |    滚动 p95 | >32ms 帧 |   最长任务 |
| ---------------------------: | -----------: | -------: | ------------: | -----: | --------: | ---------: | ----------: | -------: | ---------: |
|                         1000 |    286–316ms |    5,108 |         1,000 |  1,000 |     1,000 |      7.1ms |      20.8ms |     0/89 |          — |
|                         2000 |    414–650ms |   10,076 |         2,000 |  2,000 |     2,000 |     13.7ms |      27.8ms |   2–4/89 |       35ms |
|                         5000 |        839ms |   25,076 |         5,000 |  5,000 |     5,000 |     14.0ms | 62.7–69.4ms | 21–22/89 |       83ms |
| 5000（虚拟列表后，开发构建） |            — |  **126** |         **7** |  **7** |     **7** | **13.9ms** |  **15.0ms** | **0/90** | **16.6ms** |

单独测滚动处理器里的 `querySelectorAll + 5000 次 getBoundingClientRect` 只要 **2.94ms**。也就是说 60–80ms 的长任务主要不在测量，而在：

- `PdfViewer` 订阅了 `currentPage`，每次跨页都重渲染 5000 个 `PageView` 元素；
- `visible` Set 变化时同样重渲染全量；
- `PageView` 没有 `memo`，每次父级渲染都会重新执行 5000 次组件函数和多个 Zustand selector；
- 每页都保留 canvas/textLayer DOM，即使 width=0。

1000 页还能接受，2000 页开始掉帧，5000 页已经是明显卡顿。当前 E2E 最大样本是 100 页，没有覆盖这个区间。

### 1.2 混合页尺寸：占位高度错误

40 页、交替 A4 / Letter / 横向 / 长页 / 宽页：

- 初始 `scrollHeight = 74,387px`；
- 访问第 4 页后变成 `73,984px`；
- 第 4 页占位 1845.7px，实际 2630.4px；
- 第 5 页占位 1845.7px，实际 657.6px。

原因是 `PdfViewer` 把第 1 页的 `sizeHint` 传给所有 `PageView`，只有进入可视区后 `PageView` 才通过 `getPageSize` 改成自己的尺寸。混合页尺寸文档会出现滚动条长度变化、跳页偏移和滚动锚点漂移。

### 1.3 阅读位置只恢复到页首

`openFile` 把 `saved.scrollTop` 写进 `scrollTopMemory`，但恢复时只调用 `requestScroll(savedPage)`，后者只滚到页首。实测滚到 4200px 后重新打开，落在 3554px（第 3 页顶部）。

### 1.4 输入成本随上下文线性增长

浏览器内，1000 页 / 约 80 万字符全部加入上下文后，单次 `input` 事件（含 `setDraft → recalc → buildRequest + estimateSurface`）约 **7ms**，首次冷启动 14ms；仅当前页时 0.2–1ms。Node 基准中 500 页 / 106 万字符约 24ms。

目前不算灾难，但它随文档长度线性增长，1M token 文档会到十几到几十毫秒，足以在打字时掉帧。应改为“上下文 token 缓存 + 问题增量 + debounce”，而不是每次重建完整 prompt。

同时，1000 页“全部页”提取耗时约 **890ms**，期间只有按钮变成“载入中…”，没有进度。全文搜索第 999 页的命中项约 **3.1s**（前 200 个命中约 590ms），期间进度可能停在个位数页，并出现 57ms 长任务。

### 1.5 首屏载荷：lazy 实际没有延迟

生产首屏资源（localhost，无压缩）：

| 资源                   |     传输大小 |
| ---------------------- | -----------: |
| `index-*.js`           |        386KB |
| `index-*.css`          |        106KB |
| `AssistantPanel-*.js`  |        502KB |
| `AssistantPanel-*.css` |        0.5KB |
| **合计**               | **约 995KB** |

`AssistantPanel` 虽然用了 `lazy`，但 App 无条件渲染 `<AssistantPanel />`，组件挂载时立即触发动态 import；Vite 又在运行时插入了该 chunk 的 `modulepreload`。也就是说 **面板没打开也下载/解析了 502KB**。

CSS 里同时包含 KaTeX 和 Assistant 样式（`main.tsx` 全局引了 KaTeX CSS）。`AssistantPanel`、`SettingsDialog`、`ShortcutsDialog`、`OcrDialog` 都是静态 import 或挂载即加载。

### 1.6 生产 CSP 禁用了 WASM

生产 `script-src 'self'` 没有 `'wasm-unsafe-eval'`。实测日志：

```
ICCBased color space: CompileError: WebAssembly.Module(): ... violates ... "script-src 'self'"
#getWasmInstance: CompileError: WebAssembly.instantiate(): ... violates ... "script-src 'self'"
```

JPX 图片仍能通过 JS fallback 渲染（截图对比 mean diff 0.008，视觉几乎一致），但 **ICC 色彩管理被直接禁用**，CMYK/ICC PDF 可能偏色；JPEG2000/JBIG2 也失去 wasm 加速。这是一行 CSP 修复。

### 1.7 本机代理：跨站改配置 + 旧 Key 外发（已复现）

独立测试服（`127.0.0.1:8790`，假 Key）验证：

1. `POST /api/provider`，`Origin: https://evil.example`，`Content-Type: text/plain`，返回 **200**；
2. `/api/config` 的 `baseUrl` 变为攻击者指定的地址；
3. 再发 `/api/chat`，假 upstream 收到 `Authorization: Bearer sk-test-secret`。

代码上的组合：

- `APP_ORIGIN` 只用于 `/api/config` 返回值，没有参与请求校验；
- `/api/provider` 不检查 Origin，也不检查 Content-Type；
- 未提供新 `apiKey` 时 `runtimeKey` 保留旧 Key；
- 保存后直接 `Object.assign(provider, next)`，下一次 `/api/chat` 用新 `baseUrl` + 旧 Key。

对本地优先应用，这等于“任意网页都能改我的模型端点并拿走 Key”。必须优先修。

### 1.8 文档切换：旧请求继续跑，回答丢失（已复现）

Mock 流式回答，发送后 250ms 切换到另一份 PDF：

- `/api/chat` 请求在切换后 993ms 才 finished；
- 新文档消息为空；
- 切回原文档，只剩用户提问，助手回答丢失。

原因：`loadForDoc` 只 abort summary，没有 abort `streamAbort`；`streamingId` 被直接置空；`send` 的 `finally` 用“当前文档”的 `get()` 持久化，旧回答写不进原文档。旧请求仍继续计费。

### 1.9 总结与提问并发（已复现）

点击“总结整份文档”后 700ms 插队提问，捕获到 4 个 `/api/chat` 请求：

- 1949ms：summary map；
- 2066ms：用户提问；
- 3078ms、4214ms：summary 继续 map。

两个操作同时写消息，总结状态和普通回答交错。`send` 只检查 `streamingId`，不检查 `state.summary`；Composer 也没有在总结期间禁用发送。

### 1.10 整本总结费用未计入 TokenMeter

Mock 6 页总结完成后，上下文面板显示：

```
锚点提示 — / 缓存命中 — / 未命中输入 — / 输出 — / 预计费用 —
```

map/reduce 的 `onUsage` 是空函数；最终回答写回了消息 usage，但没有更新 store 的 `anchor`/`usage`。总结可能几十次调用，费用被完全低估。

### 1.11 打开失败无反馈

已有文档时拖入损坏 PDF：标题仍是旧文档，页面 0 条错误提示。错误框只在 `!docName` 的空状态渲染；`openFile` 失败后保留旧文档。密码 PDF 也没有 `PasswordException` 输入入口。

### 1.12 桌面包体积

`paper-reader-0.1.0-win-x64.zip` 为 235.7MB。压缩后构成：

| 分组                         |    原始 |  压缩后 |
| ---------------------------- | ------: | ------: |
| Electron `PaperReader.exe`   | 238.5MB | 106.5MB |
| `node_modules`（OCR 运行时） | 188.4MB |  76.7MB |
| Electron 其他                |  69.7MB |  35.8MB |
| locales（55 个）             |  48.8MB |  12.7MB |
| app 代码/资源                |   7.3MB |   3.8MB |

`onnxruntime-node` 原始 136MB（x64 + arm64 + DirectML/dxcompiler），`@napi-rs/canvas` 37MB，opencv.js 14MB。Electron 本体约 142MB 压缩后不可避；OCR 与 locales 是可压缩空间，目标可到 150–160MB。

### 1.13 高亮跳转只到页顶

`Sidebar.tsx:222` 和 `:224` 都调用 `requestScroll(highlight.page)`；`PdfViewer.tsx:208-225` 只对 `[data-page]` 做 `scrollIntoView({ block: "start" })`。高亮本身保存了归一化 rects（`useViewerStore.ts:31-37`），但跳转没有使用。

结果是点侧栏高亮落在页顶，用户还要自己找；长页、多栏、跨页高亮尤其明显。跨页高亮已经按页保存 rects，可以直接用第一页的最小 y 定位。

### 1.14 OCR 现在是“手动 + 阻塞 + 弹窗”

当前链路：

- 只有当前页文本少于 20 字时，ContextBar 才出现“识别文字”按钮；
- 未安装模型时 `recognizePage` 打开 `OcrDialog`，必须手动下载；
- 每次识别 `renderPageImage(pdf, page, 1600)` → base64 `/api/ocr` → 服务端主线程 `recognizeImage`；
- 结果 `setPageText` + `saveOcrRecord`（每次重写整份 pages 对象）；
- 搜索/BM25/总结不会自动等待 OCR，也不会在 OCR 完成后自动刷新；
- OCR 只写入文本缓存，**没有生成可选中/可高亮的页面文字层**；扫描页仍然只能截图或提问，不能像普通 PDF 那样划词、复制原文、加高亮。

实测（本机 PP-OCRv6 tiny，1600px 页面）：

- 单页首次 **1.58s**，后续 **0.68–0.73s**；
- 主线程事件循环最大延迟 **690ms**（首次初始化时 924ms）；
- 1000 页扫描件全量 OCR 约 12–20 分钟；
- 模型 6.3MB，首次下载/初始化有可感等待。

所以“无感”不能只是把按钮自动点一下：必须把推理移出主线程、做优先级队列、模型预置/后台下载，并让搜索/总结知道 OCR 文本何时可用。

### 1.15 扫描页缺少可交互的 OCR 文字层

普通 PDF 的 `.textLayer` 由 pdf.js 生成，文字透明但可选中、可复制、可高亮；扫描页的文字层通常是空的。当前 OCR 结果只进了内存/IDB 缓存，没有对应的 DOM 文本，所以：

- 扫描页不能拖选、双击选词、Shift 扩展选择；
- 不能把 OCR 原文复制出来；
- 不能给 OCR 文本加高亮，也不能从高亮侧栏跳回精确位置；
- 不能把 OCR 选中内容加入上下文，只能整页截图或提问。

这正是“类似文字层的操作方式 + 相应提示”要补的部分。PP-OCR 的分行结果本身带 `box: {x,y,width,height}`（像素坐标），可以归一化后渲染成透明可选中文本层；不需要改 OCR 模型。

## 2. 根因与“保留 / 重写”判断

| 子系统                                               | 根因                                                                           | 判断                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| PDF 渲染、文字层、CMap、色彩模式、链接层             | 已稳定，测试覆盖                                                               | **保留**，只在页面生命周期上适配虚拟列表             |
| `PdfViewer` 页面列表                                 | 全量 map + 单一 sizeHint + currentPage 订阅 + O(n) 滚动测量                    | **重写**为 PageMetrics + VirtualPageList             |
| `PageView` 画布/文字层/框选                          | 逻辑完整，性能问题主要来自父级                                                 | **保留**，加 memo，props 化颜色/高亮                 |
| `useAssistantStore` 运行时                           | 2000 行单 store；busy flag 独立；无 doc epoch；无 run controller；快照式持久化 | **重写运行时层**，UI 组件和业务算法保留              |
| SSE / provider client / prompt / BM25 / summary 算法 | 逻辑正确，有单测                                                               | **保留**，补 usage 汇总与取消语义                    |
| Hono 上游代理                                        | SSE 转发、模型校验基本正确                                                     | **保留**，重写本地信任边界与 provider 变更语义       |
| IndexedDB 持久化                                     | 整文档 record、无配额处理、无 recent index                                     | **重写 schema + 迁移**                               |
| OCR 推理/调度                                        | 主线程推理、手动弹窗、无队列、整份 OCR record 狂写                             | **重写**为 worker + 客户端优先级调度 + per-page 存储 |
| 视觉系统/CSS                                         | 成熟，问题只是加载粒度                                                         | **保留**，拆分 CSS/延迟加载                          |
| Electron 壳                                          | 单实例、导航限制、代理启动都合理                                               | **保留**，只改打包裁剪与安全存储                     |

## 3. 目标架构

### 3.1 阅读器：PageMetrics + VirtualPageList

新增两层，`PageView` 内部尽量不动：

```
PageMetrics
  - get(page) -> { width, height }
  - offsets[]（累计高度，含 gap）
  - 打开文档时批量读取；缓存到 IndexedDB: metrics:<hash>
  - 5000 页在 Node 里约 817ms，可分批 + 进度，或先估后校正

VirtualPageList
  - scrollTop + viewportHeight -> 二分 offsets -> [start, end]
  - 上下 spacer，仅挂载 visible + overscan（2–3 页）
  - scrollToPage(page) 用 offsets 精确定位
  - 恢复阅读位置时直接设置 scrollTop
  - currentPage 用二分计算，只在变化时更新；无障碍播报放到独立组件
```

要点：

- `PageView` 用 `memo`，props 只传 `pageNumber/zoom/size/visible`；颜色、高亮通过 props 或只让已挂载页订阅。
- 页面容器加 `contain: layout paint style`；`content-visibility: auto` 可作为过渡，但不能替代窗口化。
- 缩略图同样用虚拟网格 + LRU 图片缓存，不要再为每页建一个 IntersectionObserver。
- 页面尺寸缓存按 `docHash` 存 IDB；同一文档第二次打开直接精确布局。
- 保留 `PageView` 的 canvas 懒渲染、文字层 `--total-scale-factor`、色彩滤镜、框选逻辑。

#### 3.1.1 精确位置跳转（高亮 / 搜索 / 引用）

把 `scrollTarget` 从 `{ page }` 扩展为：

```ts
type LocationTarget = {
  page: number;
  /** 页面内归一化 y，0–1 */
  y?: number;
  /** 高亮/搜索命中 id，用于脉冲提示 */
  focusId?: string;
  align?: "top" | "center";
  at: number;
};
```

- `Sidebar` 高亮点击传 `y = min(rect.y)`、`focusId = highlight.id`；跨页高亮取第一页的最小 y。
- `VirtualPageList` 用 PageMetrics 计算 `pageTop + y * pageHeight`，滚动到 `目标 - viewportHeight * 0.3`，让高亮上方留一点上下文；接近页底时 clamp 到可见范围。
- `PageView` 根据 `focusedHighlightId` 给对应矩形加 1.2s 脉冲；即使目标页是刚被虚拟列表挂载的，也能在挂载后继续闪。
- 搜索命中后续可以让 `SearchResult` 带上 rects，复用同一个 `LocationTarget`；引用回跳仍可只到页首。
- 这套坐标模型同时解决“恢复阅读位置”和“混合页尺寸跳页”：所有跳转都基于同一组 page offsets。

### 3.2 助手：显式运行状态机 + 文档代际

不要继续堆 flag。用一个 `ForegroundRun` 联合类型表达互斥：

```ts
type ForegroundRun =
  | { kind: "idle" }
  | { kind: "chat"; docHash; sessionId; messageId; controller }
  | { kind: "summary"; docHash; sessionId; controller; stage; ... };

type BackgroundTask =
  | { kind: "filter"; docHash; token }
  | { kind: "ocr"; docHash; page; priority }
  | { kind: "capture"; docHash; page };
```

规则：

- `beginRun()` 只管理 `chat` / `summary`；两者互斥，UI 的 Composer/建议按钮由 `canSend` 派生。
- `filter` / `ocr` / `capture` 是**后台任务**，不阻塞阅读，也不阻塞发送；它们有自己的取消、优先级和 docEpoch。
- `docEpoch` 在打开/关闭文档时自增；所有 `await` 后先校验 epoch，再 `set`/持久化。
- 切换文档：abort 前台 run、清空 OCR 队列；结果写回 **run 启动时捕获的 docHash/sessionId**，不写当前文档。
- 持久化按 `chat:<hash>:<sessionId>` 拆 key；run 结束时只保存该会话。
- 总结累积 map/reduce/final 的 usage，结束后更新 session anchor 和消息 usage。

Token 估算拆成：

```
baseTokens = estimate(system + context + history + images)  // context/history 变化时算，缓存
questionTokens = estimate(question)                         // 每次输入只算这一小段
projected = project(anchor, base + question)
```

`setDraft` 只更新 questionTokens，150ms debounce；发送时再确认真实 base。

持久化：单会话 key、写队列、`QuotaExceededError` toast；`visibilitychange/pagehide` flush。存储 schema 增加 `recent` 索引，启动页显示最近文档。

### 3.3 本机代理：明确信任边界

在 Hono 加一层 `requireLocalClient`：

- 拒绝 `Sec-Fetch-Site: cross-site`；
- 对 POST 校验 `Origin` ∈ {`APP_ORIGIN`, `http://127.0.0.1:<PORT>`}；
- POST 强制 `Content-Type: application/json`（阻断 simple request）；
- 可选：首次 same-origin 请求下发 `HttpOnly; SameSite=Strict` cookie，POST 必须携带；
- `MAX_BODY_BYTES` 用流式 body limit，不只信 `content-length`。

Provider 变更：

- 只允许 http/https，禁止 URL userinfo；
- **host 变化且未提供新 key / 未明确 clearKey 时拒绝保存**，或清空 key；
- 按 host 保存 key 的映射，避免“换端点带走旧 key”；
- `clearAllLocalData` 增加 `/api/provider/reset`，真正清掉 `provider.json` 与 OCR 模型（或明确文案区分“阅读数据/密钥”）。

CSP：

- `script-src 'self' 'wasm-unsafe-eval'`；
- 保留 `worker-src 'self' blob:`；
- 加一个带 JPX/ICC 的回归 PDF。

### 3.4 构建与加载

- `AssistantPanel` 只在 `status === "open"` 时挂载；FAB hover/聚焦时预取 chunk。关闭动画结束后卸载。
- `SettingsDialog`、`ShortcutsDialog`、`OcrDialog` 改成条件挂载的 `lazy`。
- 移除 `main.tsx` 的全局 KaTeX CSS；把 toast/FAB/toolbar 样式从 `Assistant.module.css` 拆出，避免首屏加载整份 assistant CSS。
- 静态资源加 `compress()`（SSE 路由跳过）；构建时输出 gzip/brotli 体积。
- 评估 `manualChunks`：React、pdfjs、markdown/KaTeX 分开，但不要把 pdfjs 提前加载。

### 3.5 流式与列表

- 流式 flush 从 50ms 调到 120–150ms；`startTransition` 更新消息。
- 流式中先渲染轻量文本/Markdown，KaTeX 只在完成时跑一次；`MessageView` memo。
- 长会话消息列表加 `content-visibility: auto` 或窗口化；至少让非流式消息不参与每次 flush。
- 搜索/全部页每 8–16 页 `await new Promise(r => setTimeout(r, 0))`，显示 `done/total`；必要时把文本扫描移入 worker。

### 3.6 OCR：后台队列 + 自动准备

**服务端：**

- 用 `worker_threads` 跑 `ppu-paddle-ocr`，不要阻塞 Hono 事件循环；单 worker、并发 1，队列满时返回 429/排队状态。
- 页面图片用 `ArrayBuffer` transfer 给 worker，避免 base64/复制；worker 内复用 ONNX session 和图片缓存。
- `/api/ocr` 改成接收原始 JPEG/PNG 字节（`application/octet-stream`）而不是 JSON base64，客户端用 `canvas.toBlob`；少 33% 传输和一次解码。
- 队列项带 `id/docHash/page/priority`；请求断开或超时只结束等待，不杀正在跑的推理；worker 崩溃自动重启。
- `server/dist/ocr-worker.mjs` 作为独立 esbuild entry，Electron 继续用 `ELECTRON_RUN_AS_NODE` 启动。
- 桌面构建把 6.3MB 模型放进 `resources/ocr-models`，默认直接可用；浏览器版首次自动下载。
- 模型下载加 SHA-256 校验；`/api/ocr/status` 返回 `ready/downloading/progress/error`。

**客户端：**

- 新增 `OcrScheduler`，不再把“识别”绑在按钮上：
  - `high`：当前页稳定 600ms 后自动入队；切页时新页插队。
  - `normal`：可视区 ±1 页、用户刚停留过的页。
  - `low`：搜索/总结/“全部页”明确需要的页；带进度、可取消。
  - 不做“打开文档就 OCR 全本”，1000 页扫描件需要 12–20 分钟，会烧 CPU。
- 文档切换时 `docEpoch` 失配的 OCR 结果直接丢弃；队列清空，正在跑的 worker 结果只记日志。
- 首次发现扫描页且模型未安装：后台自动下载，显示非阻塞状态；不再默认弹 `OcrDialog`。设置里保留手动下载/重试。
- OCR 完成：
  - `setPageText` + per-page `ocr:<hash>:<page>` 持久化（不要每页重写整份 record）；
  - 若当前页/页码范围/智能筛选命中该页，更新 `currentPageText`/`pageRangeText`；
  - `textVersion++`，搜索如果开着则增量重跑；BM25 缓存的筛选结果标记过期；
  - 清对应 summary chunk 缓存，而不是整份 summary。
- UI 无感：
  - ContextBar 的“本页没有文字层”改成一行状态：“正在后台识别… / 已识别，可搜索”，不弹窗；
  - 顶栏或 Rail 底部只在有任务时显示 `OCR 3/120` + 暂停/取消；
  - 页面角标可选显示小圆点，不遮挡 PDF。
- “整本总结 / 全部页”遇到扫描页：
  - 先给出“需要识别 N 页，约 X 分钟”的非阻塞提示，可继续用已有文字或等待；
  - 选择等待时按 low 优先级识别，进度写入 summary 状态；
  - 选择跳过时在总结里明确“第 x–y 页为扫描页，未纳入”。

**可选增强（后续）：**

- 行级 OCR 文本层已实现（见 3.7）；词级矩形留作后续增强。
- 对同一页的重复识别做缓存；对低置信度行标记，不直接丢弃。

### 3.7 OCR 文本层：接近原生文字层，但明确标注

目标：扫描页可以像正常 PDF 一样拖选、双击、复制、高亮、引用、搜索回跳；所有入口明确提示“OCR 识别、可能有误差”；默认开启，可在设置关闭。

#### 3.7.1 数据模型

- `OcrLine.box` 从 `unknown` 收紧为 `{ x, y, width, height }`（PP-OCR 的像素坐标）。
- OCR 完成后按页面保存：

```ts
type OcrPageRecord = {
  hash: string;
  page: number;
  text: string;
  lines: Array<{
    text: string;
    confidence: number;
    /** 归一化到 0–1，和 zoom/DPR 无关 */
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
  imageWidth: number;
  imageHeight: number;
  /** 产生这份结果的 OCR 模型，切换模型后仍可追溯 */
  model: OcrModelId;
  updatedAt: number;
};
```

- 归一化在客户端完成：`x = box.x / imageWidth`，其余同理；这样缩放、窗口变化、DPR 切换都不需要重新 OCR。
- 存储用 `ocr:<hash>:<page>`，按页读写；旧的 text-only record 迁移为 `lines: []`，文本层在重新识别前不显示，但搜索/提问仍可用。

#### 3.7.2 渲染

- 新增 `OcrTextLayer`，和 pdf.js 的 `.textLayer` 同级、同尺寸；只在原生文字层为空/极少时显示，避免重复文字。
- 每行一个绝对定位 `span`：
  - `left/top/width/height` 用归一化比例；
  - `font-size` 取行高的 CSS 像素值，`line-height: 1`；
  - 用 canvas `measureText` 算文本宽度，`transform: scaleX(boxWidth / measuredWidth)` 对齐行宽；
  - `color: transparent`，保留 `::selection` 可见；`pointer-events: auto`；z-index 2，链接层仍在 z-index 3。
- 行数通常 30–80/页，只渲染可视页；`measureText` 结果按字体/字号缓存。
- 无障碍：文本真实存在于 DOM，保留 `lang="zh-CN"` 和 `aria-label="OCR 识别文字层"`；不要 `aria-hidden`。

#### 3.7.3 交互与提示

- **选择**：浏览器原生拖选、双击选词、Shift 扩展；`PdfViewer.handleSelection` 检测选择是否落在 `[data-ocr-layer]`，按行重建文本（保留换行），写入 `source: "ocr"`。
- **复制**：照常复制；toast 改为“已复制 OCR 文字（可能有误差）”。
- **高亮**：沿用同一套归一化 rects；`Highlight` 增加 `source?: "ocr"`；侧栏高亮项显示小 `OCR` 标签；点击时走 3.1.1 的 `LocationTarget`，直接落在高亮行，而不是页顶。
- **引用/上下文**：`Selection`/`ContextState` 增加 `source`；上下文块写成 `<selection source="ocr">`，用户消息 note 标“OCR”；系统提示里说明 OCR 文本可能有识别错误，重要结论需对照原图。
- **搜索**：优先用 OCR 行框计算命中矩形（按字符比例估算 x 偏移），不依赖 DOM 文本层的换行；搜索结果项带 `OCR` 标记。跨行查询可退回 DOM Range。
- **常驻提示**：
  - 页面右下角页码旁加一个很小的 `OCR` 徽标，title 为“本页文字由 OCR 识别，可能有误差”；
  - 首次在 OCR 层选中文字时，弹一次非阻塞 toast：“这是 OCR 识别的文字，可能有误差；可复制、引用或高亮。”每个文档只提示一次；
  - 选区工具条显示 `OCR` 小标签；上下文 chip 显示“选中（OCR）”；高亮侧栏显示 `OCR`；
  - 设置里提供“启用 OCR 文本层”开关和误差说明。
- **低置信度**（可选）：置信度低于阈值的行加虚线底纹/tooltip，不默认显示，避免视觉噪声。

#### 3.7.4 对齐边界

- PP-OCR 的 `box` 是轴对齐行框，不是字形级矩形；倾斜、旋转、双栏文档的选区可能略宽/略高，提示文案要覆盖这一点。
- 双栏/多栏按 `y` 再 `x` 排序，保持阅读顺序；必要时用行框的重叠关系分组。
- 原生文字层存在时默认不用 OCR 层；只有文本长度低于阈值（如 20 字）才启用。混合页可提供“强制显示 OCR 层”调试开关。
- 视觉回归：在 100%/150%/200% 缩放下截图检查行框与文字重合；允许 2–3px 误差；选区高亮覆盖整行是可接受的，词级框作为后续增强。

#### 3.7.5 性能

- 只渲染可视页；OCR 行数有限，不做逐字 span。
- 搜索按行匹配，复杂度 `O(lines × query)`，避免 DOM Range 在长页上反复 `getClientRects`。
- OCR 行数据按页懒加载，不在打开 1000 页文档时全部读入内存。

#### 3.7.6 验收

- 扫描页可以拖选一行/多行，复制出的文字与 OCR 文本一致（保留换行）。
- 选中后可“高亮”，侧栏出现 `OCR` 标签；点击高亮跳到该行，rect 落在视口 10–40% 区域。
- 选中后可“引用”，上下文 chip 和用户消息 note 标 `OCR`；模型收到 `<selection source="ocr">`。
- 搜索能命中 OCR 文本，结果项标 `OCR`，命中矩形覆盖对应行。
- 100%/200% 缩放下，行框与页面文字重合误差 ≤3px；关闭“OCR 文本层”后回到纯图片阅读。

### 3.8 OCR 模型尺寸选择（后续）

行级框已经确定，模型尺寸不写死。当前 `server/src/ocr.ts` 把 tiny 的文件名、URL、字节数、`PP-OCRv6 tiny` 文案全部硬编码；改成模型注册表后，后续加 small/medium 不需要改调度和文本层。

```ts
type OcrModelId = "v6-tiny" | "v6-small" | "v6-medium";

type OcrModelSpec = {
  id: OcrModelId;
  label: string;
  /** 官方 PP-OCRv6 的 det/rec/dict 文件与校验和 */
  files: { detection: ModelFile; recognition: ModelFile; dictionary: ModelFile };
  approxBytes: number;
  speed: "fast" | "balanced" | "accurate";
  license: string;
};
```

- **默认 tiny**：随桌面包分发（约 6.3MB），首次使用零下载；浏览器版仍可后台自动下载。
- **small / medium**：不做首包，用户在设置 → OCR 里切换时按需下载；显示体积、单页耗时、内存占用和精度说明。
- **服务端**：`OCR_MODELS_ROOT/<modelId>/` 分目录存放；`/api/ocr/status` 返回 `activeModel / installedModels / availableModels / progress`；`/api/ocr/config` 切换模型；切换时取消队列并重启 OCR worker，避免同时加载两套 ONNX session。
- **全局单一 active model**：不为每份文档并行加载不同尺寸；切换模型后，旧文档的 OCR 结果继续可读，需要更高精度时手动“用新模型重新识别”。
- **缓存**：`OcrPageRecord.model` 记录来源；切换模型不会自动把旧结果作废，文本层/搜索仍可用，只是标注“由 tiny 识别”；用户可对当前页或整本执行“用新模型重新识别”。重新识别后 `textVersion++`，并清对应 summary chunk。
- **文本层无关**：行级归一化框与模型无关，换模型只是重新生成 `lines`；选区和 `LocationTarget` 不需要改。
- **安全**：`/api/ocr/config` 走 3.3 的本地信任边界；模型下载加 SHA-256，只允许注册表内 URL。
- **打包**：只带 tiny；small/medium 下载到 `userData/ocr-models`，桌面离线安装依然可用 tiny。

> 来源要统一：当前 `server/src/ocr.ts` 从 oar-ocr 下载 tiny 的 `.onnx`；`ppu-paddle-ocr` 自带 `MODEL_PRESETS`（`v6-tiny` / `v6-small` / `v6-medium`，`.ort`）。重构时二选一：统一用包内 preset + 自带 cache，或继续 oar-ocr 并补齐 small/medium 的 URL/SHA。不要混用两套模型缓存。

验收：

- 设置里能在 tiny / small / medium 之间切换；未安装时显示下载进度，安装后 worker 自动重载。
- 切换后新识别页面的 `OcrPageRecord.model` 正确；旧页仍可读，文本层/高亮不崩。
- 重新识别当前页后，文本层、搜索、BM25、summary 缓存按新文本更新。
- 不改变行级框协议；词级框仍留作未来增强。

## 4. 迁移计划

### Phase 0：基线与护栏（1 天）

- 保留现有 61 个单测、25 个 E2E；新增：
  - 5000 页/混合尺寸样本的 DOM 数量、scrollHeight 稳定性、跳页精度；
  - 邪恶 Origin + text/plain 的 403 测试；
  - 切文档 abort + 原文档回答持久化；
  - summary 与 chat 互斥；
  - 1000 页窗口化后 `[data-page]` 数量上限。
- 提交本文档与可重复的基准脚本。

### Phase 1：独立快修（1–2 天）

- CSP `wasm-unsafe-eval`。
- Hono Origin/Content-Type/body limit；provider host 变更语义。
- `AssistantPanel` 条件挂载 + 对话框 lazy。
- 打开失败 toast；密码 PDF 入口。
- 精确 scrollTop 恢复；`setZoom` 也持久化。
- Token 估算缓存 + debounce。

### Phase 2：阅读器布局重写（3–5 天）

- 引入 PageMetrics、VirtualPageList、滚动锚点、缩略图虚拟网格。
- 删除全量 `pageNumbers.map` 与 `currentPage` 的父级订阅。
- `PageView` memo 化；颜色/高亮改为 props 或局部订阅。
- 精确位置跳转：高亮/搜索/引用统一 `LocationTarget`，高亮落点 + 脉冲。
- 通过 5000 页 p95 < 16ms、无 >50ms 长任务、混合尺寸 scrollHeight 稳定、跳页 ±1px、高亮 rect 落在视口 10–40% 区域。

### Phase 3：助手运行时 + OCR 后台化（5–7 天）

- `activeRun` 状态机、docEpoch、abort/持久化捕获。
- 单会话存储 schema + 迁移；summary usage 汇总。
- OCR worker + 队列；当前页自动识别、模型后台准备、搜索/总结按需等待。
- 流式节流 + 最终 KaTeX；消息列表优化。
- 通过切文档、并发总结、刷新恢复、配额失败、OCR 不阻塞 SSE 测试。

### Phase 3b：OCR 文本层（2–3 天）

- `OcrTextLayer` 行级透明文本、选择/复制/高亮/引用。
- `source: "ocr"` 贯穿 Selection/Highlight/Context/Prompt。
- OCR 徽标、首次选择提示、侧栏/搜索/上下文标签、设置开关。
- 100%/200% 缩放对齐截图回归；扫描页高亮跳转复用 Phase 2 的 `LocationTarget`。

### Phase 4：产品与分发（2–3 天）

- 最近文档、搜索当前命中/上下跳转、密码 PDF。
- OCR 模型尺寸选择：tiny 默认随包，small/medium 按需下载与切换；模型注册表、状态/进度、worker 重载。
- 焦点陷阱、Esc 一致性、`aria-live` 流式播报。
- OCR 运行时裁剪（arm64/DirectML）、locales 裁剪、可选 OCR 组件；实测 zip 183MB，进一步压缩需要拆分 Electron/OCR 运行时。
- 代码签名/自动更新（若公开发布）。

## 5. 验收指标

| 指标                       |            当前 |                                     目标 |
| -------------------------- | --------------: | ---------------------------------------: |
| 5000 页滚动 p95            |         62–69ms |                                    <16ms |
| 5000 页单帧长任务          |         50–82ms |                                 无 >50ms |
| 5000 页 DOM 节点           |          25,076 |                                   <1,500 |
| 1000 页滚动 p95            |          20.8ms |                                    <12ms |
| 混合尺寸 scrollHeight 变化 | 74,387 → 73,984 |                           首次布局后稳定 |
| 阅读位置恢复误差           |     4200 → 3554 |                                     ±2px |
| 高亮跳转落点               |            页顶 |                  rect 在视口 10–40% 区域 |
| 1000 页全部加入            |    890ms 无进度 |                           有进度、可取消 |
| 1000 页全文搜索            |  3.1s，进度停滞 |                     增量进度、每帧可交互 |
| OCR 单页耗时               |        0.7–1.6s |               同量级，但不阻塞主线程/SSE |
| OCR 事件循环阻塞           |           690ms |                                    <50ms |
| OCR 首次使用               | 弹窗 + 手动下载 |                     自动后台准备，无弹窗 |
| 扫描页搜索/总结            |      不自动纳入 |                  OCR 完成后自动刷新/纳入 |
| 扫描页划词/复制            |          不支持 |                           行级文本层可用 |
| OCR 选区/高亮提示          |              无 | 页码徽标 + 工具条/上下文/侧栏 `OCR` 标签 |
| OCR 高亮跳转               |              无 |                       落在高亮行，非页顶 |
| OCR 文本层对齐             |              无 |                  100%/200% 缩放误差 ≤3px |
| OCR 模型选择               |       写死 tiny | tiny/small/medium，按需下载、worker 重载 |
| OCR 旧结果追溯             |      无模型标识 |       `OcrPageRecord.model` + 可重新识别 |
| 输入（80 万字符上下文）    |          7ms/次 |                                  <2ms/次 |
| 首屏 JS+CSS                |   ~995KB 未压缩 |                         <500KB，面板按需 |
| 切文档旧请求               |  993ms 后仍完成 |                             <100ms abort |
| 总结+提问并发              |    2 个并发 run |                                 单一 run |
| 总结费用                   |          全部 — |                                 完整分桶 |
| 跨站改 provider            |  200 + Key 外发 |                         403，无 Key 外发 |
| 桌面 zip                   |         235.7MB |                     ≤190MB（实测 183MB） |

## 6. 不建议做的事

- **不要整体重写 PDF 渲染层。** 文字层对齐、CMap、色彩滤镜、链接层是经过真实文档和 E2E 验证的资产。
- **不要先上绝对定位再补 PageMetrics。** 混合页尺寸会立刻暴露；先把尺寸/偏移模型做对。
- **不要把助手拆成很多个 store 再靠事件同步。** 先在一个 store 内做切片和显式状态机，降低迁移风险。
- **不要用 `content-visibility` 假装虚拟化。** 它减少绘制，不减少 React 组件、canvas 元素和内存。
- **不要打开文档就全量 OCR。** 1000 页扫描件 12–20 分钟，必然发热/掉帧；要按当前页、可视页、搜索/总结需要分级调度。
- **不要把 OCR 文本伪装成原生文字。** 必须保留 `OCR` 标志、误差提示和 `source: "ocr"`，否则用户会误以为原文就是如此。
- **不要逐字渲染 OCR span。** 行级 span 足够选择/复制/高亮；逐字会增加 DOM 和测量成本，还会放大对不齐的问题。
- **不要用 `scroll-margin` 修高亮跳转。** 归一化 rect 才能适配缩放、混合页尺寸和虚拟列表。
- **不要为了包体积移除 OCR 能力。** 优先裁剪平台二进制/locales，或把运行时做成可选组件。

## 7. 待决策

1. OCR 默认策略：已实现“当前页自动识别”；可视区 ±1 页预取尚未做，是否需要在滚动时预热相邻页？
2. OCR 模型：tiny 随包（存在时）/按需下载，small/medium 按需下载；已实现。三档都随包会增加约 40MB，暂不建议。
3. OCR 文本层：已默认开启，行级框；词级框留作未来增强。
4. OCR 模型：已采用全局一个 active model；单文档覆盖后置。
5. 最近文档是否只存本机，还是支持固定/收藏？
6. 密码 PDF 是否支持保存密码（安全风险）还是每次输入？
7. 1M token 软预算是否改成按模型能力动态设置？
8. 是否接受 Phase 2/3 期间用 feature flag 保留旧实现做回退？

## 附：复现说明

- 生产构建：`npm run build && npm start`，`http://127.0.0.1:8787`。
- 大文档样本：PyMuPDF 生成 1000/2000/5000 页 A4、40 页混合尺寸、JPX 图片页。
- 并发/安全：独立 `MOCK_AI=1` 服务与假 upstream；测试 Key 为 `sk-test-secret`，不涉及真实密钥。
- 所有测量为单机 Edge 结果；绝对值会随机器变化，但趋势和数量级可复现。
