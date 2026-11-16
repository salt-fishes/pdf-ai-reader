# 规范化计划（下一版）

> 目标：让界面更清爽、品牌与动效更统一、隐私与发版更可信，同时把工程门禁补齐。
> 原则：先收口，再改样式；先有测试/门禁，再做结构拆分；不为“规范”而规范。
>
> **执行状态（2026-11-16）**：Phase 0–5 已完成可落地部分。Phase 5：服务端 `index.ts` 745→51 行（routes/provider/chat/ocr 拆分）、`SettingsDialog` 1154→674 行（OCR/About 章节抽出）、`src/lib` 覆盖率门禁、release 包体积预算 185MB；`useAssistantStore` 拆分与代码签名留待下一轮。CI Linux/Windows 与 release 干跑均通过，`v0.3.1` 已发布。

## 1. 现状结论

基础规范不差：`.editorconfig`、`.gitattributes`、CI/release、issue/PR 模板、`CONTRIBUTING.md`、`SECURITY.md`、`CHANGELOG.md` 都已存在。当前主要问题集中在“收口”和“门禁”。

| 项目        | 现状                                                                                                 | 影响                                  |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 未提交改动  | 43 个条目，34 个已跟踪文件 + 9 个新路径，`+2636 / -528`                                              | 没法 review、回滚和二分定位           |
| 版本        | 0.1 已发布，下一版 0.2.0；仓库仍无 tag                                                               | 需要补 0.1 的 tag 与发布记录          |
| Lint/format | 没有 ESLint/Prettier 配置和脚本                                                                      | 风格与 hooks 问题只能靠 review        |
| CI          | 只跑 typecheck/unit/build；没有 `build:server`、lint、format check                                   | server bundle、E2E 类型、格式问题会漏 |
| 小字        | 114 处 `font-size < 12px`；助手面板 61 处                                                            | 界面碎、可读性差                      |
| 对比度      | 浅色 `--faint` 2.63:1；`--muted` 4.43:1                                                              | 小字不满足 WCAG AA                    |
| 品牌色      | 71 处硬编码 `#5b5bd6` / `rgb(91 91 214 / …)`                                                         | 改色要全库搜，容易漏                  |
| 图标        | Windows 用 Segoe Fluent 字符，其他平台用 Lucide/Morphicons                                           | 同一按钮在不同平台长得不一样          |
| 文档        | `README.en.md` 有坏链；CHANGELOG 测试数过时；ROADMAP 把已完成项列为下一步                            | 对外信息不可信                        |
| 测试样本    | `public/samples` 7 个文件 319KB 会进 `dist` 和桌面包                                                 | 测试数据混进产品                      |
| E2E         | `tests/e2e/reader.spec.ts` 1314 行、33 个用例，串行执行                                              | 定位成本高，CI 时间长                 |
| 动效        | 105 行动效相关 CSS（`transition` / `animation` / `@keyframes`），约 18 种时长，很多绕过 `--motion-*` | 交互节奏不一致，难统一调整            |
| 更新检查    | 没有 updater 或检查入口，只有 `shell.openExternal`                                                   | 用户只能自己去 GitHub 找版本          |
| OCR 下载源  | `OCR_MODEL_BASE_URL` 只影响 tiny；small/medium 写死 HuggingFace；切换模型会自动下载                  | 无法换镜像，且下载前不询问            |
| 大文件      | `useAssistantStore.ts` 2214 行、`SettingsDialog.tsx` 706 行、`server/src/index.ts` 651 行            | 后续改动风险高                        |

### 已确认的 UI 证据

- 小字集中在：
  - `src/features/assistant/Assistant.module.css`（61 处）
  - `src/app/Chrome.module.css`（18 处）
  - `src/components/Modal.module.css`（18 处）
  - `src/features/assistant/OcrDialog.module.css`（6 处）
- 典型问题：`.highlightOcr` 9px、`.selectionOcr` 9px、`kbd` 9px、`.badge` 10px、`.cite` 10.5px、`.messageBody table` 11.5px。
- `MorphIcon` 共 8 处，其中 3 处是静态图标；Windows 主路径的 `WinIcon` 走 Segoe 字体、根本不经过它，所以跨平台真正可见的 morph 只有 4 个状态图标。
- 浅色主题：
  - `--muted: #717887` 对白 4.43:1，对 `--paper` 4.06:1，略低于 4.5:1。
  - `--faint: #9aa0ac` 对白 2.63:1，连大字号 3:1 都不到。
- 夜间主题：`--faint: #747c8d` 对 `--surface` 4.07:1，文本也不达标。

---

## 2. 阶段与顺序

| 阶段    | 工作流           | 产出                                                                                 | 预估         |
| ------- | ---------------- | ------------------------------------------------------------------------------------ | ------------ |
| Phase 0 | 工程基线         | 提交收口、Prettier/ESLint、CI 门禁、文档坏链修复                                     | 0.5–1 人日   |
| Phase 1 | 界面、品牌与动效 | 字号体系、小字清理、Lucide 图标（移除 MorphIcon）、全局动效、品牌色 token、App 图标  | 2.5–3.5 人日 |
| Phase 2 | 隐私、关于与更新 | 设置导航合并（6 项）、`PRIVACY.md`、构建信息注入、手动检查更新、OCR 下载源与切换确认 | 1.5–2 人日   |
| Phase 3 | README 与发版    | README 重写、截图规范、`RELEASE.md`、release workflow                                | 1.5–2 人日   |
| Phase 4 | 结构与契约       | API/config schema、IndexedDB 版本、E2E 拆分、fixtures 移出 public                    | 2–3 人日     |
| Phase 5 | 架构与预算       | 拆大文件、覆盖率、包体积预算                                                         | 后续         |

依赖关系：Phase 0 必须先做；Phase 1 的 token 是 Phase 2/3 截图和 README 的前提；Phase 4 放在门禁稳定之后。

---

## 3. Phase 0：工程基线

### 0.1 提交收口

当前改动按主题拆 4–7 个 commit，文件有交叉时用 `git add -p`：

