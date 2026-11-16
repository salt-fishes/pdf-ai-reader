# 发版规范

## 版本策略

- 当前目标版本：`0.5.0`；`0.4.1` 已发布。
- SemVer：`MAJOR.MINOR.PATCH`。0.x 阶段 minor 加功能，patch 修问题。
- `package.json` 是唯一版本源；用 `npm version X.Y.Z --no-git-tag-version` 同步 lockfile。
- tag 格式 `vX.Y.Z`，使用 annotated tag；预发布用 `vX.Y.Z-rc.1` 并标记 pre-release。
- CHANGELOG 采用 Keep a Changelog：`新增 / 变更 / 修复 / 移除 / 安全 / 已知问题`。

## 发布前检查

```bash
git status                     # 干净，main 最新
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run check:docs
npm run check:motion
npm test
npm run test:e2e
npm run build
npm run build:server
npm run package:desktop
npm run package:ocr-pack
```

手工回归：

- 打开 `sample-cn.pdf`：文字层、搜索、高亮、引用回跳。
- 密码 PDF、最近文档、混合页面。
- OCR tiny/small：切换未下载模型先询问；取消后 active model 不变；自定义镜像可测试、保存、恢复默认。
- 隐私/关于：版本、commit、构建日期来自构建注入；复制诊断信息不含 Key。
- 检查更新：点一次才发请求；离线/限流有可读错误；不自动下载。
- 外链走系统浏览器；代理只监听 `127.0.0.1`。
- 基础 zip <160MB，OCR 组件包 <60MB，两者合计 <185MB。
- 无 `.env`、`server/models`、`server/data`、`node_modules` 与测试 PDF。

## 发布

```bash
npm version 0.4.0 --no-git-tag-version
# 更新 CHANGELOG 的 [0.4.0] 段
npm run check:version -- 0.4.0
git add -A && git commit -m "release: v0.4.0"
git tag -a v0.4.0 -m "纸间 v0.4.0"
git push origin main --tags
```

`release.yml` 会：

1. 校验 tag 与 `package.json` 版本一致。
2. 跑 typecheck / lint / 单测 / build / build:server。
3. 打包可移植目录与 OCR 组件包并分别压缩。
4. 生成包含两个 zip 的 `SHA256SUMS.txt` 与 CHANGELOG 对应的 release notes。
5. 上传基础 zip、OCR 组件 zip、checksum、notes；任一包超出预算直接失败。

## 预发布与干跑

- `workflow_dispatch` 可手动干跑，不创建 release。
- rc tag 必须标记 pre-release，避免 GitHub 的 `latest` 把 rc 当正式版。
- 发布后确认 `latest` 指向正式版，Release 页面包含 zip、校验和与已知问题。

## 回滚与热修

- 不移动已发布 tag；发布 patch 版本。
- 严重问题可把 release 标记为 pre-release，并尽快发布修复版。
- 热修从 release 分支 cherry-pick，保持 `main` 不回退。

## 代码签名

当前未做代码签名与自动更新，Windows SmartScreen 会提示未知发布者；文档中明确说明，不假装已签名。
