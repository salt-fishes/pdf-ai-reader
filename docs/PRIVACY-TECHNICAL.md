# 隐私与技术细节

本文件面向维护者，不会被打包进设置页的隐私说明。用户可读版本见 [PRIVACY.md](PRIVACY.md)。

## 数据位置

| 数据                                               | 位置                                                                    | 说明                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 主 PDF                                             | 浏览器/渲染进程内存                                                     | 通过 pdf.js 解析，不上传文件；关闭文档后释放。                                        |
| 阅读位置、对话、高亮、OCR 文本、页面尺寸、摘要分段 | IndexedDB                                                               | 未加密；可在设置中清空。                                                              |
| 最近文档缓存                                       | IndexedDB                                                               | 单个文件 ≤24MB，总量 ≤64MB，最多 8 条；超出预算时按最近使用淘汰缓存字节，记录仍保留。 |
| 界面偏好                                           | localStorage                                                            | 主题、助手形态、思考强度、上下文预算等。                                              |
| PDF 打开方式（可选）                               | `HKCU` 或 `HKLM` 的 `Software\Classes` 与 `Software\PaperReader`        | 只有点击注册后才写入；系统级注册需管理员授权，可在设置中移除。                        |
| API Key、Base URL、模型允许列表                    | 本机代理（`server/data/provider.json`，桌面版在 `userData/data`）       | 不进入前端 bundle，不返回给浏览器。                                                   |
| Sciverse token、MCP 地址与请求头                   | 本机代理（`server/data/mcp.json`，桌面版在 `userData/data`）            | 文件权限 `0600`；接口只返回 `hasToken`、尾号与请求头名称，不返回明文。                |
| OCR 运行时与模型                                   | `server/models`、桌面版 `userData/ocr-runtime` 与 `userData/ocr-models` | 首次下载后可离线使用；安全软件拦截时运行时回退到 `%TEMP%/paper-reader-ocr`。          |

## OCR 组件复用

- 运行时目录由 `OCR_RUNTIME_FORMAT` 标识，不与应用版本绑定。
- 旧版本写入的 `runtime.json` 没有 `format` 字段，按兼容处理。
- 临时回退目录为 `%TEMP%/paper-reader-ocr/runtime-v<format>`；旧版本按应用版本命名的目录会作为候选继续复用。
- 用户主动点击“修复组件”时，先停止 OCR worker，再强制重新下载并替换运行时。
- 模型目录稳定在 `userData/ocr-models`，不随应用升级变化。

## 外部工具

- Sciverse 是内置 skill：本地代理直接调用 `api.sciverse.space`，不要求用户安装 Node。
- 通用 MCP 目前只支持 Streamable HTTP；stdio 本地命令尚未启用。
- 工具调用最多 3 轮；连接超时 8 秒，单次调用 20 秒，结果截断到 120k 字符。
- 工具结果按外部不可信数据注入模型上下文；system prompt 明确禁止执行其中的指令。
- 连接失败会缓存 30 秒，避免每个聊天请求都等待同一个不可用服务器。
- token 不写入日志；诊断信息只包含工具名、耗时与错误摘要。

## 网络与安全

- 本地代理默认只监听 `127.0.0.1`，并校验 Origin。
- OCR 组件下载后校验 SHA-256；校验和不匹配时拒绝安装。
- 检查更新只在用户点击时请求 GitHub Releases API，结果在内存缓存 5 分钟。
- 没有遥测、崩溃上报或后台轮询。