1. `feat(viewer): virtualize pages with cached metrics`
2. `feat(ocr): local OCR worker, model selection and text layer`
3. `feat(reader): password PDFs, recent documents and citation anchors`
4. `feat(assistant): accumulate summary usage`
5. `feat(a11y): focus traps for dialogs`
6. `chore(desktop): prune runtimes and document benchmarks`
7. `docs(plan): add standardization plan`

要求：

- 每个 commit 至少 `npx tsc -b && npm test` 通过。
- 最后一个 commit 后跑完整 `npm run test:e2e`。
- 提交前确认没有 `.env`、`server/models/`、`server/data/`、`dist/`、`release/`、测试报告。
- 提交后确认 CRLF 警告消失（`.gitattributes` 已配置 `eol=lf`）。

验收：`git status` 干净；`git log --oneline` 能看出主题边界；任意 commit 可单独回滚。

### 0.2 Prettier + ESLint

新增 devDependencies：

- `prettier`
- `eslint`
- `@eslint/js`
- `typescript-eslint`
- `eslint-plugin-react-hooks`
- `eslint-plugin-jsx-a11y`
- `eslint-config-prettier`
- `globals`

配置：

- `eslint.config.js`（flat config），先只开 recommended + react-hooks + jsx-a11y；不要一上来 `strict-type-checked`。
- `prettier.config.mjs`：`printWidth: 100`、`semi: true`、`singleQuote: false`、`trailingComma: "all"`、`endOfLine: "lf"`。
- `.prettierignore`：`dist`、`release`、`server/dist`、`package-lock.json`、`public/samples`、`coverage`、`test-results`、`playwright-report`。
- scripts：`lint`、`lint:fix`、`format`、`format:check`。

落地顺序（很重要）：

1. 单独提交配置。
2. `npm run format` 单独提交，不夹任何逻辑改动；提交后把 hash 写进 `.git-blame-ignore-revs`。
3. `npm run lint` 跑基线，先修 error；warning 记录在 issue，后续逐条清零。
4. 稳定后再考虑 `lint-staged` / pre-commit；CI 才是最终门禁。

验收：`npm run format:check` 通过；`npm run lint` 无 error；格式化 commit 可被 `git blame --ignore-revs-file` 忽略。

### 0.3 CI 补门禁

当前 `.github/workflows/ci.yml` 缺少：

- `npm run lint`
- `npm run format:check`
- `npm run build:server`
- E2E 类型检查
- Windows 构建检查

新增 tsconfig：

- `tsconfig.e2e.json`：`include: ["tests/e2e", "playwright.config.ts"]`，`types: ["node", "@playwright/test"]`，`lib: ["ES2022", "DOM"]`，`strict: true`，`noEmit: true`。
- `tsconfig.node.json`：`include: ["vite.config.ts", "vitest.config.ts"]`，`types: ["node"]`。
- 根 `tsconfig.json` 增加两个 references，让 `tsc -b` 真正检查 E2E 和配置文件。

CI 步骤：

```text
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run build:server
npx playwright install --with-deps chromium
PW_CHANNEL=chromium npm run test:e2e
```

Windows job（`windows-latest`）：

```text
npm ci
npm run typecheck
npm test
npm run build
npm run build:server
```

设置：把 CI 设为 `main` 的 required check；即使单人项目也建议禁止直接 push。

验收：故意提交一个 server 打包错误 / E2E 类型错误 / 格式错误，CI 都能拦住。

### 0.4 文档坏链与漂移

- 修 `README.en.md` 指向不存在的 `docs/pdf-ai-reader-plan.md`。
- `CHANGELOG.md` 的 61 单测 / 25 E2E → 63 / 33。
- `docs/ROADMAP.md` 把“最近文档”“焦点陷阱”移到已完成；把“词级 OCR”“引用句级定位”留在下一步。
- 新增 `scripts/check-docs.mjs`：扫描 `*.md` 的相对链接（跳过 fenced code block），文件不存在则失败；接入 CI。
- `docs/OPTIMIZATION-AUDIT.md` 中标注为“历史计划”的 61/25 不要和当前数字混用。

验收：`node scripts/check-docs.mjs` 通过；README/CHANGELOG/ROADMAP 数字一致。

---

## 4. Phase 1：界面、品牌与动效

### 1.1 字号体系：最低 12px

在 `src/styles/tokens.css` 增加：

```css
--text-xs: 12px;
--text-sm: 13px;
--text-md: 14px;
--text-lg: 16px;
--text-xl: 20px;
--text-2xl: 24px;
```

规则：

- UI 正文 13px；设置、对话正文 14px；辅助信息 12px；标题 16/20/24。
- **不再出现 9/10/10.5/11/11.5px**。
- 空间不够时先删文案/缩短文案，不要缩字号。
- 元信息颜色最低用 `--muted`；`--faint` 只用于图标、边框、分隔线，不用于文本。

清理顺序：

1. `src/components/Modal.module.css`（设置、快捷键、关于）
2. `src/app/Chrome.module.css`（顶栏、侧栏、搜索）
3. `src/features/assistant/Assistant.module.css`（61 处，重点）
4. `src/features/assistant/OcrDialog.module.css`
5. `src/features/viewer/*.module.css`
6. `src/app/App.module.css`

验收：

- `grep -R "font-size: *\\(9\\|10\\|10\\.5\\|11\\|11\\.5\\)px" src` 为 0。
- 1440×900、360px 侧栏、200% 缩放下无裁切/溢出。
- 关键页面文字对比度 ≥ 4.5:1。

### 1.2 删掉不需要的小字

