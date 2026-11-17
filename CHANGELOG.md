# Changelog

## [0.7.3] — 2026-11-17

### 修复

- **升级后关于页仍显示 0.6.2**：应用二进制已经是 0.7.2，但 Chromium 复用了上一版本的
  `index.html` 与旧哈希资源。现在本地服务对页面与 API 返回 `Cache-Control: no-store`，
  带哈希的 `/assets/*` 使用一年 immutable；主窗口 URL 附带 `?v=<version>`，每次升级
  都是新的缓存键。
- 缺失的 `/assets/*`、`/pdfjs/*` 返回 404，不再用 `index.html` 伪装成功，避免旧页面
  指向已不存在的构建产物。
- 系统级注册改为写当前用户的开始菜单，并清理旧版 MSI 残留的公共开始菜单链接；不再让
  不可写的旧快捷方式阻塞注册。

## [0.7.2] — 2026-11-17

### 修复

- **系统级 PDF 注册失败并留下半截注册表项**：PowerShell 5.1 把带引号的
  `"C:\Program Files\...\PaperReader.exe" "%1"` 传给 `reg.exe /d` 时会拆成多个参数，
  `reg add` 报“无效语法”。字符串值改用 PowerShell 注册表 provider 写入，`REG_NONE`
  空值继续走 `reg.exe`；系统级注册现在能完整写入 ProgID、Applications、Capabilities、
  RegisteredApplications 与 OpenWithProgids。
- 系统级注册的开始菜单快捷方式改用 `CommonStartMenu` 的真实路径，创建失败也不再让
  整个注册流程失败。
- 提权脚本把错误写入临时日志并回传到设置页；UAC 取消会明确提示“已取消管理员授权”，
  不再只显示一行 `Command failed`。
- 系统级移除同样改用 provider，并删除公共开始菜单里的“纸间”快捷方式。

## [0.7.1] — 2026-11-17

### 修复

- `?` 快捷键在部分键盘布局或合成按键事件中 `shiftKey` 不一致时，也能正常打开快捷键面板；
  面板内继续显示为 `?`。

## [0.7.0] — 2026-11-17

### 新增

- **Ctrl + 滚轮缩放**：以鼠标指针为中心平滑缩放，缩放后指针下的内容保持不动；
  Windows 与 macOS 触摸板捏合也走同一条路径。放大 / 缩小键与页头缩放按钮同样会保持阅读位置。
- **自定义快捷键**：快捷键面板（`?` / 左下角问号 / 设置 → 自定义快捷键）可点击任意组合键重新录制，
  支持冲突检测、单项恢复默认、全部恢复默认与清除绑定；偏好保存在本机 localStorage。
- **逐行引用**：回答引用升级为 `[[p.n|原文片段]]`，模型按原文摘录短句；引用角标改为右上角
  低对比度灰色徽标，点开后逐条显示页码、原文片段与行号。
- 点击引用会跳到该行并高亮约 2.6 秒；没有原文片段时退回该页上次阅读位置并给整页描边反馈。

### 修复

- 缩放不再因为上一次“跳转目标”而滚回旧位置：每个跳转请求只应用一次。
- 缩放时保留指针（或视口中心）下的页面内容，不再出现放大后整页上下跳动。
- 引用角标不再用高对比度主题色，而是更轻的灰色 superscript / 徽标。

## [0.6.2] — 2026-11-17

### 新增

- NSIS 安装向导增加“PDF 打开方式”页：
  - **在 PDF 的“打开方式”中显示纸间（推荐）**，默认勾选；只声明 OpenWith/ProgID/Capabilities，
    不写 `.pdf` 默认值。
  - **安装完成后打开 Windows 默认应用设置**，默认不勾选；勾选后只打开系统设置，最终是否设为默认
    仍由用户确认。
- 安装包内声明与卸载清理：卸载会移除 OpenWith、ProgID、Capabilities 与 RegisteredApplications，
  不触碰当前 `.pdf` 默认应用。

### 说明

- MSI 的 WiX UI 暂不提供该勾选页；安装后可在 设置 → 关于 中点击“注册到系统”或“仅当前用户”。
- 静默安装（`/S`）不会弹页，也不会自动声明，适合部署脚本自行控制。

## [0.6.1] — 2026-11-17

### 修复

- 系统级 PDF 注册时同时创建公共开始菜单快捷方式，便于 Windows 11 默认应用列表识别。
- 使用绝对路径调用 PowerShell，避免被当前目录的同名程序劫持；取消 UAC 时返回可读提示。
- 注册状态区分系统级与当前用户；移除系统级关联需要同样的管理员授权。

## [0.6.0] — 2026-11-16

### 新增

- 提供 **NSIS 安装包**（`paper-reader-v0.6.0-x64.exe`）与 **MSI 安装包**
  （`paper-reader-v0.6.0-x64.msi`）；安装后为 `PaperReader.exe`，开始菜单与快捷方式显示“纸间”。
- `build:installers` 本地脚本；release workflow 同时构建并上传 NSIS、MSI、便携 zip 与 OCR 组件包。
- MSI 使用 `build/zh-CN.wxl` 的 GBK 代码页，解决中文产品名导致的 WiX `LGHT0311`。

### 修复

- **Windows 11 默认应用列表找不到纸间**：该列表读取系统级 `HKLM` 注册，便携版的当前用户
  `HKCU` 注册只会出现在“打开方式”。设置页新增“注册到系统（需要管理员）”，通过一次 UAC
  写入 `HKLM`，状态区分“系统级 / 当前用户”。
