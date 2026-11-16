# Changelog

## [0.3.0] — 2026-11-16

### 新增

- 所有 JSON 端点使用 zod schema：provider / OCR install / OCR config / OCR source / source test / OCR image / chat；非法字段统一返回 `invalid_request`。
- 新增 `server/src/config.ts`：启动时校验 `PORT` / `HOST` / `APP_ORIGIN` / `MOCK_AI` / provider 变量，配置错误直接退出并给出可读原因。
- IndexedDB schema 版本（`meta:db` = 2），启动时迁移最近文档缓存并写入版本。
- Electron 启动页：窗口先显示品牌启动页，本地代理并行启动，再切换到应用。

### 变更

- E2E 按域拆为 viewer / rendering / assistant / panel / ocr / app 六个文件，公共注入与 mock 守卫集中到 `helpers.ts`；默认 2 worker。
- PDF 测试样本移到 `tests/fixtures/pdf/`，通过 `DataTransfer` 注入，不再进入 `public/` 与 `dist/`。
- 桌面包裁剪：移除 `@napi-rs/canvas` 的 ICU 数据、OpenCV 的 TypeScript 源码/声明与 Electron 默认应用；本地 zip 183MB → 177.8MB。
- 启动健康检查轮询 250ms → 100ms；Chromium 关闭后台网络、组件更新与媒体会话服务。

### 性能

- 本地 Electron：窗口出现约 **0.49s**（原约 1.70s），应用就绪约 **1.37s**（原约 1.85s）。
- E2E：6 文件 + 2 worker，40 个用例约 1.5 分钟（原串行约 2.1 分钟）。

### 工程

- 73 个单元测试 / 40 个 Playwright E2E。
- `npm run check:docs` / `check:motion` / release 门禁保持不变。

## [0.2.0] — 2026-11-16

### 新增

- 虚拟化页面列表：只挂载可视区附近的页面，千页文档滚动与跳页不再依赖全量 DOM。
- 密码 PDF：加密文档弹出密码框，错误密码可重试，取消后保留当前文档。
- 最近文档：≤24MB 的 PDF 在本机缓存，空状态与“更多”菜单可直接重开；总缓存 64MB、最多 8 条，按最近使用淘汰。
- 引用回跳：记录每页最后阅读位置，点击引用回到该页的阅读锚点。
- 本地 OCR worker 与行级文本层：扫描页可拖选、复制、高亮、引用、搜索；tiny/small/medium 三档模型。
- 关于页：构建注入的版本 / commit / 构建日期、复制诊断信息、手动检查更新与第三方声明。

### 变更

- 设置导航合并为 6 项：模型服务 / 阅读 / 对话 / 扫描件 OCR / 隐私与数据 / 关于。
- 全站字号下限 12px，正文 13px、对话正文 14px；新增 `--text-*` 体系。
- 图标统一为 Lucide SVG，移除 Segoe Fluent 字体图标、MorphIcon 与 `morphicons` 依赖；状态图标改用 CSS 交叉淡入。
- 动效统一为 `--motion-*` / `--ease-*` token，keyframes 集中到 `styles/motion.css`。
- 品牌色收敛到 `--brand-*`，组件不再硬编码 hex / rgb；浅色 `--muted` 调整到 AA 对比度。
- 应用图标与 favicon 同源生成，16px 使用简化几何。
- OCR 下载支持自定义镜像根地址；切换未下载模型先询问，下载成功后才切换 active model。

### 修复

- 切换未下载的 OCR 模型时，安装进度会错误地以当前模型状态判定完成。
- 设置内容滚动与对话框焦点顺序；补充阅读区、消息列表、设置内容的键盘可聚焦区域。
- 图标状态切换不再依赖 JS spring，`prefers-reduced-motion` 下无缩放动画。

### 移除

- `morphicons` 依赖与平台字体图标分支。
- 更多菜单中的重复快捷键提示与重复的页码元信息。

### 安全

- 新增 `docs/PRIVACY.md`，隐私说明与代码保持一致（24MB / 64MB / 8 条 / IndexedDB 未加密 / 127.0.0.1）。
- OCR 镜像只允许 http(s)、最多 3 次重定向、拒绝 HTML 错误页与超过 64MB 的文件。
- 检查更新只在点击时请求 GitHub Releases，不后台轮询、不自动下载/安装。

### 工程

- 新增 Prettier / ESLint 门禁、E2E 与 node tsconfig、文档链接检查、动效检查。
- CI 增加 lint、format、server build 与 Windows job；release workflow 增加版本校验、体积预算与 release notes。
- 69 个单元测试 / 40 个 Playwright E2E。

### 已知问题

- DOCX 导入、OCR 词级命中框、双页/横向阅读尚未实现。
- 桌面版未做代码签名与自动更新；Windows SmartScreen 会提示未知发布者。
- OCR 行框对倾斜或双栏页面可能略宽。
- 引用回跳使用页内最后阅读位置，不是字级定位。

## 0.1.0 — 2026-11-16

首个可日常使用的本地优先版本。

### 阅读器

- pdf.js 6.5.438 自绘虚拟化阅读器：连续滚动、文字层、中文 CMap、搜索高亮、目录、缩略图、高亮。
- 真实 DPR 渲染（最高 4×、2²⁵ 像素预算），浏览器缩放/跨屏后自动重渲染。
- 100% = 96dpi，和桌面 PDF 阅读器一致；适合宽度 / 适合页面 / 实际大小。
- 色彩模式：原色 / 反转 / 智能暗色 / 灰度 / 护眼 + 强度。
- 正文内链与外部链接可点击；跨页选择可加入上下文。

### AI 助手

- 悬浮窗 / 侧边栏双形态，拖动、四边与四角缩放、最小化/关闭动效。
- 上下文：当前页、全部页、自定义页码、目录章节、选中文字、整页/框选截图、附件、对话引用。
- 长文档 BM25 智能筛选；长文档 map-reduce 整本总结（进度、取消、分段缓存）。
- 引用 `[[p.n]]` 可回跳；Markdown + KaTeX；TokenMeter 与可配置费用单价。
- 多会话、思考强度、上下文预算（默认 1M，软限制）、对话历史窗口。
- 扫描件 OCR：PP-OCRv6 tiny 按需下载、本机代理推理、写入文本缓存。

### 设置与数据

- 960px 宽设置面板：模型服务 / 界面 / 阅读外观 / 对话 / OCR / 数据与隐私 / 关于。
- 模型服务可在 UI 配置 Base URL、默认模型、允许列表与 API Key；密钥只写入本机代理。
- 高亮按文档持久化，可导出 Markdown / JSON。
- 清理当前对话或全部本地数据。

### 桌面与工程

- Electron 桌面壳：自动启动本地代理、单实例、外部链接交给系统浏览器。
- Electron Builder 配置（NSIS + portable），OCR 模型与 provider 配置写入 `userData`。
- 63 个单元测试 / 33 个 Playwright E2E。
- MIT License、贡献指南、安全策略、CI 工作流与 issue/PR 模板。

### 已知限制

- DOCX 导入、OCR 画布命中框、双页/横向阅读尚未实现。
- 智能暗色使用 48px 亮度蒙版；超大色块交界处有柔和过渡。
- 色彩滤镜依赖 Chromium / Edge / WebView2。
- 服务端默认单用户；局域网/公网部署需自行加认证与限流。
