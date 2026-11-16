# 第三方声明

纸间使用以下开源软件。完整许可证文本以各项目仓库与 `node_modules` 中的 LICENSE 为准。

## 运行时

| 项目                             | 许可证       | 用途                   |
| -------------------------------- | ------------ | ---------------------- |
| Electron                         | MIT          | 桌面壳                 |
| Chromium                         | BSD-3-Clause | 渲染引擎               |
| Node.js                          | MIT          | 本地代理与构建         |
| pdf.js (`pdfjs-dist`)            | Apache-2.0   | PDF 解析、渲染与文字层 |
| React / React DOM                | MIT          | 界面                   |
| Hono                             | MIT          | 本地 API               |
| Zustand                          | MIT          | 状态管理               |
| idb-keyval                       | Apache-2.0   | IndexedDB              |
| KaTeX                            | MIT          | 数学公式               |
| react-markdown / remark / rehype | MIT          | Markdown 渲染          |
| dotenv                           | BSD-2-Clause | 环境变量               |
| semver                           | ISC          | 版本比较               |
| adm-zip                          | MIT          | 解压 OCR 组件包        |

## 图标与品牌

| 项目                                     | 许可证 | 用途               |
| ---------------------------------------- | ------ | ------------------ |
| Lucide                                   | ISC    | 界面图标           |
| lobe-icons (`@lobehub/icons-static-svg`) | MIT    | 模型厂商标识       |
| 纸间 BrandMark                           | 自制   | 应用图标与品牌标记 |

## OCR

OCR 运行时与模型是可选组件，首次在设置中开启时下载。

| 项目                              | 许可证     | 用途           |
| --------------------------------- | ---------- | -------------- |
| PP-OCRv6 模型                     | Apache-2.0 | 文字检测与识别 |
| oar-ocr ONNX 转换                 | Apache-2.0 | tiny 模型发布  |
| ppu-paddle-ocr                    | MIT        | OCR 运行时     |
| ONNX Runtime (`onnxruntime-node`) | MIT        | 本机推理       |

## 开发工具

Vite、TypeScript、Vitest、Playwright、ESLint、Prettier、esbuild、electron-builder
等开发依赖的许可证见 `package-lock.json` 与各包内的 LICENSE。
