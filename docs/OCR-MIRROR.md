# 自定义 OCR 下载源

设置 → 扫描件 OCR → 下载源 支持填写一个**镜像根地址**。文疏只使用固定的官方目录结构，
不允许自定义文件路径，避免目录穿越与不可控下载。

此镜像只覆盖模型文件；OCR 运行时组件（ONNX Runtime/OpenCV/canvas）从本仓库 Release
下载并校验 SHA-256。离线或内网环境可用 `OCR_PACK_URL` 与 `OCR_PACK_SHA_URL` 指向自建镜像。

## 目录结构

tiny（文件直接在根目录）：

```text
<镜像根>/
  pp-ocrv6_tiny_det.onnx
  pp-ocrv6_tiny_rec.onnx
  ppocrv6_tiny_dict.txt
```

small / medium：

```text
<镜像根>/
  detection/ort/PP-OCRv6_small_det.ort
  recognition/ort/PP-OCRv6_small_rec.ort
  recognition/ppocrv6_dict.txt

  detection/ort/PP-OCRv6_medium_det.ort
  recognition/ort/PP-OCRv6_medium_rec.ort
  recognition/ppocrv6_dict.txt
```

下载时会将镜像根地址与上表相对路径拼接；镜像只需完整复制官方目录。

## 最小示例

### nginx

```nginx
server {
  listen 8080;
  root /srv/ppocrv6-mirror;
  autoindex off;
  types {
    application/octet-stream onnx ort;
    text/plain txt;
  }
}
```

### 本地静态目录

```bash
npx serve /srv/ppocrv6-mirror -l 8080
```

### 对象存储

把上表文件上传到 bucket 的同一前缀，根地址填 `https://bucket.example.com/ppocrv6`。
确保对象 `Content-Type` 不是 `text/html`。

## 校验规则

- 只接受 `http:` / `https:`，拒绝 `file:`、`data:`、`javascript:` 与带账号密码的 URL。
- 测试连接对三个文件发 `HEAD`（必要时回退 `Range: bytes=0-0`），最多 3 次重定向。
- 单文件上限 64MB；返回 `text/html` 视为错误页。
- 保存前必须测试通过；恢复默认不需要联网。
- 下载仍会校验文件非空与大小范围；SHA-256 清单校验留作后续增强。

## 排错

| 现象                     | 处理                                                 |
| ------------------------ | ---------------------------------------------------- |
| `HTTP 404`               | 检查根地址是否包含版本前缀、相对路径是否与上表一致。 |
| `返回网页而不是模型文件` | 去掉静态站点的 SPA 回退或登录页，直接暴露文件。      |
| `无法连接下载源`         | 检查协议、端口、DNS、防火墙与代理。                  |
| `模型文件不完整`         | 重新上传文件；确认没有压缩或截断。                   |