| 位置       | 现状                                                                   | 处理                                      |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| 顶栏       | 文件名旁 `6 页`，右侧页码又显示 `/ 6`                                  | 合并为“文件名 · 6 页”，删除重复 `docMeta` |
| 更多菜单   | `Ctrl O` 等 10.5px 快捷键提示                                          | 从菜单移除，快捷键面板已有                |
| 关于       | 图标/许可证长段 10.5px                                                 | 移到“第三方声明”，主界面只留一句          |
| 隐私       | “主 PDF 不上传”在关于和隐私重复                                        | 只保留一处                                |
| 助手       | `.tokenHint`、`.bucketNote`、`.smartNote`、`.scannedNote` 等多行微文案 | 合并为一行 12px 或 tooltip                |
| OCR        | 9px `OCR` 角标                                                         | 改成 12px chip，或图标 + tooltip          |
| 选区工具条 | 9px `OCR`                                                              | 同上                                      |
| 引用       | 10.5px `p.12`                                                          | 提到 12px；引用是重要交互，不该最小       |
| 消息表格   | 11.5px                                                                 | 提到 13px                                 |
| 空状态     | `.dropHint` + `.hint` 两句                                             | 保留一句“拖入 PDF 或 Ctrl+O”              |
| 搜索       | `.searchHint` 10.5px                                                   | 12px；只留必要操作                        |
| 侧栏       | 缩略图页码、目录页码、高亮元信息 10–11px                               | 统一 12px，能省则省                       |
| 快捷键面板 | `kbd` 9px                                                              | 12px，键帽样式保留                        |

原则：

- 一屏只保留一个主行动、一个次行动。
- 说明性长文案进 `<details>`、tooltip 或文档，不常驻。
- 同一信息只出现一次。
- 不用“更小的字”解决拥挤，用“更少的字”。

### 1.3 图标统一

现状：`WinIcon` 在 Windows 上渲染 Segoe Fluent 字符，其他平台渲染 Lucide/Morphicons；同一图标在不同平台字形、线宽、对齐都不同。

已决定：**统一 Lucide，移除 MorphIcon**，去掉 Segoe Fluent 和平台判断。

方案：

- 新增 `src/components/icons/Icon.tsx`：输入 Lucide `IconNode`，输出普通 `<svg>`；统一 `size`、`strokeWidth=2`、`currentColor`、`aria-hidden` / `label`。
- 删除 `WinIcon` 的 `GLYPHS` 字符表、`windows` 判断，以及 `src/styles/globals.css` 里的 `.win` 字体样式；`WinIcon` 迁移为 `Icon`（迁移期可保留一个名称映射给现有字符串调用，迁完删除）。
- 同步更新 README 架构段的 `components/icons/` 说明（当前写的是“Segoe Fluent、lobe-icons、手写 SVG”）。
- 删除 `morphicons` 依赖和 8 处 `<MorphIcon>`：
  - `Composer` 发送/停止、`ContextBar` 展开/收起、`MessageView` 复制/对勾：改成 CSS 状态过渡（opacity + scale，120–160ms）。
  - 新增 `StateIcon`（两个 Lucide 图标叠放，交叉淡入/缩放），避免直接替换 SVG 造成闪跳。
  - `AssistantPanel` 两个静态形态图标、`MessageView` 重试：直接用 `Icon`。
  - `WinIcon` 的 Lucide 分支：并入 `Icon`。
- 例外：
  - `BrandMark`：品牌标记，自定义 SVG。
  - `SparkleIcon`：AI 入口，自定义 SVG。
  - `ModelIcon`：模型/厂商 logo，来自 lobe-icons，属于品牌资产。
- 尺寸规范：14（菜单/内联）、16（工具栏）、18（面板标题）、20（空状态/对话框）。
- 线宽：24 viewBox 下统一 `strokeWidth=2`；16px 渲染约 1.33px，避免过细。
- 颜色一律 `currentColor`；品牌色只用于 active/primary/AI 入口。
- 所有 icon-only 按钮保留 `aria-label`，装饰图标 `aria-hidden`。
- 删除 About 中 Segoe Fluent / Morphicons 的第三方声明；文案改为“图标来自 Lucide（ISC）与 lobe-icons（MIT），品牌标记为自制”，并保留 OCR 模型等实际依赖。

验收：

- `morphicons` 从 `package.json` / `package-lock.json` / 代码 import 中完全移除。
- `WinIcon` 替换为 `Icon`，代码中不再有平台判断和字体图标分支。
- 状态图标切换走 CSS 动效 token，`prefers-reduced-motion` 下无缩放动画。
- 同一按钮在 Windows/Edge 和 Chromium 下截图一致。
- 14/16/18/20 四档在 100%/125%/150% 下不模糊、不偏位。

### 1.4 动效统一（全局覆盖）

现状：105 行动效相关 CSS（`transition` / `animation` / `@keyframes`），约 18 种时长（120/130/140/160/180/200/220/240/280/360/800/1100/1300/1400/1600/1700/3800ms），还有 `menu-in`、`popover-in`、`search-in`、`sidebar-in`、`context-in`、`toolbar-in`、`modal-in` 等多套重复 keyframes。

目标：一套时长、一套缓动、一套进出场语言；组件只引用 token，不写裸时长。

新增动效 token：

```css
--motion-instant: 80ms; /* 按下、勾选 */
--motion-fast: 120ms; /* hover、颜色、边框 */
--motion-base: 180ms; /* 菜单、弹层、对话框 */
--motion-slow: 260ms; /* 侧栏、面板 */
--motion-panel: 360ms; /* FAB / 面板 FLIP */
--motion-exit: 180ms; /* 退场，略快于入场 */
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
```

现有 `tokens.css` 已有 `--motion-fast` / `--motion-base` / `--motion-panel` / `--motion-exit` / `--ease-out`；本次复用并调整（`--motion-exit` 从 220ms 收到 180ms），不要重复定义同名 token。

场景映射：

| 场景                   | 时长 / 缓动                           | 动作                                         |
| ---------------------- | ------------------------------------- | -------------------------------------------- |
| hover、颜色、边框      | `fast` + `standard`                   | 只动 `background` / `color` / `border-color` |
| 菜单、popover、tooltip | `base` + `ease-out`                   | opacity + translateY(4px) + scale(.98)       |
| 对话框、模态           | `base` + `ease-out`                   | opacity + scale(.98)                         |
| 侧栏、面板展开         | `slow` + `ease-out`                   | transform；宽度只在拖拽调整时动              |
| FAB → 面板             | `panel` + `ease-out`                  | FLIP，保持现有 360ms                         |
| 退场                   | `exit` + `ease-in`                    | 不反弹、不延迟                               |
| 循环动效               | FAB 3.8s、skeleton 1.4s、spinner 0.8s | 只动 opacity / transform                     |

