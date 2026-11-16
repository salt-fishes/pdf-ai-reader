# Desktop (Electron)

纸间可以打成 Windows 桌面应用。桌面版和浏览器版使用同一套前端与本地 Hono 代理，区别是 Electron 负责启动/停止代理并加载本地页面。

## 开发

```bash
npm run desktop:dev
```

脚本会启动 `npm run dev:all`，等 Vite 就绪后打开 Electron，加载 <http://127.0.0.1:5173>。关闭 Electron 会尝试结束 Vite/API 子进程。

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
npm run build:desktop       # NSIS 安装包 + portable exe
```

`package:desktop` 直接复制 Electron 运行时、前端 `dist`、`server/dist` 与 OCR 运行时依赖，生成可直接双击的 `PaperReader.exe`。打包时会移除其它平台的 ONNX Runtime、DirectML/dxcompiler、`@napi-rs/canvas` 的 ICU 表、OpenCV 的 TypeScript 源码/声明与 Electron 默认应用；本地 zip 约 **177.8MB**（原 183MB）。如果 `release/` 所在目录被 Windows 受控文件夹/杀毒软件拦截，可指定输出目录：

```powershell
$env:PDF_AI_RELEASE_DIR="$env:TEMP\PaperReader"
npm run package:desktop
```

`build:desktop` 需要 electron-builder 下载 NSIS/winCodeSign 工具；网络受限时优先用 `package:desktop`。产物在 `release/`，图标在 `build/icon.ico`（由 `build/icon.svg` 经 `npm run icons` 生成）。

## 数据位置

桌面版把可写数据放在 Electron `userData`：

- provider 配置：`<userData>/data/provider.json`（含 API Key，权限 0600）
- OCR 模型：`<userData>/ocr-models`
- 阅读位置、对话、高亮、OCR 文本：Chromium IndexedDB（按 `http://127.0.0.1:8787` 原点）

不要把这些目录提交到仓库。

## 端口与单实例

- 默认端口 `8787`；如果被占用，桌面版会提示错误，而不是静默连到别的服务。
- 单实例锁避免两个窗口同时启动代理。
- 外部链接交给系统浏览器打开；应用内导航限制在本地 origin。

## 检查更新

- 关于页的“检查更新”通过 preload bridge 调用主进程，主进程用 `net.fetch` 请求 GitHub Releases API。
- 只在点击时请求；不后台轮询、不自动下载或安装，也不会打开自定义更新源。
- 发现新版本只提供“打开发布页”；网络/限流错误会显示可读提示。
- 发布 rc 时必须在 GitHub 标记 pre-release，否则 `latest` 会把 rc 当正式版。

## 已知限制

- 未做自动更新安装与代码签名；公开分发前需要配置证书。
- 安装包体积较大（Electron + Node 依赖 + ONNX Runtime）；打包脚本已保留 zh-CN/en-US、移除 DirectML/dxcompiler、跨平台 ONNX Runtime、canvas ICU 表与 OpenCV 类型文件，实测 zip 约 177.8MB。
- tiny OCR 模型存在时随包分发；small/medium 或缺少 tiny 时需要联网下载，也可以手动放到 `<userData>/ocr-models`。