- `RegisteredApplications` 的值名与 `Capabilities\ApplicationName` 统一为“纸间”，并补齐
  ProgID 的 `Application` 子键与 `OpenWithProgids`。
- 安装包不再带入 `node_modules`（ONNX/OpenCV 仍由 OCR 组件包按需下载），NSIS 约 111MB、
  MSI 约 116MB。

### 边界

- 注册系统级关联需要管理员授权；取消 UAC 不会修改任何系统设置。
- 注册本身不会改变默认应用，仍需在 Windows 设置中选择“纸间”确认。
- 代码签名仍未配置，SmartScreen 会提示未知发布者。

## [0.5.0] — 2026-11-16

### 新增

- 设置 → 关于增加“默认 PDF 应用”：注册当前用户的 PDF OpenWith/ProgID 与
  `RegisteredApplications`，并打开 Windows 默认应用设置。
- 状态区分“未注册 / 已注册未设为默认 / 纸间 / 安装路径已变化”，移动可移植目录后可重新注册。
- 支持移除关联；只清理纸间的注册项，不修改 `.pdf` 当前默认应用。

### 安全与边界

- 注册和移除都由用户显式点击触发，不随启动自动执行，也不会静默修改默认应用。
- 仅写 `HKCU`，不需要管理员权限；若纸间是当前默认应用，移除前会要求先在 Windows 设置中改掉。

### 已知问题

- Windows 10/11 不允许应用直接设置默认关联，最终确认必须在系统设置中完成。
- 可移植版移动目录后关联会指向旧路径，需要重新注册。

## [0.4.1] — 2026-11-16

### 修复

- 桌面版读取 Windows 系统代理并把 `HTTPS_PROXY` 传给本地代理；Node `fetch`
  通过 undici 使用该代理。此前 0.4.0 在需要代理才能访问 GitHub 的机器上无法下载
  OCR 组件包，即使 Electron 的更新检查可以联网。
- 本地推理地址（`127.0.0.1` / `localhost`）始终绕过代理，避免 Ollama 等本机
  provider 被误转发。

### 工程

- 服务端 bundle 增加约 1MB（undici）；基础 zip 仍在 160MB 预算内。

## [0.4.0] — 2026-11-16

### 变更

- 桌面版不再内置 OCR 运行时：ONNX Runtime、OpenCV、canvas 与模型移出基础包，
  首次在设置 → 扫描件 OCR 中开启时下载约 26MB 的组件包（解压约 71MB）。
- 基础 zip 从 172.4MB 降到 146.5MB；组件包单独上传为
  `paper-reader-ocr-v0.4.0-win-x64.zip`，两者合计仍受 185MB 预算约束。
- 组件包下载后按发布页 `SHA256SUMS.txt` 校验 SHA-256，校验失败拒绝安装。
- 360 等安全软件拦截用户目录 DLL 写入时，运行时自动回退到
  `%TEMP%/paper-reader-ocr/<version>`；基础包与回退路径都能继续识别。
- 打开扫描件不再静默下载大组件：后台 OCR 在组件缺失时停下，设置页提供一次点击安装。
- OCR worker 从安装目录解析 `ppu-paddle-ocr`，不再依赖应用目录下的 `node_modules`。
- `package:ocr-pack` 与 release workflow 增加组件包构建、压缩、校验和体积门禁。

### 工程

- 79 个单元测试 / 41 个 Playwright E2E。
- 新增组件包校验和解析与 SHA-256 文件哈希测试，以及“组件未安装时只显式下载”的 E2E。

### 已知问题

- 安全软件回退到 `%TEMP%` 后，若临时目录被清理，需要重新下载组件。
- OCR 组件包当前只提供 Windows x64；macOS / Linux 打包未验证。
- 桌面版仍未做代码签名与自动更新安装。

## [0.3.1] — 2026-11-16

### 变更

- 服务端拆分：`index.ts` 745 → 51 行，路由移至 `routes/provider.ts`、`routes/chat.ts`、`routes/ocr.ts`，provider 状态与 mock/校验拆到 `provider.ts`、`http.ts`、`mock.ts`。
- 设置页拆分：`SettingsDialog` 1154 → 674 行，OCR 与关于章节移入 `settings/sections/`。
- Vitest 增加 v8 覆盖率与 `src/lib` 阈值（lines/statements/branches 50%、functions 40%）；CI Linux 改跑 `test:coverage`。
- Release 包体积预算从 200MB 收紧到 185MB；Vite 忽略 `coverage/`、`test-results/`、`release/` 变更。

### 工程

- 76 个单元测试 / 40 个 Playwright E2E。
- 本地覆盖率：statements 51.1%、branches 51.7%、functions 40.4%、lines 51.7%。

### 已知问题

- 桌面版未做代码签名与自动更新安装；Windows SmartScreen 会提示未知发布者。
- OCR 行框对倾斜或双栏页面可能略宽，词级命中框尚未实现。
- 仅提供 Windows x64 可移植包；macOS / Linux 打包未验证。
- IndexedDB 未加密，共用电脑时请使用“清空所有本地数据”。
- `useAssistantStore` 仍未拆分，后续重构需要补充 characterization tests。

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

### 已知问题

- 桌面版未做代码签名与自动更新安装；Windows SmartScreen 会提示未知发布者。
- OCR 行框对倾斜或双栏页面可能略宽，词级命中框尚未实现。
- 仅提供 Windows x64 可移植包；macOS / Linux 打包未验证。
- IndexedDB 未加密，共用电脑时请使用“清空所有本地数据”。

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