实现规则：

- 所有 `@keyframes` 集中到 `src/styles/motion.css`；删除重复的 menu/popover/search/sidebar/context/toolbar/modal keyframes，统一为 `fade-in`、`pop-in`、`slide-up`、`toast-in`、`panel-in`、`skeleton`、`spin`。
- 组件 CSS 只引用 `var(--motion-*)` / `var(--ease-*)`，不写裸 `120ms`、`0.2s`。
- 禁止 `transition: all`；禁止对 `width/height/top/left` 做常规过渡，面板拖拽和 FLIP 例外。
- 图标状态切换（发送/停止、复制/对勾、展开/收起）用 CSS `opacity` / `scale` 过渡，时长 120–160ms；不使用 JS spring，也不引入 `MorphIcon`。
- 把 105 处声明收敛到 5 种常规时长（instant/fast/base/slow/panel）+ 3 种循环时长。
- `prefers-reduced-motion: reduce` 继续全局 1ms；FAB 光晕改为静态、页面定位不做平滑滚动、page-flash 改为静态 2px 环。
- 新增 `scripts/check-motion.mjs`：组件 CSS 出现裸时长、`transition: all` 或未登记的 keyframes 时失败；接入 CI。

验收：

- `grep -R "transition:.*[0-9]ms\\|animation:.*[0-9]ms" src --include=*.css` 只命中 `tokens.css` / `motion.css`。
- 菜单、弹层、对话框、侧栏、FAB 的进出场节奏一致。
- `reducedMotion: "reduce"` 下无循环动画、无平滑滚动。
- 视觉回归截图覆盖：菜单、设置、搜索、助手面板、OCR 下载、密码框。

### 1.5 品牌色 token

新增语义 token（只允许在 `tokens.css` 出现 hex）：

```css
--brand-600: #5b5bd6;
--brand-700: #4545bd;
--brand-100: #ecebfb;
--brand-contrast: #ffffff;
--brand-a06: color-mix(in srgb, var(--brand-600) 6%, transparent);
--brand-a09: color-mix(in srgb, var(--brand-600) 9%, transparent);
--brand-a16: color-mix(in srgb, var(--brand-600) 16%, transparent);
--brand-a24: color-mix(in srgb, var(--brand-600) 24%, transparent);
--brand-a72: color-mix(in srgb, var(--brand-600) 72%, transparent);
```

现有 `--accent` / `--accent-deep` / `--accent-soft` 保留为别名，最终指向 `--brand-*`，避免两套颜色命名长期并存。

替换 71 处硬编码：

- `#5b5bd6` → `var(--brand-600)`
- `#4545bd` → `var(--brand-700)`
- `#ecebfb` → `var(--brand-100)`
- `rgb(91 91 214 / 9%)` → `var(--brand-a09)`
- 焦点环 `rgb(91 91 214 / 72%)` → `var(--brand-a72)`

对比度修正：

- 浅色 `--muted: #717887` → `#5f6675`（白 5.76、paper 5.29、reading 4.57）。
- 浅色 `--faint: #9aa0ac` 不再用于文本；只用于图标/边框。若必须用于文本，最低 `#59606e`。
- 夜间 `--faint: #747c8d`（4.07）不再用于文本；文本统一 `--muted`。
- 语义色分工：
  - 品牌 indigo：主按钮、active、焦点、AI 入口。
  - 琥珀：高亮、OCR 提示。
  - 青绿：信息/链接（先审计现有用法再定）。
  - 绿：成功；红：危险。
- 不允许把品牌色当成功/警告色使用。

验收：`grep -R "5b5bd6\\|4545bd\\|ecebfb\\|91 91 214" src --include=*.css` 只命中 `tokens.css`。

### 1.6 App 图标与品牌资产

- 以 `BrandMark` 几何为唯一源，新增 `build/icon.svg`。
- 生成：
  - `build/icon.png` 512×512
  - `build/icon.ico` 16/24/32/48/64/128/256
  - `public/favicon.svg`（与 BrandMark 同几何）
- 新增 `scripts/build-icons.mjs`（建议 `sharp` + `png-to-ico`），`npm run icons` 可重复生成。
- 在 16px 任务栏/标签页下检查：线条不糊、星芒不糊成一团。
- 新增 `docs/BRAND.md`：色板、对比度、图标网格、尺寸、使用禁区、资产路径。

验收：四个资产同源；16px 可辨认；BRAND.md 与 tokens.css 一致。

---

## 5. Phase 2：隐私、关于与更新

### 2.1 设置信息架构

当前 7 个导航项：模型服务 / 界面 / 阅读外观 / 对话 / 扫描件 OCR / 数据与隐私 / 关于。

已确认合并为 6 个：

1. 模型服务
2. 阅读（界面 + 阅读外观）
3. 对话
4. 扫描件 OCR
5. 隐私与数据
6. 关于

实现：

- `NAV` 删除“界面”“阅读外观”，新增“阅读”；`SECTION_GROUP` 把 `interface` / `appearance` 映射到 `reading`，`privacy` / `data` 映射到 `privacy`。
- 原“界面”和“阅读外观”的 section 保留 `id`，用 `data-settings-section` 区分，避免 E2E 断掉。
- 设置导航的 E2E 断言从 7 项改成 6 项。

理由：减少导航项，避免“界面/阅读外观”“隐私/数据”边界模糊。

布局规范：

- 设置卡片最大内容宽度 720px，左导航 180px。
- 每个 section 开头一句说明，不超过两行。
- 行高 44px，label 13px，value 13px；辅助说明 12px。
- 危险操作单独分组，二次确认，不和其他设置混排。
- 所有 section 有 `data-settings-section`，供 E2E/axe 定位。

### 2.2 隐私与数据

内容结构：

