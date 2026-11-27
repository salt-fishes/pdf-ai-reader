# 大页面 PDF 的内存预算

## 现象

某些 PDF 的**单页内容流**异常庞大。典型例子：

- 文件：`s41467-024-46595-z.pdf`（67 MB，18 页，Springer / iText 5.3.5）
- 第 6 页内容流对象：62,183,676 字节（约 62 MB）
- pdf.js 展开后的 operator list：9,663,838 条
- PyMuPDF 统计的矢量绘图指令：1,952,512 条

用 pdf.js 单独测量：

```text
加载文档后 RSS：        94 MB
解析第 6 页 operator：  2,917 MB，耗时约 42 秒
```

也就是说，**仅解析这一页就超过 2.9 GB**，还没算 canvas、缩略图和 UI。这类页面通常是论文里被导出成上百万个细小矢量元素的热图 / 网络图。

## 为什么应用层清理不够

pdf.js 必须把整页内容流展开成 operator list 才能渲染，这个峰值发生在解析阶段。下面这些改动能降低基线内存，但**不能把 2.9 GB 峰值压到 1 GB 以内**：

- 渲染后调用 `page.cleanup()`
- 减小 `OVERSCAN`
- 限制 canvas 像素数 / 少用离屏 canvas
- 给缩略图缓存加 LRU

要把硬上限控制在 1 GB，必须在渲染前消灭病态矢量页。

## 方案：预光栅化病态页

用 PyMuPDF 把内容流超过阈值的页渲染成一张高分辨率图片，再写回 PDF。这样 pdf.js 只需解码一张图。

```bash
# 安装依赖（一次性）
pip install pymupdf

# 生成轻量版：默认 >5MB 的页会被光栅化，缩放 3x ≈ 216dpi
npm run pdf:lite -- "C:\path\to\paper.pdf"
# 或者
python scripts/optimize-heavy-pdf.py "C:\path\to\paper.pdf" "C:\path\to\paper.lite.pdf"
```

可选参数：

```bash
python scripts/optimize-heavy-pdf.py paper.pdf --threshold-mb 5 --scale 3 --quality 88
```

上述论文实测：

| 指标                       | 原文件    | 轻量版                   |
| -------------------------- | --------- | ------------------------ |
| 文件大小                   | 67.2 MB   | 5.5 MB                   |
| 第 6 页内容流              | 62.2 MB   | 图片 0.8 MB（1786×2373） |
| 第 6 页 pdf.js operator 数 | 9,663,838 | 5                        |
| 解析第 6 页后 RSS          | 2,917 MB  | 139 MB                   |
| 解析耗时                   | 41.7 s    | 0.26 s                   |

## 限制

- 被光栅化的页面**失去文字层**：无法选中文字、搜索、引用回跳或 BM25 检索。
- 缩放超过 `--scale` 指定的分辨率后会变模糊；论文正文一般 3x 足够。
- 这是一次性预处理工具，依赖 Python + PyMuPDF，不进入电子发行包。

## 阅读器端仍建议做的加固

即使对普通 PDF，也建议配合以下改动把基线压低：

1. `PageView.tsx` 渲染完成后调用 `page.cleanup()`，释放 pdf.js 缓存的 operator list。
2. `PdfViewer.tsx` 的 `OVERSCAN` 从 4800 降到 1200–2000。
3. 同一页只保留一张全尺寸 canvas；`renderRatio.ts` 的 `2^25` 可降到 `2^24`。
4. `pdf.ts` 的 `thumbCache` 改为有上限的 LRU，`closePdf()` 时清空四个 WeakMap 的内层 Map。
5. `openFile` 避免 `file.arrayBuffer()` 与 `bytes.slice(0)` 双份长期驻留。
