# 桌面化与 UI 重做计划

目标版本：0.8.0（已实现，版本与 CHANGELOG 已同步）
状态：已完成 A/B/C/D/E/F；安装包、标题栏、双击 PDF 与 OCR 升级复用已手工验证。

## 1. 背景与目标

纸间已经具备完整的阅读、AI 对话、OCR 与桌面打包能力，但当前成品仍有三类明显问题：

1. **桌面产品感不足**：安装后的 exe、快捷方式、任务栏图标没有统一；双击关联的 PDF 不会真正打开文件；窗口仍是“浏览器内容 + 系统标题栏”的叠层。
2. **界面像开发者工具**：设置页、关于页、隐私页、AI 面板里大量出现 `IndexedDB`、`localStorage`、`server/.env`、`bundle`、Chromium 版本等实现细节；同时有大量 11–12px 的说明小字，信息层级平。
3. **状态与反馈不完整**：诊断信息只是复制版本号；OCR 组件在每次应用升级后被判定为未安装并重新下载；不少交互只有硬切，没有过渡。

本计划只做**桌面壳、信息架构、视觉与文案、动效、OCR 持久化**，不改 PDF 渲染、AI 流式协议、OCR 识别算法等核心逻辑。

## 2. 已确认的产品决策

| 决策点   | 选择                                                           |
| -------- | -------------------------------------------------------------- |
| 窗口外观 | 无边框标题栏 + Windows 系统窗口按钮（Window Controls Overlay） |
| 诊断信息 | 改为“运行状态 / 故障排查”，不再做无意义的版本复制              |
| 设置结构 | 左侧分类，一次只显示一页，带切换动效                           |
| 隐私信息 | 统一收敛到“隐私与数据”一页，成品 UI 不出现实现细节             |
| OCR 组件 | 应用升级后继续复用，除非 OCR 运行时格式版本变化                |

### 2.1 子代理审查后的修正

初版计划已按代码审查结果修正，以下是最关键的变化：

- **不调用 `app.setName("纸间")`**：`app.getPath("userData")` 依赖 `app.getName()`；顶层 `package.json` 没有 `productName`，改名会让 `data/provider.json`、`ocr-runtime`、`ocr-models` 全部换目录，直接导致配置丢失和 OCR 重下。任务栏名称继续由 `setAppUserModelId` 与 exe 资源解决。
- **设置导航保留普通 `button`**：不使用 `role="tab"`。现有 E2E 与无障碍检查依赖 `<nav aria-label="设置分类">` 下的 6 个 button；改成 tab 角色会改变 `getByRole("button")` 的结果。
- **不做 `afterPack` + rcedit**：改用 electron-builder 自带的 `signExecutable: false`。它会跳过代码签名，但仍用内置 resedit 写入图标、版本与产品名，不需要下载 winCodeSign；便携目录继续由 `package-desktop.mjs` 的 rcedit 处理。
- **MSI 不写 `icon` 字段**：electron-builder 26 的 `MsiOptions` 没有该字段，MSI 图标来自 `win.icon`。
- **隐私文档本身就是 UI**：`SettingsDialog.tsx` 用 `?raw` 直接渲染 `docs/PRIVACY.md`，所以技术名词必须从该文件彻底移除；实现细节另放不被前端 import 的文档。
- **文件打开一次完成**：`takePendingPdf()` 直接返回 `{ name, bytes }` 并清空，不再设计“先取路径、再按路径读”的两段式 IPC。
- **设置页保留挂载**：一次只显示一页，但所有分类保持挂载（非当前页 `display:none`），避免模型/OCR 表单草稿在切换时丢失。

## 3. 现状证据（实现前已确认）

- `package.json` 中 `"signAndEditExecutable": false`，electron-builder 不会给 `PaperReader.exe` 写入图标；桌面/开始菜单快捷方式因此显示 Electron 默认图标。electron-builder 26 支持 `signExecutable: false`：只跳过签名、保留 resedit 资源编辑，是更合适的修正。
- `electron/main.mjs` 只处理窗口和 PDF 关联注册，**没有读取 `process.argv`**；`PDF_PROG_ID` 的打开命令是 `"PaperReader.exe" "%1"`，双击 PDF 实际不会把文件送进应用。
- `electron/main.mjs` 顶层没有 `app.setName`；`app.getPath("userData")` 当前落在 `app.getName()`（`pdf-ai-reader`）下。任何改名都会迁移 `data/provider.json`、`ocr-runtime`、`ocr-models` 的根目录，必须避免。
- `server/src/ocrRuntime.ts` 的 `rootIsReady()` 要求 `runtime.json` 里的 `version` 等于 `OCR_PACK_VERSION`（即应用版本）；主进程每次启动都把 `OCR_PACK_VERSION` 设为 `app.getVersion()`，所以每次升级都会判定旧运行时失效。
- 同一文件的 `fallbackRoot` 也按应用版本分目录：`%TEMP%/paper-reader-ocr/<version>`，升级后同样失效。
- OCR 模型目录 `OCR_MODEL_DIR` 是稳定的 `<userData>/ocr-models`，模型本身不会随升级重下；问题集中在运行时组件。
- `src/features/settings/SettingsDialog.tsx` 是 707 行的单文件，所有分类在一页内滚动；导航点击是 `scrollIntoView`。
- `src/features/settings/sections/AboutSection.tsx` 的“复制诊断信息”只拼接版本、平台、provider host、模型、OCR 模型名。
- `src/features/settings/SettingsDialog.tsx` 的导航脚注写着 `localStorage`、`server/data`、前端 bundle；隐私区正文写 `IndexedDB`；OCR 区有大量“ONNX Runtime、OpenCV、worker 线程”等实现说明。
- `src/features/settings/SettingsDialog.tsx` 用 `import("../../../docs/PRIVACY.md?raw")` 渲染隐私文档，因此 `docs/PRIVACY.md` 本身就是成品 UI 的一部分，不能保留实现名词。
- AI 面板 `src/features/assistant/AssistantPanel.tsx` 的会话菜单写着“对话保存在本机 IndexedDB”；模型选择器提示“把 server/.env.example 复制为 server/.env”。`src/lib/ai/client.ts` 的错误提示也直接让用户检查 `server/.env`。
- `src/features/assistant/Assistant.module.css` 有 94 处 `font-size: var(--text-xs)`，另有若干硬编码 `10px`；大量正文/提示都用 12px。
- 已有动效只覆盖面板进场、菜单进场、FAB、页面闪烁等；设置导航、分类切换、按钮按压、列表进入、状态反馈仍是硬切。
- 现有 E2E 依赖以下可访问名称，重做时必须保留或同步更新测试：
  - `设置`、`隐私与数据`、`关于`
  - `查看完整隐私说明 →`
  - `清空所有本地数据`、`再次点击确认清空所有本地数据`
  - `检查更新`、`发现新版本 9.9.9`、`打开发布页`
  - `tests/e2e/assistant.spec.ts` 还要求 `settings.getByRole("navigation", { name: "设置分类" }).getByRole("button")` 恰好 6 个。
  - `tests/e2e/ocr.spec.ts` 依赖“PP-OCRv6 tiny · 已安装”“组件未安装”“下载 OCR 组件”等文案，OCR 区重做时要同步更新测试。

