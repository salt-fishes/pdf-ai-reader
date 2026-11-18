# 品牌一致性检查（2026-11-18）

检查范围：`src/`、`server/`、`electron/`、`build/`、`scripts/`、`.github/`、文档与当前生成物。

## 结论

用户可见层已统一为「文疏 / Wenshu」。源码里剩下的 `PaperReader`、`paper-reader` 只用于两类事情：

1. 覆盖升级时清理旧注册表、旧快捷方式、旧 OCR 目录；
2. 必须保持稳定的内部标识（`appId`、npm 包名、用户数据目录、preload 桥、SSE 事件名、localStorage 键、GitHub 仓库地址）。

命名边界与原因见 [BRAND.md](BRAND.md#命名边界)。

## 已统一

| 位置                | 旧                                    | 新                                                         |
| ------------------- | ------------------------------------- | ---------------------------------------------------------- |
| Windows 可执行文件  | `PaperReader.exe`                     | `Wenshu.exe`                                               |
| 安装目录            | `%LOCALAPPDATA%\Programs\PaperReader` | `%LOCALAPPDATA%\Programs\Wenshu`                           |
| NSIS / MSI / 便携包 | `paper-reader-*`                      | `wenshu-*`                                                 |
| OCR 组件包          | `paper-reader-ocr-*`                  | `wenshu-ocr-*`                                             |
| PDF ProgID          | `PaperReader.pdf`                     | `Wenshu.pdf`                                               |
| Capabilities 根     | `Software\PaperReader`                | `Software\Wenshu`                                          |
| 更新检查 User-Agent | `paper-reader`                        | `wenshu`                                                   |
| MCP 客户端名称      | `paper-reader`                        | `wenshu`                                                   |
| OCR 临时目录        | `%TEMP%/paper-reader-ocr`             | `%TEMP%/wenshu-ocr`（旧目录继续识别）                      |
| 系统提示词          | “PDF 阅读器中的阅读助手”              | “文疏 PDF 阅读助手”（0.11 起为文档 / 通用 / 工具三层策略） |

安装器、PDF 关联与卸载都会顺带删除 `PaperReader.pdf`、`Applications\PaperReader.exe`、`Software\PaperReader`、`RegisteredApplications\PaperReader` 以及更早的「纸间」项。

## 有意保留

| 标识                  | 值                          | 原因                                               |
| --------------------- | --------------------------- | -------------------------------------------------- |
| `build.appId` / AUMID | `cn.paperreader.app`        | Windows 安装身份；改动会让覆盖安装变成另一个产品。 |
| npm 包名 / `userData` | `pdf-ai-reader`             | 配置、密钥、OCR 组件与阅读记录都在这个目录下。     |
| preload 桥            | `window.paperReader`        | 渲染进程内部协议，不显示给用户。                   |
| SSE 工具事件          | `paper_reader_tool`         | 本地代理与前端之间的稳定协议。                     |
| localStorage 键       | `pdf-ai-reader:*`           | 保留历史偏好与数据。                               |
| GitHub 仓库           | `salt-fishes/pdf-ai-reader` | 远程仓库地址；重命名仓库后再统一。                 |

## 历史材料

- `docs/pdf-ai-reader-plan.md` 里的 Papyrus 界面截图、`docs/UI-REFRESH-PLAN.md` 与 `docs/OPTIMIZATION-AUDIT.md` 里的旧产物名都是当时记录，已在文首标注为历史。
- `release/` 下已有的 `paper-reader-*` 是历史发布物；重新执行 `npm run package:desktop` / `build:installers` 会生成 `wenshu-*`。

## 验证

已通过：

```bash
npm run typecheck
npm run lint
npm run format:check
npm run check:docs
npm test          # 26 files / 146 tests
npm run build
npm run build:server
npm run package:desktop   # 生成 release/win-unpacked/Wenshu.exe
```

NSIS 安装包已验证生成 `wenshu-v0.10.1-x64.exe`，MSI 已验证生成 `wenshu-v0.10.1-x64.msi`；便携包为 `wenshu-v0.10.1-win-x64.zip`，OCR 包为 `wenshu-ocr-v0.10.1-win-x64.zip`。
