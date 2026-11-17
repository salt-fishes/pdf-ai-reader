# 品牌与图标

## 标记

BrandMark 是文疏的唯一品牌几何：珊瑚书脊 + 米白纸页 + 星芒。源文件：

- `build/icon.svg`：完整标记，用于 48px 以上的应用图标。
- `build/icon-small.svg`：去掉文字线的小尺寸变体，用于 16/24/32px；16px 下星芒近似一个光点。
- `build/favicon.svg`：浏览器标签页，使用同一书脊几何。
- `public/favicon.svg`：由 `build/favicon.svg` 复制，不要手改生成物。
- `build/icon.png`：512×512。
- `public/icon.png`：由 `build/icon.png` 复制，供关于页与开发窗口图标使用。
- `build/icon.ico`：16/24/32/48/64/128/256。
- `build/pdf-file.svg` / `build/pdf-file-small.svg`：白底 PDF 文件图标；生成 `build/pdf-file.ico` 与 `build/pdf-file.png`，随安装包放在 exe 同目录，供 `.pdf` 的 `DefaultIcon` 使用。

运行 `npm run icons` 可重复生成 PNG、ICO、PDF 文件图标与 favicon；`prebuild` 会自动执行。不要手改生成物。

呼吸灯不使用实心按钮：`AssistantFab` 只渲染 54px 命中区里的透明星芒，暖光由 `.glow` 承担。星芒使用 `--accent`（浅色为深珊瑚、夜间为浅珊瑚），生成中只加强光晕，不换图形。

## 桌面使用

- `win.icon`、NSIS 安装器/卸载器、exe 资源、快捷方式都使用 `build/icon.ico`。
- `build/pdf-file.ico` 通过 `extraFiles` 复制到 exe 同目录；`.pdf` 的 `DefaultIcon` 指向它，文件与应用图标分开。
- `signExecutable: false` 只跳过签名，electron-builder 仍会用内置 resedit 写入图标与产品名。
- 窗口图标使用 `public/icon.png`；关于页 Hero 使用 `/icon.png`。
- 标题栏是应用自绘的 52px 栏，右侧是 Windows 原生窗口按钮；品牌标记 22px，不要在这里放第二套自绘按钮。

## 色板

| Token                    | 值                    | 用途                             |
| ------------------------ | --------------------- | -------------------------------- |
| `--brand-600`            | `#c2410c`             | 主按钮、active、聚焦、AI 入口    |
| `--brand-700`            | `#9a3412`             | 按下、链接、强调文字             |
| `--brand-100`            | `#fdece5`             | 柔和背景、选中底色               |
| `--brand-a{NN}`          | `color-mix(...)`      | 透明度阶梯，组件按需引用         |
| `--brand-coral`          | `#ff7a59`             | 应用图标书脊、星芒、PDF 标签     |
| `--brand-amber`          | `#ffb35c`             | 呼吸灯生成态、暖光               |
| `--accent-solid`         | `#c2410c`             | 实心主按钮（夜间不随文字色变浅） |
| `--teal`                 | `#0ea5b7`             | 信息、搜索命中                   |
| `--amber`                | `#f59e0b`             | 高亮、OCR 提示                   |
| `--success` / `--danger` | `#10b981` / `#dc4b4b` | 成功 / 危险                      |

品牌色只用于主操作、active、焦点环和 AI 入口；不要拿它表示成功或警告。

## 对比度

浅色主题：

- `--ink` `#1b1a22` 对 surface 16.97:1、paper 15.57:1、reading 13.85:1。
- `--muted` `#66626d` 对 surface 5.85:1、paper 5.37:1、reading 4.77:1，满足 AA。
- `--brand-600` `#c2410c` 对白 5.18:1；白字在 `--accent-solid` 上同为 5.18:1。
- `--faint` `#9b96a0` 只用于图标、边框与分隔线，不用于文本。

夜间主题：正文 `--ink` `#ece8e2` 对 surface 14.39:1、paper 15.48:1；
次要文字 `--muted` `#aaa4ad` 对 surface 7.21:1；`--accent` `#ff9a78` 对 surface 8.49:1。
`--faint` 同样只用于非文本元素。

## 尺寸与网格

- 品牌标记使用 24×24 viewBox：书脊 `3.2 → 7.6`，纸页 `9.4 → 20.8`，星芒落在纸页右下。
- 图标线宽在 24 viewBox 下为 2；14px 渲染约 1.17px，16px 约 1.33px。
- 界面图标四档：14（菜单/内联）、16（工具栏/设置导航）、18（对话框关闭）、20（空状态）。
- 品牌标记：22（顶栏）、64（关于）。
- 16px 下使用简化变体：书脊 + 纸页，不放星芒；32px 以上才出现星芒。
- 呼吸灯星芒 23px，命中区 54px；没有圆底、没有边框。

## 使用禁区

- 不要拉伸、旋转、描边或改变标记比例。
- 不要在标记上叠加文字或第二个星芒。
- 不要把品牌色替换成 provider 品牌色。
- 不要把 `--faint` 用于正文或元信息文字。