```text
隐私与数据
  PDF 不离开本机；只有你选中的内容会发给模型。

  本地处理
    主 PDF        浏览器本地解析，不上传
    本地记录      阅读位置、对话、高亮、OCR 文本、最近文档（单项 ≤24MB，总预算 64MB）
    密钥          只存本机代理，不进入前端 bundle

  发送给模型
    页码文本 / 选中文字 / 截图 / 附件 / 引用
    不会发送整份 PDF；云端保留策略由 provider 条款决定

  网络请求
    AI provider Base URL
    OCR 模型下载（可选，默认官方源或自定义镜像）
    手动检查更新（仅点击时请求 GitHub API）
    无遥测、无统计上报

  删除
    清空当前对话
    清空所有本地数据（二次确认）
    查看完整隐私说明 →
```

要求：

- 新增 `docs/PRIVACY.md`，覆盖：本地处理、发送内容、本地存储、网络请求（含手动检查更新与自定义 OCR 源）、保留与删除、安全边界、联系方式。
- 设置内“查看完整隐私说明”打开本地文档（可用 Vite `?raw` + 现有 Markdown 渲染），不依赖外网。
- 最近文档缓存增加**总量上限**（64MB），按最近使用淘汰；现在只限制单文件 24MB 和 8 条，最坏可占 192MB。
- 隐私文案必须和代码一致：24MB、64MB 总预算、8 条、IndexedDB 未加密、OCR 模型下载目录、代理只监听 127.0.0.1。

验收：

- 隐私 section 的每条声明都能在代码/文档中找到依据。
- 删除流程有 E2E；确认文案说明“不可撤销”。
- axe 扫描无 critical/serious 问题。

### 2.3 关于

内容结构：

```text
[BrandMark 48] 纸间
本地优先的 PDF 阅读器与 AI 阅读助手。

版本 0.2.0 · commit abc1234 · 2026-11-16
Electron 45 · Chromium 1xx · pdf.js 6.5.438

[检查更新] [复制诊断信息] [GitHub] [问题反馈] [安全策略] [许可证]

第三方声明 ▸
```

要求：

- 版本、commit、构建日期由 Vite `define` 注入，不再硬编码：
  - `__APP_VERSION__`
  - `__GIT_SHA__`
  - `__BUILD_DATE__`
- `pdf.js` 版本从 `pdfjsLib.version` 读取；Electron/Chromium 从运行环境读取。
- “复制诊断信息”包含：版本、commit、平台、Electron/Chromium、provider host（不含 key）、模型、OCR 模型、PDF.js 版本。
- 链接：GitHub 仓库、issues、`SECURITY.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`。
- 第三方声明放 `<details>` 或独立对话框，按“运行时 / 图标 / OCR 模型”分组；删除 Segoe Fluent 与 Morphicons，只保留 Lucide、lobe-icons、OCR 模型等实际依赖；不要 10px 长段落。
- 检查更新只手动触发，不在启动、定时器或后台运行；发现新版本只打开发布页，不自动下载安装。

验收：

- About 不再硬编码版本号（`0.2.0`）和 `pdf.js 6.5.438`，全部从构建信息/运行时读取。
- 版本号与 `package.json`、安装包、README 一致。
- 复制诊断信息不包含 API Key。

### 2.4 检查更新（只手动）

现状：没有 updater，也没有检查入口；用户只能自己去 GitHub Releases。

交互：

- 入口只放在“关于”，不放在启动流程、不放到顶栏。
- 状态：`检查中…` → `已是最新 0.2.0` / `发现 0.2.1` / `无法连接 GitHub，请重试`。
- 发现新版本时显示版本号、发布日期、摘要，按钮“打开发布页”；不自动下载、不自动安装、不后台轮询。
- 当前版本是预发布时，提示“你正在使用 rc 版本”，避免和正式版比较产生误解。

实现：

- Electron：新增 `electron/preload.mjs`，通过 `contextBridge` 暴露 `checkForUpdates()`；主进程 `electron/main.mjs` 用 `net.fetch` 请求 GitHub Releases API，比较 `tag_name` 与 `app.getVersion()`，返回 `{ current, latest, hasUpdate, url, notes, publishedAt }`。
- Web：如果没有桌面 IPC，回退到 renderer `fetch` GitHub API；如果走 renderer，CSP 的 `connect-src` 需要放行 `https://api.github.com`，或者继续走本地代理转发。
- 版本比较用 `semver`（或 30 行实现 + 单测）；只比较正式版，忽略 draft；rc 按 semver 规则处理。
- 请求超时 8s；GitHub API 限流/离线返回可读错误；结果只在内存缓存 5 分钟，避免连点。
- 不引入 `electron-updater`，不做差分下载/静默安装。

验收：

- 启动应用时抓包/拦截，确认没有更新请求；只有点击“检查更新”才发请求。
- 用 mock API 覆盖：已是最新、发现新版本、限流、离线、rc 版本。
- `semver` 比较有单元测试（0.2.0 vs 0.2.0-rc.1、v 前缀、非 semver tag）。
- 检查更新失败不影响阅读和设置其他功能。

### 2.5 OCR 模型下载源与切换确认

现状：

- `OCR_MODEL_BASE_URL` 只影响 tiny；small/medium 的 URL 写死在 `server/src/ocrModels.ts` 的 `HF_BASE`。
- 设置里切换模型时，`chooseOcrModel()` 会先 `setOcrModel()`，未安装就立即 `installOcr()`，没有询问。
- 下载源只能靠环境变量，普通用户无法修改。

已确认：

- OCR section 增加“下载源”：`默认` / `自定义镜像`。
- 切换未下载模型时先询问，不自动开始下载。
- 自定义源必须可测试、可恢复默认、错误可读。
- 本轮自定义源只做**镜像根地址**，保持官方目录结构；每文件单独 URL 不进本轮 UI。

UI：

```text
扫描件 OCR
  模型        [tiny] [small] [medium]
  状态        已安装 / 未下载 / 下载中 42%
  下载源      默认（官方）  [自定义镜像]
              https://mirror.example.com/ppocrv6
              [测试连接] [恢复默认]
  文本层      已开启
```

- 自定义源输入框下方显示解析后的三个文件 URL（可折叠），让用户知道实际会下载什么。
- “测试连接”对三个文件发 `HEAD` 或 `Range: bytes=0-0`，显示每个文件的状态/大小；全部通过才允许保存。
- 保存后写入服务端配置（`server/data/ocr-source.json` 或现有 provider 配置文件），不写前端 localStorage。
- 恢复默认直接清除自定义源并回到官方源，不要求先联网测试；下载时再做校验。
- `OCR_MODELS` 现在是模块加载时拼 URL；改成 `resolveModelSpec(id, source)`，保存源后下一次下载立即生效，不需要重启代理。