## 4. 工作流 A：桌面壳与安装体验

### A1. 无边框标题栏

**目标**：顶部只保留一条 52px 的应用标题栏，右侧是 Windows 原生最小化/最大化/关闭按钮；可拖动、双击最大化、按钮可点击。

实现要点：

- `electron/main.mjs`：
  - Windows 下设置 `titleBarStyle: "hidden"`、`titleBarOverlay: { color, symbolColor, height: 52 }`。
  - 保留 `frame: true`，使用系统按钮而不是自绘按钮。
  - 新增 IPC `window:set-titlebar-theme`，根据亮/暗主题调用 `win.setTitleBarOverlay({ color, symbolColor, height: 52 })`。
  - 默认浅色：`color: "#f6f5f2"`、`symbolColor: "#18202f"`；夜间：`color: "#0f131b"`、`symbolColor: "#e8eaf1"`。
- `electron/preload.cjs`：
  - 暴露 `isDesktop: true`、`setTitleBarTheme(dark)`。
  - 暴露 `platform` 供界面做 Windows 专属布局。
- `src/lib/desktop.ts`（新文件）：
  - 统一声明 `window.paperReader` 类型、`isDesktop()`、`setTitleBarTheme()`、`takePendingPdf()`、`onOpenPdf()`、`openDataFolder()` 等桥接方法。
  - **把现有 `src/lib/update.ts` 里的 `DesktopBridge` / `Window.paperReader` 声明迁到这里**，`update.ts` 改为引用，避免 TS2717 重复声明。
- `src/app/App.tsx`：
  - 根节点加 `data-desktop={isDesktop() ? "true" : undefined}`。
  - 监听 `theme` 变化，调用 `setTitleBarTheme(theme === "night")`。
- `src/app/Header.tsx` + `src/app/Chrome.module.css`：
  - `--header-h` 调整为 `52px`；`AssistantPanel.tsx` 里硬编码的 `top: 48` / `height: window.innerHeight - 48` 改为使用同一个常量；`Chrome.module.css` 搜索层的 `top: 56px` 与窄屏 `54px` 同步调整。
  - 标题栏背景、品牌区、文档标题区设置 `-webkit-app-region: drag`；所有按钮/输入/菜单设置 `no-drag`。
  - 右侧保留 WCO 区域：`padding-right: calc(100vw - env(titlebar-area-width, 100vw))`，浏览器环境回退为普通 padding。
  - “更多”菜单在窗口控制按钮左侧；窄窗口下收起床位。
- 兼容：非 Windows 或浏览器开发环境不启用 overlay；`isDesktop()` 为 false 时不加拖拽属性。

**验收**：

- 桌面窗口没有第二条系统标题栏。
- 拖动标题栏可移动窗口，双击可最大化/还原。
- 最小化/最大化/关闭按钮位置与系统一致，暗色主题下图标颜色正确。
- 浏览器模式下布局不出现空白右侧区域。

### A2. 图标、安装器与快捷方式

**目标**：安装包、卸载器、exe、桌面快捷方式、开始菜单快捷方式、任务栏全部显示纸间图标。

实现要点：

- `package.json`：
  - 删除 `"signAndEditExecutable": false`，改为 `"signExecutable": false`。
    - `signExecutable: false` 只跳过代码签名，仍由 electron-builder 内置的 resedit 写入图标、产品名、版本与版权；不需要下载 winCodeSign。
    - 不新增 `afterPack`，也不要自己维护第二套 rcedit 逻辑（便携目录除外）。
  - `win.icon` 继续使用 `build/icon.ico`。
  - `nsis` 增加：
    - `installerIcon: "build/icon.ico"`
    - `uninstallerIcon: "build/icon.ico"`
    - `uninstallDisplayName: "纸间"`
    - `deleteAppDataOnUninstall: false`
    - `runAfterFinish: true`
  - **不要加 `nsis.installerHeaderIcon`**：它只在 one-click 安装器生效，当前是 `oneClick: false` 的 assisted installer。若要品牌头图，用 `installerHeader` BMP，不在本次范围。
  - **不要给 `msi` 加 `icon` 字段**：`MsiOptions` 没有该字段；MSI 图标取自 `win.icon`。保留 `shortcutName` 与 `zh-CN.wxl`。
  - 不需要把 `public/icon.png` 单独加进 `files`：Vite 会把 `public/` 原样复制到 `dist/`，而 `dist/**/*` 已经在打包列表里。打包后路径为 `dist/icon.png`，供 `BrowserWindow.icon` 与关于页使用。
- `scripts/build-icons.mjs`：
  - 除 `build/icon.png`、`build/icon.ico`、`public/favicon.svg` 外，再写一份 `public/icon.png`（512×512）。
  - 关于页用 `/icon.png`，不要直接 import `build/icon.png`（它不在 Vite 的 public/src 资源图里）。
  - `package.json` 增加 `"prebuild": "npm run icons"`，让 `npm run build`、CI、`build:desktop*` 在 Vite 前自动生成 `public/icon.png`；同时把生成物提交到仓库，避免有人只跑 `vite build` 时 404。
