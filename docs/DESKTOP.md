# Desktop (Electron)

纸间可以打成 Windows 桌面应用。桌面版和浏览器版使用同一套前端与本地 Hono 代理，区别是 Electron 负责启动/停止代理并加载本地页面。

## 开发

```bash
npm run desktop:dev
```

脚本会启动 `npm run dev:all`，等 Vite 就绪后打开 Electron，加载 <http://127.0.0.1:5173>。关闭 Electron 会尝试结束 Vite/API 子进程。

## 窗口与标题栏

- Windows 使用 `titleBarStyle: "hidden"` + `titleBarOverlay`，只保留一条 52px 的应用标题栏，右侧是系统原生最小化/最大化/关闭按钮。
- 标题栏空白区可拖动、双击最大化；按钮、输入框与菜单自动排除拖拽。
- 亮色标题栏为 `#f6f5f2`，夜间为 `#0f131b`；主题切换时通过 IPC 同步系统按钮颜色。
- 窗口图标与安装包图标来自 `build/icon.ico`；运行时的 PNG 图标来自 `public/icon.png`（由 `npm run icons` 生成，`prebuild` 会自动执行）。
- 不要调用 `app.setName("纸间")`：`app.getPath("userData")` 依赖应用名，改名会让配置、OCR 组件与模型换目录。

## 打开 PDF

- 安装器把 `.pdf` 的打开命令写成 `"PaperReader.exe" "%1"`。
- 启动时主进程从 `process.argv` 中筛出存在的 `.pdf` 文件；第二次启动通过 `second-instance` 复用窗口并聚焦。
- 渲染进程挂载后先注册文件事件，再调用 `rendererReady`，最后取走唯一一份待打开文件；文件只读取一次，上限 128MB。
- 不暴露通用的“按任意路径读文件”IPC；只接受启动参数中的 PDF。

## 启动

桌面版先显示品牌启动页，同时并行启动本地代理；代理健康检查通过后切换到应用。健康检查每
100ms 轮询一次。本机实测：窗口约 **0.5s** 出现，应用约 **1.4s** 就绪（冷启动首次约 4s，
之后走系统文件缓存）。启动页尊重 `prefers-reduced-motion`。

## 本地生产运行

```bash
npm run desktop
```

先构建前端与 `server/dist/index.mjs`，再用 Electron 启动本地代理并加载 `http://127.0.0.1:8787`。

## 打包

```bash
npm run package:desktop     # 可移植目录 release/win-unpacked（不依赖 electron-builder 二进制）
npm run build:desktop:dir   # 只产出 release/win-unpacked，便于快速验证
npm run build:installers    # NSIS .exe + MSI（按用户安装，无需代码签名）
npm run build:desktop       # NSIS + MSI + portable
```

`package:desktop` 复制 Electron 运行时、前端 `dist` 与 `server/dist`，生成可直接双击的 `PaperReader.exe`。OCR 运行时（ONNX Runtime、OpenCV、canvas）与模型不再进包，而是 `package:ocr-pack` 单独生成约 **26MB** 的组件包，首次在设置中开启 OCR 时下载。基础 zip 约 **146.5MB**，解压约 **317MB**。如果 `release/` 所在目录被 Windows 受控文件夹/杀毒软件拦截，可指定输出目录：

```powershell
$env:PDF_AI_RELEASE_DIR="$env:TEMP\PaperReader"
npm run package:desktop
```

安装包由 electron-builder 生成：

- NSIS：`release/paper-reader-v0.9.0-x64.exe`，支持选择安装目录、创建桌面与开始菜单快捷方式。
  安装器、卸载器、exe、桌面/开始菜单快捷方式使用同一套纸间图标。
  安装向导增加“PDF 打开方式”页：
  - 默认勾选“在 PDF 的‘打开方式’中显示纸间”，只写 OpenWith 声明，不影响默认应用。
  - 可选“安装完成后打开 Windows 默认应用设置”，默认不勾选；勾选后仍需在系统设置里确认。
  - 静默安装 `/S` 不显示该页，也不会自动写声明。
- MSI：`release/paper-reader-v0.9.0-x64.msi`，使用 `build/zh-CN.wxl` 的 GBK 代码页；中文产品名、快捷方式与卸载项正常。
  MSI 暂不提供该勾选页，安装后可在 设置 → 关于 中注册。`.msi` 文件本身的图标由 Windows Installer 决定；
  electron-builder 26 只通过 `win.icon` 控制 exe、快捷方式与控制面板图标。
- 两者都按当前用户安装到 `%LOCALAPPDATA%\Programs\PaperReader`，安装后的可执行文件为
  `PaperReader.exe`，快捷方式显示“纸间”；不包含 `node_modules` 或 OCR 组件。
- 首次构建 MSI 会下载 WiX，需能访问 GitHub；网络受限时先配置系统代理或 `HTTPS_PROXY`。
- `signExecutable: false` 只跳过代码签名，仍由 electron-builder 内置 resedit 写入图标、产品名与版本，不需要下载 winCodeSign。
- 未做代码签名，SmartScreen 会提示未知发布者。

`build:desktop` 需要 electron-builder 下载 NSIS/winCodeSign 工具；网络受限时优先用 `package:desktop`。产物在 `release/`，图标在 `build/icon.ico`（由 `build/icon.svg` 经 `npm run icons` 生成）。