URL 约定：

- 自定义源是**镜像根地址**，保持官方目录结构：
  - tiny：`pp-ocrv6_tiny_det.onnx`、`pp-ocrv6_tiny_rec.onnx`、`ppocrv6_tiny_dict.txt`
  - small/medium：`detection/ort/PP-OCRv6_{small|medium}_det.ort`、`recognition/ort/PP-OCRv6_{small|medium}_rec.ort`、`recognition/ppocrv6_dict.txt`
- tiny 已随桌面版分发时不需要下载；自定义源主要作用于 small/medium，以及缺失的 tiny。
- 本轮 UI 只暴露镜像根地址一个输入框，不出现每文件 URL 编辑；后续如果有不规则镜像再加高级模式。
- `docs/OCR-MIRROR.md` 记录目录结构、文件名校验、最小示例（nginx/COS/本地静态目录）。

校验与安全：

- 只允许 `http:` / `https:`；`http:` 显示“非加密连接”警告；拒绝 `file:`、`data:`、`javascript:`。
- 请求超时 30s、最多 3 次重定向、单文件上限 64MB；拒绝 `text/html`（常见于镜像返回错误页）。
- 保留现有大小校验；如果源提供 `sha256` 清单则校验，否则至少校验非空与大小范围。
- 文件名和目录固定，不允许用户输入路径，避免目录穿越。
- 自定义源只影响模型下载，不影响 OCR 推理和 API Key。

切换流程：

1. 用户点击未安装的模型。
2. 弹出确认：“`PP-OCRv6 small` 尚未下载，约 12MB。是否现在下载并切换？”
3. `取消`：保持当前模型和当前 OCR 状态，不发下载请求。
4. `下载并切换`：显示进度；成功后切换 active model；失败则保留旧模型并显示重试。
5. 已安装模型：直接切换，不弹窗。

API：

- `GET /api/ocr/source`：返回当前源、默认源、解析后的文件 URL。
- `POST /api/ocr/source`：保存 `{ baseUrl }`；`POST /api/ocr/source/test`：测试连接；`POST /api/ocr/source/reset`：恢复默认。
- `POST /api/ocr/install` 保持异步 202；安装使用当前源。
- 所有请求走现有 JSON 校验和错误结构。

验收：

- 默认源在离线/断网时给出可读错误，不崩溃。
- 自定义镜像可用；错误 URL、404、HTML 错误页、超大文件都有明确提示。
- UI 只有一个根地址输入框；保存/测试/恢复默认都走同一套解析。
- 切换未下载模型一定先询问；取消后 active model 不变，且没有网络请求。
- 下载失败后旧模型仍可用，OCR 文本层不丢。
- 下载失败只进入 `error` 状态，不产生未处理 rejection（包括设置页“下载当前模型”按钮）。
- `docs/OCR-MIRROR.md` 的示例能让第三方镜像跑通。

### 2.6 文档

新增：

- `docs/PRIVACY.md`
- `THIRD_PARTY_NOTICES.md`
- `docs/BRAND.md`
- `docs/RELEASE.md`
- `docs/OCR-MIRROR.md`（自定义 OCR 镜像目录结构与示例）
- `docs/ARCHITECTURE.md`（从 README 抽架构细节）
- `docs/README.md`（文档索引）

更新：

- `SECURITY.md` 增加“本地代理边界/密钥处理”链接。
- `README.md` / `README.en.md` 的隐私段链接到 `docs/PRIVACY.md`。
- `CONTRIBUTING.md` 增加 lint/format/release 命令。

---

## 6. Phase 3：README 与发版

### 3.1 README 重写

目标：让新用户 **30 秒知道是什么、3 分钟跑起来、5 分钟知道隐私边界**。当前 README 约 300 行、27 张图，信息密度过高。

新结构（中文为主，英文同步摘要）：

```text
<p align="center">
  BrandMark + 纸间 + 一句话 + badges
</p>

![阅读态](docs/screenshots/reading.png)

## 为什么是纸间
- PDF 不上传
- 引用能跳回原文
- 扫描件也能选中、搜索、提问

## 一眼看懂
4 张图：阅读 / 助手 / OCR / 设置隐私

## 功能
6 组：虚拟化阅读、精确上下文、整本总结、OCR、搜索高亮、桌面版（含手动检查更新）

## 快速开始
### 浏览器
### 桌面版
### 没有 API Key
<details>高级配置</details>

## 隐私模型
表格：本地 / 发送给模型

## 架构
4 条 + 链接 docs/ARCHITECTURE.md

## 开发与测试
命令 + 当前 63 单测 / 33 E2E

## 文档
DESKTOP / PRIVACY / RELEASE / BRAND / ROADMAP / OPTIMIZATION-AUDIT

## 贡献与安全
CONTRIBUTING / SECURITY

## License
MIT
```

规范：

- 图片统一放 `docs/screenshots/`，kebab-case 命名；现有 27 张图迁移并更新链接。
- 已确认 README 只保留 6–8 张图；其余进 `docs/gallery.md` 或删除。
- 截图标准：1440×900 视口、2× DPR、浅色主题、`sample-cn.pdf`、无真实数据、无光标；输出宽 1200px、<300KB。
- 扩展 `scripts/capture.mjs`，按场景命名输出；用 ImageMagick/sharp 压缩。
- 所有图片有中文 alt；装饰性图片 alt 为空。
- 英文 README 修坏链，同步功能/隐私/命令；注明中文 README 为准。
- README 架构段和 About 第三方声明统一改为 Lucide + lobe-icons + 自制 BrandMark，不再提 Segoe/Morphicons。
- 增加 `docs/README.md` 索引，避免文档散落。

验收：

- `node scripts/check-docs.mjs` 通过。
- 从干净 clone 按 README 三条命令能启动。
- README 图片单张 <300KB，总量 <2.4MB。
- 中文/英文 README 的功能列表不矛盾。

