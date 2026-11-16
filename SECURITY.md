# 安全策略

## 报告漏洞

请不要在公开 issue 中披露安全漏洞、真实 API Key、真实 PDF 或用户对话。

请通过仓库维护者的私密联系方式报告，并包含：

- 影响版本 / 提交
- 复现步骤
- 影响范围（本地、局域网、云端 provider）
- 可能的修复建议

## 安全边界

纸间默认按**单用户、本机使用**设计：

- 本地代理默认只监听 `127.0.0.1:8787`，并校验 Origin；密钥与隐私边界见 [docs/PRIVACY.md](docs/PRIVACY.md)。
- 主 PDF 在浏览器本地解析，不上传。
- 只有用户明确选择的页码、文字、截图、附件与问题会发给模型。
- API Key 只保存在本机代理的 `server/.env` 或 `server/data/provider.json`，不会返回给浏览器。
- 桌面版把 provider 配置与 OCR 模型放在 Electron `userData` 目录。
- 自定义 OCR 镜像只允许 http(s)，目录结构与限制见 [docs/OCR-MIRROR.md](docs/OCR-MIRROR.md)。

## 部署提醒

如果把 `HOST` 改为 `0.0.0.0` 或部署到公网，请自行增加：

- 身份认证与访问控制
- 请求限流与配额
- TLS 终止
- 日志脱敏与审计

当前版本**不包含**多用户认证、配额、审计或团队权限。

## 依赖与模型

- OCR 模型从 oar-ocr 的 GitHub Release 下载，当前只校验文件大小；生产环境建议再加 SHA-256 校验与镜像白名单。
- 第三方模型服务（DeepSeek、OpenAI 兼容端点、Ollama 等）的隐私与合规由其各自条款约束。
- 发现依赖漏洞时，请附上 `npm audit` 输出与影响路径。
