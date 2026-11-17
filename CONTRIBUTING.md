# 贡献指南

感谢你愿意改进文疏。这个项目优先保证**本地优先、内容可控、可离线阅读**，提交前请先确认没有把 PDF 正文、密钥或用户对话发送到不应去的地方。

## 开发环境

- Node.js 24+
- Windows 10/11（当前主要开发和 E2E 环境）
- 可选：Edge / Chromium、Python 3 + ReportLab（重新生成测试 PDF）

```bash
npm install
copy server\.env.example server\.env
# 编辑 server/.env，填入 AI_API_KEY；没有密钥时设置 MOCK_AI=1
npm run dev:all
```

打开 <http://127.0.0.1:5173>。

## 常用命令

```bash
npm run typecheck     # TypeScript 项目引用检查
npm run lint          # ESLint（typescript-eslint + react-hooks + jsx-a11y）
npm run format:check  # Prettier
npm test              # Vitest 单元测试
npm run test:e2e      # Playwright（需要 Edge 或 PW_CHANNEL=chromium）
npm run build         # 前端生产构建
npm run build:server  # 把本地代理打成 server/dist/index.mjs
npm run desktop:dev   # 启动 Vite/API + Electron 开发壳
npm run package:desktop # 可移植桌面目录
```

发布流程、tag 与校验和见 [`docs/RELEASE.md`](docs/RELEASE.md)。

E2E 按域拆分在 `tests/e2e/*.spec.ts`（viewer / rendering / assistant / panel / ocr / app），公共注入与 mock 守卫在 `tests/e2e/helpers.ts`。PDF 样本放在 `tests/fixtures/pdf/`，通过 `page.evaluate` + `DataTransfer` 注入，不依赖 `public/` 静态目录。默认 2 个 worker。

## 代码约定

- 前端是 React 19 + Zustand + Vite；PDF 渲染在 `src/features/viewer`，AI 状态在 `src/features/assistant/useAssistantStore.ts`，本地代理在 `server/src`。
- 纯逻辑优先放到 `src/lib`，并补单元测试；不要把所有逻辑塞进组件。
- 新增用户可见文案用简体中文；代码标识符用英文。
- 不引入会默认上传整份 PDF 的依赖；任何上下文扩展都必须先经过 store 的显式来源（页码、选区、截图、附件）。
- 颜色、圆角、动效使用 `src/styles/tokens.css` 与 `motion.css` 中已有的变量。
- 不要提交 `server/.env`、`server/data/`、`server/models/`、`dist/`、`release/` 或测试报告。

## 测试要求

- 修改纯逻辑：补或更新 Vitest。
- 修改阅读、上下文、设置、桌面相关流程：尽量补 Playwright 用例。
- 提交前至少运行：

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

如果改了 E2E 相关代码，再运行 `npm run test:e2e`。

## 提交与 PR

- 一个 PR 只解决一件事，标题写清“做了什么 + 为什么”。
- 附上复现步骤、截图/录屏（视觉改动）、测试命令。
- 不要提交真实 API Key、真实文档或个人对话截图；截图前先替换成 `sample-*.pdf`。
- 发现安全问题请走 `SECURITY.md`，不要直接开公开 issue。

## 许可证

提交即表示你同意以 MIT License 授权你的贡献。