### 3.2 发版规范

新增 `docs/RELEASE.md`：

**版本策略**

- 本次目标版本：`v0.2.0`（0.1 已发布）。
- SemVer：`MAJOR.MINOR.PATCH`；0.x 阶段 minor 加功能、patch 修问题。
- `package.json` 是唯一版本源；`npm version` 同步 lockfile。
- tag 格式 `vX.Y.Z`， annotated tag；预发布 `vX.Y.Z-rc.1`。
- CHANGELOG 用 Keep a Changelog 结构：`Unreleased / 新增 / 变更 / 修复 / 移除 / 安全`。

**发布前检查**

- `git status` 干净，main 最新，CI 全绿。
- `npm ci && npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:e2e && npm run build && npm run build:server`。
- 更新 CHANGELOG、版本号、README 截图（UI 有变时）。
- `package.json` 升到 `0.2.0`（`npm version 0.2.0 --no-git-tag-version`），CHANGELOG 新建 `[0.2.0]` 段。
- `npm run package:desktop`，手测 portable：
  - 打开 `sample-cn.pdf`，文字层/搜索/高亮/引用回跳。
  - 密码 PDF、最近文档、OCR tiny/small、隐私/关于、焦点陷阱。
  - 切换未下载 OCR 模型时先询问；取消不改变当前模型；自定义镜像可测试/恢复默认。
  - 点击“检查更新”能返回最新/已是最新/离线错误；启动时没有任何更新请求。
  - 外链走系统浏览器，代理只监听 127.0.0.1。
- 检查 zip <200MB、SHA256、无 `.env`/models/测试样本。
- 确认 GitHub Release 的 `latest` 指向正式版；rc 必须标记 pre-release，否则“检查更新”会把 rc 当正式版。

**发布**

- `git tag -a vX.Y.Z -m "..."`，push tag，release workflow 自动构建。
- 校验 GitHub Release 的 zip、SHA256SUMS、release notes。
- release notes 模板：亮点 / 修复 / 破坏性变更 / 已知问题 / 校验和。
- 检查更新读取的是 GitHub Releases 的 `latest`；发布 rc 时标 pre-release，不要覆盖正式版 latest。

**回滚/热修**

- 不移动已发布 tag；发布 patch。
- 严重问题可把 release 标为 pre-release 并发布修复版。
- 热修从 release 分支 cherry-pick，保持 main 不回退。

**workflow 加固**

- tag 与 `package.json` 版本不一致时失败（`scripts/check-version.mjs`）。
- 打包前跑 typecheck/lint/unit/build/build:server。
- 从 CHANGELOG 生成 release notes（`scripts/release-notes.mjs`），`body_path` 上传。
- zip 体积 >200MB 失败。
- 增加 `workflow_dispatch` 做 rc/干跑。
- 代码签名暂不做；文档明确 SmartScreen 提示，不假装已签名。

验收：打一个 `v0.2.0-rc.1` 干跑，能产出 zip + checksum + notes；全流程无需口头补充步骤。

---

## 7. Phase 4：结构与契约

### 4.1 API / 配置 schema

- `server/src/index.ts` 现有 5 处 `as Record<string, unknown>`（301/415/442/465/531），改 zod schema；新增的 OCR source/test/reset 也走 schema。
- 新增 `server/src/config.ts`：PORT/HOST/APP_ORIGIN/MOCK_AI/AI__/OCR__ 统一校验，失败即退出；日志脱敏。
- 统一错误：`invalid_request` / `invalid_config`，可选 `details`；保持现有 `{ error: { code, message, hint } }`。
- 客户端类型从 schema 推导；先覆盖 provider、model switch、OCR install/switch、OCR source/test/reset、chat。

验收：非法 JSON/缺字段/超长字段返回 400 + 稳定 code；配置错误启动时给出可读提示。

### 4.2 IndexedDB 版本

- 增加 `meta: { version }` 和启动迁移函数。
- 现有 chat/settings legacy 读取保留，但集中到 migration。
- 最近文档加总量预算（建议 64MB），按最近使用淘汰。
- 在 `docs/ARCHITECTURE.md` 记录 key 列表、保留策略、清理入口。

验收：旧数据可读；清空所有本地数据后无残留 key；最近文档不超过预算。

### 4.3 E2E 组织

- 抽 `tests/e2e/helpers.ts`：`openSample`、`dropPdf`、`pager`、`seedProvider`、`waitForTextLayer`。
- 抽 `tests/e2e/fixtures.ts`：样本路径、期望文本、页码。
- 按域拆：
  - `viewer.spec.ts`：打开、文字层、缩放、搜索、高亮、虚拟列表、混合尺寸。
  - `assistant.spec.ts`：上下文、对话、引用、会话、总结、BM25。
  - `ocr.spec.ts`：OCR 流程、模型安装、切换确认、自定义下载源、OCR 层。
  - `app.spec.ts`：密码、最近文档、设置、快捷键、焦点陷阱、手动检查更新。
- 先保持 workers=1；拆分后测量，能稳定再开 2。
- 加 `@axe-core/playwright` 对空状态、设置、密码框做扫描，先修 critical/serious。

验收：单文件 <400 行；失败用例能一眼定位域；CI 时间不增加。

### 4.4 测试样本移出 public

- `public/samples/*.pdf` → `tests/fixtures/pdf/`。
- E2E 用 `fs.readFile` + `page.route`/DataTransfer 注入，不依赖静态目录。
- electron `files` 增加 `!dist/samples/**` 作为兜底。
- 新增 `scripts/make-samples.py`（PyMuPDF/ReportLab），固化 sample-cn/long/xlong/encrypted/mixed 的生成方式。
- README 不再引用 `public/samples`；如产品需要“示例文档”，单独保留 1 个并明确标记。

验收：`dist/` 和桌面包无测试 PDF；样本可从脚本重建；E2E 全绿。

---

## 8. Phase 5：架构与预算（后续）