- `scripts/package-desktop.mjs`：
  - 继续用 rcedit 给便携版 `PaperReader.exe` 写图标与版本资源；`build` 目录不会进包，`package-desktop` 必须自己完成这一步。
  - 复用与 electron-builder 一致的字段：`FileDescription`、`ProductName`、`CompanyName`、`LegalCopyright`、`OriginalFilename`。
  - 生成的 `README.txt` 不再写 `userData` 路径细节，改成用户能看懂的一句话。
- `build/installer.nsh`：
  - 保留 PDF 打开方式勾选页与卸载清理。
  - **不要重写 `CreateShortCut`**：electron-builder 已经根据用户的“创建桌面快捷方式”选择创建；强行重写会在用户取消勾选时仍然创建快捷方式。
  - 快捷方式图标依赖 exe 资源；确保 exe 图标正确即可。若覆盖安装后图标仍是旧的，文档提示刷新 Windows 图标缓存。
  - 卸载时保留 `userData`（不删除配置、OCR 组件、模型、阅读数据）。

**验收**：

- 干净安装后，`%LOCALAPPDATA%\Programs\PaperReader\PaperReader.exe` 在资源管理器中显示纸间图标。
- NSIS 安装器 exe 本身显示纸间图标；桌面、开始菜单、卸载项、控制面板“应用和功能”都显示纸间图标。
- MSI 的 `.msi` 文件图标由 Windows Installer 决定，electron-builder 26 不提供该字段；MSI 只验收快捷方式、ARP 图标与 exe 图标。不要把它写成“MSI 文件本身有图标”。
- 覆盖安装后快捷方式图标不变成 Electron。
- 卸载后快捷方式消失，`userData` 仍保留。

### A3. 双击 PDF 打开

**目标**：通过“打开方式”或默认应用双击 PDF 时，纸间启动并直接打开该文件；应用已运行时再双击，复用现有窗口。

实现要点：

- `electron/pdf-args.mjs`（新文件，便于单测）：
  - `pdfArgFrom(argv)`：从参数中筛出存在的 `.pdf` 文件路径，过滤开发环境的脚本路径、URL 和 `--` 开关。
  - `readPdfPayload(path)`：校验扩展名、存在性、大小（上限 **128MB**，避免 IPC 全量复制过大），返回 `{ name, bytes }`；不暴露任意路径读取接口。
- `electron/main.mjs`：
  - 启动时记录 `pendingPdfPath`；`app.on("second-instance", (_event, argv) => ...)` 解析新参数并聚焦窗口。
  - 新增 IPC `app:take-pending-pdf`：**一次完成读取并清空**，返回 `{ name, bytes } | null`。不再设计“先取路径、再按路径读”的两段式接口。
  - 明确 renderer-ready 握手，避免事件丢失或重复打开：
    - `App` 挂载时先注册 `onOpenPdf`，再调用 `app:renderer-ready`，最后调用 `takePendingPdf()`。
    - 主进程维护 `rendererReady`；第二次实例到达时，若 rendererReady 为 true 且窗口未加载中，读取 payload 后通过 `app:open-pdf` 发送并清空 pending；否则写入 pending，由 `takePendingPdf()` 取走。
    - 窗口 `did-start-loading` 时把 `rendererReady` 置回 false，防止重载期间丢消息。
    - 事件发送与 `takePendingPdf()` 共用同一个 `pendingPdf`，发送前清空，保证只打开一次。
  - `app:open-data-folder`：`shell.openPath(app.getPath("userData"))`，供运行状态页使用。
  - 窗口 `icon` 使用打包后的 `dist/icon.png`；开发环境回退 `public/icon.png`。
  - **不要调用 `app.setName("纸间")`**：会改变 `app.getPath("userData")`，导致配置、OCR 组件和模型全部换目录。任务栏名称由 `app.setAppUserModelId("cn.paperreader.app")` 与 exe 资源负责。
- `electron/preload.cjs`：
  - 暴露 `takePendingPdf()`、`onOpenPdf(callback)`、`openDataFolder()`。
- `src/lib/desktop.ts`：
  - `fileFromDesktopPayload({ name, bytes })` 生成 `File`；`bytes` 从 IPC 的 `Uint8Array` 还原为 `ArrayBuffer`。
- `src/app/App.tsx`：
  - 启动挂载后调用 `takePendingPdf()`，有文件则 `openFile`。
  - 订阅 `onOpenPdf`，处理第二次启动传入的文件。
  - 打开失败用现有 toast 提示，不弹系统错误框。

**验收**：

- 安装后右键 PDF → 打开方式 → 纸间，应用启动并显示该 PDF。
- 应用已运行时再次双击另一份 PDF，窗口前置并打开新文件。
- 开发模式（`electron.exe`）不注册关联，但手动传参仍可打开。

### A4. OCR 组件升级后不重复下载

**根因**：运行时目录本身稳定，但 `runtime.json` 的 `version` 被写成应用版本，升级后 `rootIsReady()` 判定失效；临时回退目录也按应用版本分目录。

实现要点：

- `server/src/ocrRuntime.ts`：
  - 新增 `OCR_RUNTIME_FORMAT = 1`，表示运行时包的目录/依赖格式，不与应用版本绑定。
  - `rootIsReady()` 改为：
    - 存在 `runtime.json` 且 `format === OCR_RUNTIME_FORMAT`；或
    - `format` 缺失（旧版本安装的运行时）且关键文件存在，视为兼容。
    - **不再比较 `version` 与 `OCR_PACK_VERSION`**。
  - 兼容判定不能只看 `ppu-paddle-ocr/package.json`，至少检查：
    - `node_modules/ppu-paddle-ocr/package.json`
    - `node_modules/onnxruntime-node/package.json`
    - `node_modules/@napi-rs/canvas/package.json`
  - 安装时写入 `{ format: OCR_RUNTIME_FORMAT, packVersion: PACK_VERSION, installedAt, electron, node }`；`PACK_VERSION` 继续只用于拼接下载 URL，`electron/node` 只用于诊断，不参与失效判断。
  - `fallbackRoot` 改为稳定目录：`%TEMP%/paper-reader-ocr/runtime-v${OCR_RUNTIME_FORMAT}`。
  - 兼容旧回退目录：`runtimeCandidates()` 额外检查 `%TEMP%/paper-reader-ocr/<旧版本号>`，若其中的旧 marker 与关键文件有效，直接复用；下次成功安装时再清理旧目录。
  - 如果未来运行时确实需要不兼容升级，只 bump `OCR_RUNTIME_FORMAT`，旧目录自动失效并重下一次。
  - 保留“首选目录被安全软件拦截时回退临时目录”的逻辑。
