from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

OUT = Path(__file__).parent / "pdf" / "sample-links.pdf"
FONT = "STSong-Light"
pdfmetrics.registerFont(UnicodeCIDFont(FONT))
W, H = A4
c = canvas.Canvas(str(OUT), pagesize=A4)
c.setFont(FONT, 18)
c.drawString(72, H - 100, "链接与跨页测试")
c.setFont(FONT, 12)
c.drawString(72, H - 140, "外部链接：OpenAI")
c.linkURL("https://openai.com", (70, H - 148, 220, H - 126))
c.drawString(72, H - 180, "内部链接：跳到第二页")
c.linkRect("go-page-2", "page2", (70, H - 188, 260, H - 166), relative=0)
c.showPage()
c.bookmarkPage("page2")
c.setFont(FONT, 18)
c.drawString(72, H - 100, "第二页")
c.setFont(FONT, 12)
c.drawString(72, H - 140, "你已通过正文内链跳转到这里。")
c.showPage()
c.save()
print(OUT, OUT.stat().st_size)