- `useAssistantStore.ts` 拆 transport / summary / persistence / store；先补 characterization tests。
- `SettingsDialog.tsx` 拆 section 组件；`server/src/index.ts` 拆 routes。
- `@vitest/coverage-v8` 报告；只对 `src/lib` 设阈值，不全局卡。
- release 增加包体积预算（当前 183MB，建议 <200MB 失败）。
- OCR 模型 SHA-256 清单校验与自定义源安全规则（安全增强）。
- 代码签名与后台自动更新（独立项目，不混在本次规范化里）；本次只做手动检查更新。

---

## 9. 验收总清单

工程：

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run format:check`
- [x] `npm test`
- [x] `npm run test:e2e`
- [x] `npm run build`
- [x] `npm run build:server`
- [x] CI Linux + Windows 全绿
- [x] `main` required check 开启

界面：

- [x] 无 `<12px` 字号
- [x] 品牌色只在 `tokens.css` 出现 hex
- [x] 统一 Lucide 图标，无平台分支
- [x] `morphicons` 依赖 / import 为 0
- [x] 动效只引用 `--motion-*` / `--ease-*`，无裸时长、无 `transition: all`
- [x] `prefers-reduced-motion` 下无循环动画、无平滑滚动
- [x] 浅色/夜间文本对比度 ≥4.5:1
- [x] 1440×900 / 360px 侧栏 / 200% 缩放无裁切
- [x] 设置导航为 6 项，密码/快捷键对话框焦点陷阱正常

隐私/关于：

- [x] 版本/commit/构建日期来自构建注入
- [x] 隐私声明与代码一致
- [x] 清空数据流程有 E2E
- [x] `PRIVACY.md` / `THIRD_PARTY_NOTICES.md` 链接有效
- [x] 启动时无更新检查请求；只有点击“检查更新”才请求 GitHub
- [x] 检查更新不自动下载/安装，只打开发布页；不支持自定义更新源
- [x] 切换未下载 OCR 模型必须先询问；取消后 active model 不变
- [x] 自定义 OCR 镜像可测试、可恢复默认、错误可读；UI 只有镜像根地址

文档/发版：

- [x] README 链接全部有效
- [x] 截图 6–8 张、单张 <300KB、总量 <2.4MB
- [x] CHANGELOG/ROADMAP/README 数字一致
- [x] `v0.2.0-rc.1` 干跑产出 zip + checksum + notes（用 `workflow_dispatch` 干跑；随后发布 `v0.2.0`）
- [x] release notes 包含已知问题与校验和

结构：

- [x] 所有 JSON 端点有 schema（含 OCR source/test/reset）
- [x] IndexedDB 有版本与迁移
- [x] E2E 按域拆分，单文件 <400 行
- [x] `dist/` 无测试 PDF

---

## 10. 风险与不做

风险：

- Prettier 全库格式化 diff 很大 → 单独 commit + `.git-blame-ignore-revs`。
- 字号整体上调可能撑破面板 → 先删文案，再调字号；360px 面板和 200% 缩放必须回归。
- 图标从字体换成 SVG 会改变视觉重量 → 固定 24 viewBox / stroke 2，截图对比。
- 移除 MorphIcon 会改变发送/复制/展开的反馈 → 用 CSS opacity/scale 过渡，并做 reduced-motion 对比。
- 动效全局替换可能让面板/菜单节奏变化 → 先做 token + 对照截图，再逐组件替换。
- 品牌色 token 化可能改变 hover/active 对比 → 逐屏对比，必要时调 alpha。
- README 图片迁移会破链 → 链接检查脚本进 CI。
- release workflow 改动可能影响发版 → 先用 rc tag + `workflow_dispatch` 干跑。
- GitHub API 限流/离线导致检查更新失败 → 明确错误文案，不阻塞其他功能。
- 自定义 OCR 源可能指向错误页/超大文件/内网地址 → 限制协议、超时、大小、内容类型，只允许用户主动配置。

本次不做：

- 不引入完整 i18n 框架（项目中文优先）。
- 不开 `noUncheckedIndexedAccess`（viewer/PDF 索引改动收益低、churn 大）。
- 不在没有 characterization tests 的情况下拆 2214 行的 store。
- 不引入组件库/UI 框架，继续用 CSS Modules + tokens。
- 不保留 MorphIcon / JS spring 图标动效；状态图标统一走 CSS token。
- 不做 OCR 每文件 URL 编辑；本轮只支持镜像根地址。
- 不做后台自动检查更新、自动下载安装或 `electron-updater`；本次只做手动检查 + 打开发布页。
- 不做自定义更新检查源；只查 GitHub Releases。
- 不做代码签名（单独立项）。

---

## 11. 决策记录

已确认，无未决项：

- 0.1 已发布 → 下一版 **0.2.0**。
- 图标统一 **Lucide**，**移除 MorphIcon / `morphicons` 依赖**，去掉 Segoe Fluent 和平台分支。
- 动效统一 token，**全局覆盖**；图标状态切换用 CSS 过渡，不用 JS spring。
- README 只保留 **6–8 张图**。
- 设置导航合并为 **6 项**：“界面 + 阅读外观” → “阅读”。
- 检查更新**只手动触发**，只查 **GitHub Releases**，不后台、不自动下载/安装。
- OCR 支持**自定义下载源**，本轮只做**镜像根地址 + 官方目录结构**；切换未下载模型**先询问**。
- 本轮范围 **Phase 0–3**；Phase 4 的结构契约另开一轮。

## 12. 建议执行顺序

1. Phase 0：提交收口 → Prettier → ESLint → CI → 文档坏链。
2. Phase 1：字号 token → 删小字 → Lucide 图标 → 移除 MorphIcon → 动效 token/全局替换 → 品牌色 → App 图标。
3. Phase 2：设置导航合并为 6 项 → 隐私 → 关于 → 检查更新 → OCR 下载源/切换确认 → 文档。
4. Phase 3：截图/README → 发版规范 → release workflow。
5. Phase 4：API schema → IndexedDB → E2E 拆分 → fixtures。
6. Phase 5：拆大文件、覆盖率、包体积。

每个 Phase 结束都要求：`typecheck + lint + format:check + unit + build` 绿；涉及 UI 的 Phase 追加 E2E 和截图对比。