- 迁移策略：用户从 0.7.x 升级到 0.8.0 后，旧的 `runtime.json`（`version: "0.7.3"`）没有 `format`，按兼容处理，不重下；下一次安装/修复时才写入新格式。
- 健康检查：
  - `rootIsReady()` 只做轻量文件检查；真正的 ABI/加载问题由 OCR worker 初始化错误暴露。
  - worker 初始化失败时，设置页显示“组件可能损坏”，提供“修复组件”，不要静默删除或自动重下。
- `server/src/routes/ocr.ts` + `server/src/ocr.ts`：
  - 增加 `POST /api/ocr/repair`：先 `shutdownOcr()`，再 `installOcrRuntime({ force: true })`，完成后刷新状态。
  - `installOcrRuntime(force)` 为 true 时跳过“已安装即返回”，重新下载并替换运行时目录；只在用户主动点击时调用。
- `tests/unit/ocr-runtime.test.ts`：
  - 增加纯函数 `runtimeMarkerAcceptable(marker)` 的测试：
    - 旧 marker（无 format，有 version）→ true
    - 当前 format → true
    - 未来/错误 format → false
    - marker 缺失/损坏 → false
  - 增加 `runtimeRequiredFilesPresent(root)` 的临时目录测试：缺 ONNX/Canvas 文件时返回 false。
- `tests/unit/ocr-models.test.ts`（新增或并入现有）：
  - `OCR_MODEL_DIR` 不变时，模型文件存在即已安装，不受应用版本影响。
- `tests/unit/ocr-repair.test.ts`（新增）：
  - mock `installOcrRuntime` / `shutdownOcr`，断言 `POST /api/ocr/repair` 先关闭 worker 再以 `force: true` 重装，并返回 202。
  - 至少覆盖“已安装但仍强制重装”的分支，防止未来又把 `force` 丢了。
- 设置页 OCR 区：
  - 状态显示“组件已就绪”，不再出现“组件未安装”的误判。
  - 高级区提供“重新检查”与“修复组件”（仅在用户主动点击时重下）。

**验收**：

- 0.7.3 安装好 OCR 后覆盖安装 0.8.0，首次打开设置仍显示“已安装”，不触发下载。
- 删除 `runtime.json` 或组件文件缺失时，才会要求重新下载。
- 主动点击“修复组件”可以重新下载并写入新 marker。

## 5. 工作流 B：设置页重做

### B1. 结构

把单文件拆成“壳 + 分类页”：

```text
src/features/settings/
  SettingsDialog.tsx          # 导航、tab 状态、Esc、焦点陷阱、隐私文档弹层
  sections/
    ModelSection.tsx
    ReadingSection.tsx
    ConversationSection.tsx
    OcrSection.tsx
    PrivacySection.tsx
    AboutSection.tsx
    parts.tsx                 # SettingsGroup / SettingsRow / Segmented / StatusDot / InlineResult
```

- 导航：`模型服务 / 阅读 / 对话 / 扫描件 OCR / 隐私与数据 / 关于`。
- 左侧 208px；右侧内容最大宽度 720px；卡片宽度 `min(1040px, 94vw)`，高度 `min(86vh, 820px)`。
- **导航保留普通 `<button>`**，外层 `<nav aria-label="设置分类">`；使用 `aria-current="page"`，不要用 `role="tab"`。原因：现有 E2E 与 `tests/e2e/assistant.spec.ts` 依赖 6 个 button 的计数。
- 分类首次访问后保持挂载：非当前页 `display: none` + `aria-hidden="true"`，当前页显示；这样模型/OCR 表单草稿、已测试的镜像地址不会因切换丢失，也避免打开设置时一次性触发所有分类的副作用。
- 切换时当前页加 `settings-page-in` 动画（淡入 + 上移 6px），导航指示条滑动；内容区回到顶部；焦点留在导航按钮。
- 支持 ↑/↓/Home/End 在导航按钮间移动（普通 button 上的键盘增强，不改变角色）。
- Esc 关闭；焦点陷阱沿用 `useFocusTrap`。
- 删除导航脚注（localStorage / server/data / bundle）。

### B2. 字号与排版

- `src/styles/tokens.css`：
  - `--text-xs: 13px`
  - `--text-sm: 14px`
  - `--text-md: 15px`
  - `--text-lg: 17px`
  - `--text-xl: 24px`
  - `--text-2xl: 28px`
- 规则：
  - 正文、表单标签、行标题一律 `--text-sm` 或以上。
  - `--text-xs` 只用于状态徽标、页码、时间、快捷键键帽等辅助信息。
  - 清掉 `Assistant.module.css` 里硬编码的 `10px`（引用角标、上下标等），最小 12px；不能用 token 调整覆盖它们。
  - 删除设置页所有 `.note` 长说明；必须保留的说明改成标题下的一行 `sectionDesc`（14px，最多两行）。
  - 不再用 `code` 展示路径、环境变量、实现名。

### B3. 各分类设计

#### 模型服务

- 顶部：标题 + 状态徽标（`已配置` / `未配置` / `本地演示`）。
- 快速预设：DeepSeek / OpenAI 兼容 / 本地 Ollama，胶囊按钮。
- 表单：
  - Base URL
  - 默认模型
  - API Key（全宽，占位符只提示“已配置，留空保持不变”）
  - 允许切换的模型（全宽）