## 数据位置

桌面版把可写数据放在 Electron `userData`：

- provider 配置：`<userData>/data/provider.json`（含 API Key，权限 0600）
- OCR 运行时：`<userData>/ocr-runtime`；被 360 等安全软件拦截 DLL 写入时回退到 `%TEMP%/paper-reader-ocr/runtime-v1`。旧版本按应用版本命名的临时目录会被识别并继续复用。
- OCR 模型：`<userData>/ocr-models`
- 阅读位置、对话、高亮、OCR 文本：Chromium IndexedDB（按 `http://127.0.0.1:8787` 原点）

不要把这些目录提交到仓库。

## 外部工具（MCP / Skills）

设置 → 模型服务 → **外部工具（MCP / Skills）**：

- **总开关**关闭时，聊天行为与未接入工具时完全一致。
- **Sciverse** 是内置 skill：填 `sv-` token 后可直接调用语义检索、全文读取与引用关系 3 个只读工具；本地代理直接访问 `api.sciverse.space`，打包版不需要 Node。
- **通用 MCP** 目前支持 Streamable HTTP：填写名称、URL 与可选请求头，保存后可测试连接并发现工具。工具名统一加 `mcp_<server>_` 前缀。
- 工具调用最多 3 轮；连接超时 8 秒，单次调用 20 秒，结果截断到 120k 字符；失败的服务器缓存 30 秒，避免每个聊天请求都等待。
- 工具结果按不可信外部数据注入上下文；当前 PDF 的引用仍使用 `[[p.n|原文片段]]`，外部文献要保留标题、年份、venue 与 `doc_id`。
- token 与请求头只写入本机 `mcp.json`（桌面版在 `userData/data`），接口只返回 `hasToken`、尾号与请求头名称。
- stdio 本地命令与“每次调用前确认”尚未实现。

## 端口与单实例

- 默认端口 `8787`；如果被占用，桌面版会提示错误，而不是静默连到别的服务。
- 单实例锁避免两个窗口同时启动代理。
- 外部链接交给系统浏览器打开；应用内导航限制在本地 origin。
- 启动时读取 Windows 系统代理并传给本地代理；OCR 组件/模型下载走该代理，`127.0.0.1` 与 `localhost` 始终直连。

## PDF 默认打开方式

设置 → 关于 → **默认 PDF 应用**：

- `Capabilities` 下的 `ApplicationName`、`ApplicationDescription`、`ApplicationIcon`
  必须是**命名值**；`.pdf` 必须是 `FileAssociations` 下的命名值。写成同名子键时，
  Windows 仍会接受 ProgID，但默认应用列表会直接忽略整个应用（0.8.0 的问题）。
- “注册到系统（需要管理员）”会弹出一次 UAC，把 ProgID、OpenWithProgids、
  `RegisteredApplications` 与 `Capabilities` 写入 `HKLM`，并创建开始菜单快捷方式；
  之后即可在默认应用列表中找到“纸间”。提权脚本写入带 BOM 的临时 `.ps1` 后执行，
  避免中文被按 ANSI 读取或长命令在 UAC 链路上被截断。
- “仅当前用户”不弹 UAC，只写 `HKCU`；Windows 11 同样会列出用户级注册。
  系统级注册仍更适合多用户和便携版以外的安装场景。
- 系统级注册成功后会自动删除当前用户的 `RegisteredApplications` 与 `Capabilities`
  副本，避免设置页同时出现两个“纸间”；应用启动时也会修复旧版本留下的重复项。
- 每次注册会先清理由旧版本写出的错误子键，并通知 Shell 刷新关联。
- 注册本身**不会**改变默认应用；仍需在 Windows 设置中选择“纸间”并确认。
- 移动可移植目录后，原注册路径会失效；状态会显示“路径已变化”，重新注册即可。
- “移除关联”只删除纸间的注册项，不修改 `.pdf` 当前默认应用；系统级注册的移除同样需要 UAC。
  如果纸间当前是默认应用，需要先在 Windows 设置中改为其他应用。

## 检查更新

- 关于页的“检查更新”通过 preload bridge 调用主进程，主进程用 `net.fetch` 请求 GitHub Releases API。
- 只在点击时请求；不后台轮询、不自动下载或安装，也不会打开自定义更新源。
- 发现新版本只提供“打开发布页”；网络/限流错误会显示可读提示。
- 发布 rc 时必须在 GitHub 标记 pre-release，否则 `latest` 会把 rc 当正式版。

## 已知限制

- 未做自动更新安装与代码签名；公开分发前需要配置证书。
- 基础包约 146.5MB；OCR 是独立的 26MB 组件包，不下载也能正常阅读 PDF，只是没有扫描件文字层。
- OCR 组件与模型都需要联网下载；模型也可以手动放到 `<userData>/ocr-models`。
- 应用升级不会让已安装的 OCR 运行时失效：运行时由独立的格式版本标识；只有格式不兼容或组件文件缺失时才需要重新下载。
- 安全软件可能拦截未签名进程向用户目录写 DLL；应用会回退到临时目录，再次启动时若临时目录被清理，需要重新下载组件。
