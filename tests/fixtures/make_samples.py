"""Generate local test PDFs (Chinese CID font + a scanned page)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

OUT = Path(__file__).parent
FONT = "STSong-Light"
pdfmetrics.registerFont(UnicodeCIDFont(FONT))

W, H = A4
MARGIN = 64


def wrap(text: str, size: int, width: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        if char == "\n":
            lines.append(current)
            current = ""
            continue
        candidate = current + char
        if pdfmetrics.stringWidth(candidate, FONT, size) > width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def paragraph(c: canvas.Canvas, text: str, y: float, size: int = 10.5, leading: float = 17, indent: float = 0) -> float:
    for line in wrap(text, size, W - MARGIN * 2 - indent):
        c.setFont(FONT, size)
        c.drawString(MARGIN + indent, y, line)
        y -= leading
    return y


def page_frame(c: canvas.Canvas, page: int, total: int, title: str) -> float:
    c.setFillColorRGB(0.35, 0.35, 0.45)
    c.setFont(FONT, 8)
    c.drawString(MARGIN, H - 36, title)
    c.drawRightString(W - MARGIN, H - 36, f"{page} / {total}")
    c.setStrokeColorRGB(0.82, 0.82, 0.86)
    c.setLineWidth(0.5)
    c.line(MARGIN, H - 44, W - MARGIN, H - 44)
    c.setFillColorRGB(0.09, 0.12, 0.18)
    return H - 80


def cover(c: canvas.Canvas) -> None:
    c.setFillColorRGB(0.36, 0.36, 0.84)
    c.rect(0, H - 260, W, 260, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont(FONT, 30)
    c.drawString(MARGIN, H - 132, "深度学习时代的文档阅读")
    c.setFont(FONT, 16)
    c.drawString(MARGIN, H - 170, "从整本上传到按需引用的上下文设计")
    c.setFillColorRGB(0.55, 0.55, 0.65)
    c.setFont(FONT, 11)
    c.drawString(MARGIN, H - 320, "技术报告 · 2026 年 11 月")
    c.drawString(MARGIN, H - 340, "本地优先 PDF 阅读器研究组")

    c.setFillColorRGB(0.09, 0.12, 0.18)
    c.setFont(FONT, 12)
    c.drawString(MARGIN, H - 440, "摘要")
    c.setFont(FONT, 10.5)
    text = (
        "把整本 PDF 塞进模型既不经济，也不安全。本文提出一种“阅读现场”的上下文模型："
        "默认只携带当前页，用户通过选中文字、页码范围和整页截图逐步扩大范围；"
        "每一份进入上下文的内容都可见、可移除、可回跳。"
    )
    paragraph(c, text, H - 464, size=10.5, leading=18)

    c.setFont(FONT, 12)
    c.drawString(MARGIN, H - 540, "关键词")
    c.setFont(FONT, 10.5)
    c.drawString(MARGIN, H - 562, "PDF · 检索增强 · 上下文工程 · 本地优先 · 引用回跳")
    c.showPage()


def body_pages(c: canvas.Canvas, total: int) -> None:
    y = page_frame(c, 2, total, "深度学习时代的文档阅读")
    c.setFont(FONT, 18)
    c.drawString(MARGIN, y, "1  引言")
    y -= 34
    y = paragraph(
        c,
        "阅读一份长文档时，真正需要模型回答的问题往往只和眼前两三段有关。传统做法是把整份文档"
        "转成向量库，或者干脆把全文放进上下文窗口。前者需要额外的索引与清洗流程，后者则把成本、"
        "延迟和隐私风险一起放大。",
        y,
    )
    y -= 14
    y = paragraph(
        c,
        "我们更关心另一个问题：用户能否用最低的操作成本，把“眼前这一段”变成可发送的上下文，"
        "并且在发送之前清楚知道到底发了哪些页、哪些字、几张图。这个看似简单的目标，决定了阅读器"
        "的滚动、选择、截图、页码输入和对话面板必须共享同一套上下文状态。",
        y,
    )
    y -= 14
    y = paragraph(
        c,
        "本文的贡献有三点。第一，给出一种以当前页为默认、按需扩展的上下文胶囊模型；第二，用"
        "provider usage 作为锚点，只估算锚点之后的新增部分，并按缓存命中、未命中、输出分桶；"
        "第三，把回答中的页码引用限制在真实上下文之内，点击即可回到原页。",
        y,
    )
    c.showPage()

    y = page_frame(c, 3, total, "深度学习时代的文档阅读")
    c.setFont(FONT, 18)
    c.drawString(MARGIN, y, "2  上下文构建")
    y -= 34
    c.setFont(FONT, 12)
    c.drawString(MARGIN, y, "2.1  默认范围")
    y -= 24
    y = paragraph(
        c,
        "阅读器启动后只自动携带当前页。页码输入支持“3”“3-7”“2,5,9-12”三种写法，解析后展示"
        "页数、字数与 token 估算。选中文字与整页截图都是独立胶囊，可以单独移除。页码范围与"
        "当前页重叠时，提示“第 2 页已包含在页码范围内”，发送前自动去重。",
        y,
    )
    y -= 12
    c.setFont(FONT, 12)
    c.drawString(MARGIN, y, "2.2  预算与压力")
    y -= 24
    y = paragraph(
        c,
        "默认每次请求的输入预算为 32k token，输出预算为 4k。占用超过 80% 时变琥珀色并提示"
        "缩小页码；超过 100% 时阻止发送。预算不是模型的硬上限，而是产品为了避免成本和延迟"
        "失控设置的软约束。",
        y,
    )
    y -= 12
    c.setFont(FONT, 12)
    c.drawString(MARGIN, y, "2.3  估算公式")
    y -= 24
    c.setFont("Courier", 10)
    c.drawString(MARGIN + 18, y, "tokens = cjkChars * 0.6 + asciiChars * 0.3 + 4")
    y -= 24
    y = paragraph(
        c,
        "中文按 0.6 token/字、英文按 0.3 token/字符估算，每块再加 4 个 token 的角色与分隔开销。"
        "估算只用于发送前提示，provider 返回 usage 后以实际值为准，并保留 15% 安全余量。",
        y,
    )
    c.showPage()

    y = page_frame(c, 4, total, "深度学习时代的文档阅读")
    c.setFont(FONT, 18)
    c.drawString(MARGIN, y, "3  实验结果")
    y -= 32
    y = paragraph(
        c,
        "我们在 12 份中文 PDF 上比较了三种策略：整本上传、按页上传、以及本文的按需上下文。"
        "评价指标包括首次响应时间、单次费用与引用正确率。",
        y,
    )
    y -= 18

    c.setFont(FONT, 10)
    c.setFillColorRGB(0.93, 0.93, 0.96)
    c.rect(MARGIN, y - 6, W - MARGIN * 2, 22, fill=1, stroke=0)
    c.setFillColorRGB(0.09, 0.12, 0.18)
    headers = ["策略", "平均输入", "首 token", "单次费用", "引用正确率"]
    widths = [110, 90, 90, 90, 100]
    x = MARGIN + 8
    for header, width in zip(headers, widths):
        c.drawString(x, y, header)
        x += width
    y -= 26
    rows = [
        ["整本上传", "182k", "4.8s", "¥0.42", "71%"],
        ["按页上传", "9.4k", "1.6s", "¥0.03", "89%"],
        ["按需上下文", "3.1k", "1.3s", "¥0.012", "96%"],
    ]
    for index, row in enumerate(rows):
        if index % 2 == 0:
            c.setFillColorRGB(0.975, 0.975, 0.985)
            c.rect(MARGIN, y - 6, W - MARGIN * 2, 24, fill=1, stroke=0)
        c.setFillColorRGB(0.09, 0.12, 0.18)
        x = MARGIN + 8
        for value, width in zip(row, widths):
            c.drawString(x, y, value)
            x += width
        y -= 26

    y -= 18
    y = paragraph(
        c,
        "按需上下文把平均输入从 182k 降到 3.1k，首 token 时间从 4.8 秒降到 1.3 秒。更重要的是，"
        "因为只允许引用真实出现在上下文中的页码，引用正确率从 71% 提升到 96%。",
        y,
    )
    c.showPage()

    y = page_frame(c, 5, total, "深度学习时代的文档阅读")
    c.setFont(FONT, 18)
    c.drawString(MARGIN, y, "4  讨论")
    y -= 34
    y = paragraph(
        c,
        "“少即是多”在上下文工程里同样成立。用户不需要理解 token，也不需要知道模型窗口有多大；"
        "他只需要看到一行“4 个来源 · 2.5k · 8%”，点开之后能确认每一页、每一张图。信息的折叠"
        "不是隐藏，而是按需展开。",
        y,
    )
    y -= 12
    y = paragraph(
        c,
        "另一个容易被忽略的点是缓存。如果每一轮都把“当前页”插到历史最前面，前缀缓存会立刻失效。"
        "正确做法是在发送时快照当前页，把它作为新消息追加，不回头改写历史；这样稳定前缀可以持续"
        "命中缓存，成本按输入价的约 2% 计算。",
        y,
    )
    y -= 12
    y = paragraph(
        c,
        "最后是可信度。模型可能编造页码，也可能把上下文之外的段落说成原文。前端只对白名单内的"
        "页码生成可点击引用，其余按普通文本显示，并在底部提示“有 1 处引用未通过校验”。这不是"
        "完美的防护，但能让用户一眼看出回答是否越界。",
        y,
    )
    y -= 24
    c.setFont(FONT, 12)
    c.drawString(MARGIN, y, "参考文献")
    y -= 22
    c.setFont(FONT, 9.5)
    for ref in [
        "[1] Mozilla. PDF.js documentation. 2026.",
        "[2] DeepSeek. Token usage and caching. 2026.",
        "[3] 研究组. 本地优先阅读器的交互设计. 2026.",
    ]:
        c.drawString(MARGIN + 10, y, ref)
        y -= 16
    c.showPage()


def scanned_page(c: canvas.Canvas, total: int) -> None:
    image_path = OUT / "_scan_source.png"
    image = Image.new("RGB", (1240, 1754), "#fbfaf7")
    draw = ImageDraw.Draw(image)
    font_path = Path("C:/Windows/Fonts/msyh.ttc")
    title_font = ImageFont.truetype(str(font_path), 44, index=0)
    body_font = ImageFont.truetype(str(font_path), 27, index=0)
    draw.text((110, 120), "附录：扫描页示例", font=title_font, fill="#1c2536")
    lines = [
        "这一页是图片，不含文字层。阅读器会检测到字符数过少，",
        "提示“可能为扫描件，建议发送页面截图”。",
        "",
        "扫描件并不意味着无法提问：用户可以截取整页，把图片",
        "随消息发送给多模态模型；但模型无法复制原文，只能描述",
        "看到的内容。",
        "",
        "如果需要对扫描件做全文检索，P1 会接入 OCR；P0 不自动",
        "调用 OCR，避免额外的等待与隐私风险。",
    ]
    y = 260
    for line in lines:
        draw.text((110, y), line, font=body_font, fill="#2a3346")
        y += 52
    draw.line((110, 900, 1130, 900), fill="#d7d4cc", width=2)
    draw.text((110, 940), "图 A-1  扫描页只作为图片进入上下文", font=body_font, fill="#6b7280")
    image.save(image_path)

    c.drawImage(str(image_path), 0, 0, width=W, height=H)
    c.showPage()
    image_path.unlink(missing_ok=True)


def main() -> None:
    total = 6
    out = OUT / "sample-cn.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    c.setTitle("深度学习时代的文档阅读")
    c.setAuthor("PDF AI Reader")
    cover(c)
    body_pages(c, total)
    scanned_page(c, total)
    c.save()
    print(out, out.stat().st_size)

    small = OUT / "sample-small.pdf"
    c = canvas.Canvas(str(small), pagesize=A4)
    for page in range(1, 4):
        y = page_frame(c, page, 3, "三页测试文档")
        c.setFont(FONT, 20)
        c.drawString(MARGIN, y, f"第 {page} 章  测试内容")
        y -= 40
        paragraph(
            c,
            f"这是第 {page} 页的正文。页码解析、选中文字、截图与引用回跳都可以用这份短文档测试。"
            "每页包含足够的中文文字，确保文字层、复制与 token 估算都有真实内容。",
            y,
        )
        c.showPage()
    c.save()
    print(small, small.stat().st_size)


if __name__ == "__main__":
    main()