- 操作：`保存并测试`（主按钮）、`仅保存`（次按钮）；结果显示为带图标的行内提示。
  - 现有 `fetchModels()` 固定请求 `/api/models`，只使用已保存配置，不能用未保存的表单草稿测试。因此“测试”必须先保存，再调用 `fetchModels()`；不要保留一个会误导用户的独立“测试连接”按钮。
  - 如果将来要测试草稿，需要新增 `/api/provider/test` 接收临时 Base URL/Key；本次不做。
- 删除“运行信息”四行和所有字段 hint。
- “费用单价”与“上下文/预算”收进 `高级` 折叠区；折叠区内保留保存按钮。
- “清除已保存的密钥”改为文字按钮，放在 API Key 行下方，不再单独占一行 checkbox。
- 不再提示 `server/data`、`server/.env`、bundle。

#### 阅读

- 助手形态：两张并排选择卡（悬浮窗 / 侧边栏），带小预览图和 14px 标签。
- 阅读外观：复用 `ColorModeControl`，设置页传入 `compact` 隐藏底部 hint/scale 小字。
- 快捷键：一行 `自定义快捷键` 按钮 + 当前主快捷键提示（如 `Ctrl+J`）。
- 删除“快捷键一览”长列表和全部说明。

#### 对话

- 三行：
  - 思考强度：关闭 / 低 / 高 / 最高
  - 上下文预算：32k / 128k / 256k / 512k / 1M
  - 对话历史窗口：10 / 20 / 40 / 80 / 不限
- 标题下一行说明：“控制回答速度、成本与上下文长度。”
- 删除 `reasoning_effort`、软限制、硬上限等实现说明。

#### 扫描件 OCR

- 顶部状态卡：
  - 图标 + “扫描件文字识别”
  - 状态徽标：已就绪 / 未安装 / 下载中 / 组件缺失
  - 一行说明：“首次使用需下载识别组件，之后可离线使用。”
- 开关行：`自动识别没有文字层的页面`。
- 模型选择：三张横向小卡（tiny / small / medium），显示名称、速度/精度、大小、已安装状态；未下载的模型点击后在 **`[data-settings-section="ocr"]` 内部**显示行内确认块，不使用 portal 弹层。确认块包含“取消”和“下载并切换”，保证现有 OCR E2E 的 section 作用域仍能定位。
- 主操作：`下载组件` / `下载模型` / `重新检查`。
- `高级` 折叠：
  - 自定义镜像地址 + 测试/保存/恢复默认。
  - 已保存镜像的文件 URL 列表。
  - `修复组件`（主动重下）。
- 删除 ONNX Runtime、OpenCV、worker 线程、exe 路径等说明。
- 错误提示保留可操作信息（网络、镜像、权限），不显示堆栈。

#### 隐私与数据

合并原“隐私与数据”和“数据”，只保留一个分类。

- 顶部：盾牌图标 + “你的文档留在本机” + 一行说明。
- 三组卡片：
  1. **不会离开本机**：PDF 解析、搜索、高亮、OCR 都在本机完成。
  2. **会发送给模型**：你选中的页码文本、选中文字、截图、附件、引用，以及你的问题。
  3. **保存在本机**：阅读位置、对话、高亮、OCR 文本、最近文档；显示 `navigator.storage.estimate()` 得到的占用量（不可用时省略）。
- 数据管理：
  - `清空本篇对话与上下文`（保留当前页面与 PDF）
  - 把现有“清空所有本地数据”改名为 **`清空阅读数据`**（二次确认）。当前实现只清 IndexedDB/localStorage，不清模型密钥、OCR 组件与模型；旧名字名不副实，测试同步更新。
  - 二次确认文案保留“操作不可撤销”原句（`tests/e2e/app.spec.ts:98` 仍断言该短语），可同时补充“不会删除 PDF 文件”。
  - 一行提示：“会删除阅读位置、对话、高亮、OCR 文本与界面偏好；不会删除磁盘上的 PDF 文件、模型密钥或 OCR 组件。”
  - 如需彻底清除模型密钥，在“模型服务”里提供独立的“清除已保存的密钥”；OCR 组件在 OCR 分类里提供“修复/删除组件”。
- 网络连接折叠区：
  - 模型服务、OCR 下载、手动检查更新。
  - 不出现域名清单以外的实现细节。
- 底部：`查看完整隐私说明 →`（保留现有可访问名称）。
- 删除 `IndexedDB`、`localStorage`、`server/data`、`未加密` 等词；如需说明未加密，用“本地记录未加密，共用电脑请清空数据”。

#### 关于

- Hero：
  - 64px 应用图标（使用 `public/icon.png`，不要 import `build/icon.png`）+ “纸间” + 版本徽标 + 一句产品描述。
- 更新卡：
  - 当前版本、`检查更新` 按钮、结果行；保留 `发现新版本 9.9.9` 与 `打开发布页`。
- 默认 PDF 应用卡：
  - 状态行（默认 / 已注册未设为默认 / 未注册 / 路径已变化）
  - 主操作：`注册到系统` 或 `打开默认应用设置`
  - 次级操作收进“更多”：`仅当前用户`、`移除关联`
  - 一行说明：“Windows 需要你在系统设置中确认默认应用。”
- 链接卡：GitHub、问题反馈、隐私说明、许可证，2×2 行式链接。
- 运行状态 / 故障排查卡：
  - 见工作流 D。
- 第三方声明折叠区：保留完整声明链接。
- 删除 Electron/Chromium/pdf.js 版本小字。

### B4. 隐私文档

重写 `docs/PRIVACY.md`，保留用户能读懂的章节，去掉实现名词。注意：这个文件会被 `?raw` 直接渲染进设置弹层，所以**文件本身不能出现 IndexedDB、localStorage、server/data、bundle 等词**。

