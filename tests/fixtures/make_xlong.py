from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

OUT = Path(__file__).parent / "sample-xlong.pdf"
FONT = "STSong-Light"
pdfmetrics.registerFont(UnicodeCIDFont(FONT))
W, H = A4
MARGIN = 64
TEXT = (
    "第 {page} 页：光合作用是绿色植物把光能转化为化学能的过程，分为光反应与暗反应。"
    "光反应在类囊体膜上进行，水分解并释放氧气，同时生成 ATP 与 NADPH。"
    "暗反应在叶绿体基质中进行，利用 ATP 与 NADPH 固定二氧化碳并合成糖类。"
    "光照强度、二氧化碳浓度和温度都会影响光合作用的速率。"
    "在长文档总结测试中，这一页用于提供稳定、可检索的中文正文，并验证分段摘要、"
    "页码引用与最终合并逻辑。"
)

c = canvas.Canvas(str(OUT), pagesize=A4)
for page in range(1, 101):
    c.setFont(FONT, 15)
    c.drawString(MARGIN, H - 72, f"长文档总结测试 · 第 {page} 页")
    c.setFont(FONT, 11)
    y = H - 112
    for _ in range(7):
        line = TEXT.format(page=page)
        # simple wrap for CJK
        for start in range(0, len(line), 38):
            c.drawString(MARGIN, y, line[start : start + 38])
            y -= 20
    c.showPage()
c.save()
print(OUT, OUT.stat().st_size)