- 保留标题与“本地处理”小节（E2E 依赖）。
- 保留“不会发送整份 PDF”这句话（E2E 依赖）。
- 内容按“本地处理 / 发送给模型 / 网络请求 / 保存与删除 / 安全边界”组织。
- 需要给开发者的路径、存储实现、目录结构放到独立的 `docs/PRIVACY-TECHNICAL.md`，不从前端 import，也不在隐私弹层里链接。
- 文档弹层排版：正文 15px、行高 1.8、标题层级清晰、最大宽度 760px。
- 焦点管理：隐私文档用独立的 `docRef` + `useFocusTrap(docRef, Boolean(privacyDoc))`；文档打开时给设置卡片加 `inert`，关闭后恢复焦点到“查看完整隐私说明”。不能只靠 `aria-modal`，否则 Tab 会跑到背后的设置按钮。
- 同时修正 `src/hooks/useFocusTrap.ts`：当前监听挂在容器上，焦点落到 body 时 Tab 不会被拦截。改为在 `document` 上监听 Tab（仅在 active 时），并让设置卡片的 trap 在隐私文档打开时 `active=false`，避免两个 trap 互相抢焦点。

## 6. 工作流 C：全局界面清理

### C1. 顶栏 / 侧栏 / 空状态

- 顶栏：
  - 高度 52px；品牌标记 22px；文档名 13px。
  - 所有按钮 32px，hover 背景过渡，`:active` 轻微缩放。
  - “更多”菜单：最近文档显示文件名 + 页数，菜单项 36px 高；保留打开/搜索/快捷键/设置/关闭文档。
- 左侧 Rail：
  - 宽度 52px，按钮 36px；active 使用左侧 2px 指示条 + 柔和底色。
  - 悬浮/按下动效；禁用态降低对比度。
- 页面/目录/高亮侧栏：
  - 标题 13px，计数用 pill；缩略图 hover 轻微上浮；缩略图加载完成淡入。
  - 空状态改成图标 + 一句 14px 文案。
- 空阅读页：
  - 图标、`打开 PDF 开始阅读` 24px、一句说明（文件只在这台电脑上解析）、40px 主按钮、13px 拖拽提示。
  - 最近文档改成 3–5 行卡片，hover 背景，显示页数与日期。
  - 删除“浏览器本地解析”等措辞。

### C2. AI 面板

- 会话菜单：
  - 删除“对话保存在本机 IndexedDB”，改成“对话只保存在这台电脑”。
  - 会话项显示标题 + 消息数/时间；删除二次确认保留。
- 模型选择器：
  - 删除 `server/.env.example` 开发说明。
  - 未配置时显示“尚未配置模型服务，请到设置中填写 API Key。”并提供 `打开设置` 按钮（需要给 `AssistantPanel` 传入 `onOpenSettings`）。
  - 模型项显示名称 + 多模态标签；不可用模型置灰并说明原因。
- 所有错误提示同步清理开发词：
  - `src/lib/ai/client.ts:88,93` 的“检查 server/.env 中的 AI_API_KEY”“服务端未配置密钥，检查 server/.env”改成“请在设置 → 模型服务中检查 API Key”。
  - `src/features/assistant/OcrDialog.tsx:141-142` 的 `server/models/ppocrv6` 改成“在设置 → 扫描件 OCR 中下载模型”。即使这个弹窗当前未挂载，也一并清理。
- 上下文栏：
  - 收起态保持“来源数 · token · 占比”。
  - 展开态保留来源 chips、页面快捷操作。
  - 六个 token 桶收进 `用量详情` 折叠区（14px 行高），默认收起；删除 `预算 1M 仅作提示…` 小字。
  - 删除“锚点提示 / 未命中输入”这类术语，改成“上次发送 / 本次新增 / 缓存命中 / 输入 / 输出 / 预计费用”。
- 输入区：
  - 工具按钮 32px，send 34px；hover/active 动效。
  - token 提示 13px，仅保留 `≈ 1.7k` 与截图数量。
- 消息区：
  - 引用角标从 10px 提升到 12px。
  - 消息操作按钮 hover 时淡入上移 2px。
  - 思考过程 summary 13px。
- 面板标题栏：模型按钮、会话标题、形态切换、清空、最小化、关闭；删除重复说明性 title 之外的文字。

### C3. 弹窗与提示

- 快捷键弹窗：
  - 行高 36px，正文 14px，键帽 12px；分组标题 13px。
  - 录制态高亮 + 轻微脉冲；保存后恢复默认按钮淡入。
- 密码弹窗、截图预览、文本预览、确认弹窗：
  - 统一 14px 正文、32–36px 按钮、进场动效。
- Toast：
  - 13px，成功/错误图标，进入使用 `--motion-base`；不堆叠长句。
- 拖拽遮罩：
  - 15px 主文案 + 13px 次文案。

## 7. 工作流 D：运行状态 / 故障排查

新增 `src/lib/diagnostics.ts` 与设置页组件：

采集内容：

- 版本：`__APP_VERSION__`、`__GIT_SHA__`、`__BUILD_DATE__`
- 平台：Windows 版本 / Electron / Chromium（只在折叠详情里）
- 本地服务：`GET /api/health` 是否可用（2 秒超时）
- 模型服务：`config.hasKey`、`config.mock`、`config.baseUrlHost`、当前模型、上下文窗口
- OCR：运行时是否安装、当前模型、是否下载中、最近错误
- 本地数据：`navigator.storage.estimate()` 的 usage/quota
- 最近一次 `configError` / OCR `error`

界面：

- 4–5 行状态，每行左侧圆点（正常/警告/错误）+ 14px 标签 + 13px 说明。
- `重新检测` 按钮。
- `复制运行信息`：复制上述内容，不含 API Key；用于反馈问题。
- `打开数据文件夹`：仅桌面版显示，调用 `app:open-data-folder`。
- 故障项提供跳转：
  - 模型未配置 → 模型服务
  - OCR 未安装 → 扫描件 OCR
  - PDF 关联未注册 → 默认应用卡
- 删除旧的 `copyDiagnostics` 与版本小字。

## 8. 工作流 E：动效

统一使用 `src/styles/motion.css` 与现有 token，禁止裸写时长；新增关键帧：

- `settings-page-in`：`opacity 0 → 1`，`translateY(6px) → 0`
- `settings-nav-in`：导航指示条首次定位（可选，改用 transition）
- `sidebar-in`：`translateX(-6px) → 0` + 淡入
- `status-in`：状态行/结果 `translateY(4px) → 0` + 淡入
- `list-in`：最近文档/会话/搜索结果逐项淡入（可选，最多 5 项）

交互：

- `tokens.css` 增加 `--motion-stagger: 20ms`，供列表逐项延迟使用 `calc(var(--index) * var(--motion-stagger))`；不要在组件 CSS 里写裸 `20ms`。
- 导航指示条：`transform: translateY()` + `height` 过渡 `--motion-base --ease-out`。
- 分类切换：所有页面保持挂载；当前页加 `.pageActive` 触发 `settings-page-in`（通过切换 class 重启动画，不用 `key`，避免卸载丢草稿）。
- 按钮：`transition: background/color/transform`，`:active { transform: scale(0.97) }`。
- 菜单/弹层：保留 `pop-in` / `panel-in`；新增关闭时的淡出（用组件内 `closing` 状态，可选）。
- 列表/行 hover：背景使用 `--motion-fast`；卡片 hover 阴影/边框使用 `--motion-base`。
- OCR 下载进度、存储占用条：宽度过渡 `--motion-slow --ease-standard`。
- `prefers-reduced-motion: reduce` 下全部收敛为近即时；`scripts/check-motion.mjs` 必须通过，禁止裸 `\d+ms` 和未注册 keyframes。

## 9. 工作流 F：测试、文档与验收

### 测试

- 保留现有 E2E 可访问名称，必要时同步更新测试；不要为了测试保留开发词。
- 新增/调整：
  - 设置导航键盘移动（↑/↓/Home/End）与 `aria-current`；`tests/e2e/assistant.spec.ts` 的 6 个 button 计数不变。
  - `tests/e2e/app.spec.ts` 的“清空所有本地数据”改名为“清空阅读数据”，二次确认按钮同步改名。
  - `tests/e2e/ocr.spec.ts` 适配新 OCR 卡片：保留 `data-settings-section="ocr"`，更新“已安装”“组件未安装”“下载 OCR 组件”等文案断言；模型按钮的名称要明确（不能只写 `small` 与速度标签冲突）。
  - 隐私页不出现 `IndexedDB` / `localStorage` / `server/data` / `bundle`。
  - 隐私文档打开后 Tab 不离开文档弹层，关闭后焦点回到“查看完整隐私说明”。
  - 关于页运行状态：本地服务、模型、OCR、存储四行存在；`复制运行信息` 不包含 API Key。
  - 模型页 `保存并测试` 先保存再请求 `/api/models`；不要出现只测旧配置的独立按钮。
  - OCR marker 兼容性单测、`runtimeRequiredFilesPresent` 单测、repair 路由单测。
  - 桌面 argv 解析单测：`electron/pdf-args.mjs` + `tests/unit/pdf-args.test.mjs`。
  - `setName` 回归检查：确保没有新增 `app.setName`，`userData` 路径不变。
- `npm run icons`（并确认 `public/icon.png` 已提交）
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run check:docs`
- `npm run check:motion`
- `npm test`
- `PW_CHANNEL=chromium npm run test:e2e`
- `npm run build && npm run build:server`
- Windows 手工：安装/覆盖安装/卸载、快捷方式图标、双击 PDF、暗色标题栏、OCR 升级不重下。

### 文档

- `docs/DESKTOP.md`：标题栏、图标、文件打开、OCR 持久化、安装器。
- `docs/PRIVACY.md`：重写为用户可读版本。
- `docs/PRIVACY-TECHNICAL.md`：新建，承接目录、存储实现等技术细节，不被前端 import。
- `docs/BRAND.md`：标题栏/图标使用补充。
- `docs/README.md`：加入本计划索引。
- `README.md`：更新功能与截图。
- `CHANGELOG.md`：新增 `[Unreleased]` 段。
- `docs/RELEASE.md`：手工回归加入“升级后 OCR 不重下”“快捷方式图标”“双击 PDF”。

## 10. 实施顺序

0. **契约修正**（先做，避免返工）：
   - 合并 `Window.paperReader` 类型到 `src/lib/desktop.ts`，`update.ts` 引用。
   - 确认不新增 `app.setName`，`userData` 路径不变。
   - 确认设置导航继续是 6 个普通 button。
1. **A4 OCR 持久化 + 修复入口**（独立、可单独验证、风险最低）。
2. **A2 图标/安装器** + **A3 双击 PDF**（桌面产品化的硬指标）。
3. **A1 无边框标题栏**（涉及全局布局，放在设置重做前）。
4. **B 设置页拆分与重做**（最大块）。
5. **C 全局界面清理**（顶栏、AI 面板、侧栏、空状态、错误文案）。
6. **D 运行状态**。
7. **E 动效统一**（与 B/C 同步做，最后统一检查）。
8. **F 测试、文档、截图、安装包回归**。

每个阶段单独跑 typecheck/lint/相关测试，避免最后一次性排错。如果时间紧，可先交付 0.8.0 的 A + B1/B2 + D，把 C/E 放到 0.8.1；但本轮计划按完整清单执行。

## 11. 风险与处理

| 风险                                           | 处理                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app.setName` 改变 userData 路径               | **禁止调用**；回归检查 `app.getName()` 与 `app.getPath("userData")` 不变                                                   |
| WCO 在个别 Windows 版本/缩放比例下按钮遮挡内容 | 用 `env(titlebar-area-width)` 计算右侧留白；浏览器环境回退；必要时退回原生标题栏                                           |
| 主题切换时系统按钮颜色不同步                   | App 监听主题变化，IPC 调 `setTitleBarOverlay`；启动时先按浅色创建，加载后立即同步                                          |
| `signExecutable: false` 仍不写图标             | 用 `rcedit`/资源查看器检查 `PaperReader.exe`；必要时回退 `signAndEditExecutable: true`，但不要静默产出无图标包             |
| 覆盖安装后快捷方式仍显示旧图标                 | 依赖 exe 资源与 electron-builder 快捷方式；**不要重写 `CreateShortCut`**；Windows 图标缓存可能延迟，文档说明刷新资源管理器 |
| 文件打开 IPC 被滥用读取任意路径                | 一次性返回 `{ name, bytes }`，不提供路径读取接口；校验扩展名、存在性、128MB 上限                                           |
| 第二次启动事件在 React 挂载前丢失/重复         | `app:renderer-ready` 握手 + 单一 pending 队列；发送前清空，`takePendingPdf` 只取一次                                       |
| 隐私文档打开后 Tab 跑到背后设置页              | 独立 `docRef` focus trap + 设置卡片 `inert`；关闭后焦点回到入口                                                            |
| MSI 文件本身没有自定义图标                     | 明确验收边界：NSIS 安装器 exe 有图标；MSI 只保证快捷方式/ARP/exe 图标                                                      |
| `role="tab"` 破坏 E2E                          | 导航继续用普通 button + `aria-current`；`<nav>` 下保持 6 个 button                                                         |
| MSI 不接受 `icon` 字段                         | 只用 `win.icon`；构建时跑 `electron-builder --win msi` 验证 schema                                                         |
| 隐私文档仍出现实现词                           | `docs/PRIVACY.md` 本身按成品 UI 审查；`rg` 检查 `IndexedDB                                                                 | localStorage | server/data | bundle`；技术细节放 `docs/PRIVACY-TECHNICAL.md` |
| 设置页拆分类导致草稿丢失                       | 所有分类保持挂载，非当前页 `display:none`；只切换 class，不卸载                                                            |
| 设置页文案变化导致 E2E 失效                    | 先更新 `tests/e2e/app.spec.ts` 的“清空阅读数据”与 `tests/e2e/ocr.spec.ts` 的 OCR 文案；保留 `data-settings-section`        |
| 字号整体放大导致紧凑布局溢出                   | 先改 token，再逐组件检查设置、AI 面板、侧栏、顶栏；用 1200×800 与 1440×900 两档截图                                        |
| 旧 OCR marker 没有 format                      | 接受无 format 的旧 marker；额外检查关键文件；旧临时目录加入候选；worker 初始化失败提供“修复组件”                           |
| 删除“复制诊断信息”影响支持流程                 | 用“复制运行信息”替代，内容更完整且不含密钥                                                                                 |

## 11.1 文件清单

**新增**

- `src/lib/desktop.ts`（桥接类型 + 文件载荷转换）
- `src/lib/diagnostics.ts`（运行状态采集）
- `src/features/settings/sections/ModelSection.tsx`
- `src/features/settings/sections/ReadingSection.tsx`
- `src/features/settings/sections/ConversationSection.tsx`
- `src/features/settings/sections/PrivacySection.tsx`
- `src/features/settings/sections/parts.tsx`
- `electron/pdf-args.mjs`
- `tests/unit/pdf-args.test.mjs`
- `tests/unit/ocr-repair.test.ts`
- `docs/PRIVACY-TECHNICAL.md`（不被前端 import）
- `public/icon.png`（由 `scripts/build-icons.mjs` 生成）

**重构**

- `src/features/settings/SettingsDialog.tsx`（壳 + 导航 + 隐私文档弹层）
- `src/features/settings/sections/OcrSection.tsx`
- `src/features/settings/sections/AboutSection.tsx`
- `src/components/Modal.module.css`（或新增 settings CSS Module）

**修改**

- `package.json`（`signExecutable: false`、NSIS 图标、files）
- `electron/main.mjs`、`electron/preload.cjs`
- `scripts/build-icons.mjs`、`scripts/package-desktop.mjs`
- `build/installer.nsh`
- `server/src/ocrRuntime.ts`、`server/src/ocr.ts`、`server/src/routes/ocr.ts`
- `src/lib/update.ts`（移除重复 Window 声明）
- `src/lib/ai/client.ts`（错误提示）
- `src/lib/storage/db.ts`（`clearAllLocalData` 保持只清阅读数据，命名与注释同步）
- `src/app/App.tsx`、`src/app/Header.tsx`、`src/app/Chrome.module.css`
- `src/hooks/useFocusTrap.ts`（document 级 Tab 监听，支持分层弹窗）
- `src/app/Rail.tsx`、`src/app/Sidebar.tsx`、`src/app/App.module.css`
- `src/features/viewer/PdfViewer.tsx`、`PdfViewer.module.css`
- `src/features/viewer/ColorModeControl.tsx`、`ColorModeControl.module.css`（`compact`）
- `src/features/assistant/AssistantPanel.tsx`、`ContextBar.tsx`、`Composer.tsx`、`MessageView.tsx`、`OcrDialog.tsx`、`Assistant.module.css`
- `src/styles/tokens.css`、`src/styles/motion.css`
- `tests/e2e/app.spec.ts`、`tests/e2e/assistant.spec.ts`、`tests/e2e/ocr.spec.ts`
- `docs/PRIVACY.md`、`docs/DESKTOP.md`、`docs/RELEASE.md`、`docs/README.md`
- `README.md`、`CHANGELOG.md`
- `.github/workflows/release.yml`（如新增 `public/icon.png` 不影响打包，但检查 OCR 包命名）
- `docs/BRAND.md`

## 12. 非目标

- 不做代码签名、自动更新安装、崩溃上报。
- 不做 DOCX、双页阅读、多文档对比。
- 不改 AI 流式协议、引用解析、BM25、OCR 识别模型。
- 不引入新的 UI 框架或动画库。
- 不删除现有功能入口，只重排与清理文案。

## 13. 完成标准

- 安装包、卸载器、exe、桌面/开始菜单快捷方式图标一致。
- 双击关联 PDF 能打开文件；第二次启动复用窗口。
- 0.7.x 升级后 OCR 组件不再重下，设置显示“已就绪”。
- 设置页一次只显示一页，切换保留草稿；无 `IndexedDB`/`localStorage`/`server/data`/`bundle` 等实现词（包括 `docs/PRIVACY.md` 本身）。
- 关于页有真实可用的运行状态与故障排查，不再复制无意义版本号。
- 正文默认字号 ≥13px，设置页无成段 12px 说明文字；`Assistant.module.css` 无硬编码 `10px`。
- `清空阅读数据` 的范围与文案一致；模型密钥、OCR 组件不在该按钮里被静默删除。
- 分类切换、导航、按钮、列表、状态反馈均有动效且尊重减少动态效果。
- 现有 E2E、axe、typecheck、lint、format、motion、docs 检查全部通过。
