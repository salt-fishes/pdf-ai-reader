"""Generate a 32-page Chinese PDF for BM25 / long-document tests."""

from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

OUT = Path(__file__).parent
FONT = "STSong-Light"
pdfmetrics.registerFont(UnicodeCIDFont(FONT))

W, H = A4
MARGIN = 64

TOPICS = [
    (
        "光合作用",
        "光合作用是绿色植物把光能转化为化学能的过程，分为光反应与暗反应两个阶段。"
        "光反应在类囊体膜上进行，水被分解并释放氧气，同时生成 ATP 与 NADPH。"
        "暗反应在叶绿体基质中进行，利用 ATP 与 NADPH 固定二氧化碳，最终合成葡萄糖。"
        "光照强度、二氧化碳浓度和温度都会限制光合作用的速率。",
    ),
    (
        "热传导",
        "稳态热传导满足 ∇·(k∇T)=0，其中 k 是材料的热导率，T 是温度场。"
        "边界条件决定温度分布：第一类边界给定温度，第二类边界给定热流，第三类边界给定对流换热。"
        "傅里叶定律指出热流密度与温度梯度成正比，方向相反。"
        "在复合壁面中，各层的热阻串联，总热流由总温差除以总热阻得到。",
    ),
    (
        "神经网络",
        "神经网络通过多层非线性变换拟合输入与输出之间的映射。"
        "训练过程使用反向传播计算梯度，再用随机梯度下降或 Adam 更新参数。"
        "学习率、批大小、权重衰减和归一化方式都会影响收敛速度与泛化能力。"
        "残差连接缓解了深层网络的梯度消失问题，使上百层的模型可以稳定训练。",
    ),
    (
        "量子纠缠",
        "量子纠缠描述两个或多个粒子共享不可分解的量子态。"
        "对其中一个粒子测量会瞬间确定另一个粒子的状态，但无法借此超光速传递信息。"
        "贝尔不等式给出了区分量子力学与局域隐变量理论的实验判据。"
        "光子偏振、超导比特和离子阱实验都验证了纠缠态的非局域关联。",
    ),
    (
        "板块构造",
        "板块构造理论认为岩石圈被划分为若干刚性板块，它们在地幔对流驱动下缓慢运动。"
        "板块边界分为离散型、汇聚型和转换型三类，分别对应洋中脊、俯冲带和走滑断层。"
        "地震与火山活动主要集中在板块边界附近。",
    ),
    (
        "货币政策",
        "货币政策通过调节利率、准备金率和公开市场操作影响总需求。"
        "当经济过热时，央行提高政策利率以抑制投资与消费；当经济衰退时，央行降息并投放流动性。"
        "传导渠道包括利率渠道、信贷渠道、资产价格渠道和汇率渠道。",
    ),
    (
        "免疫系统",
        "免疫系统分为先天免疫与适应性免疫。"
        "树突状细胞摄取抗原后迁移到淋巴结，把抗原呈递给 T 细胞，启动适应性免疫应答。"
        "B 细胞分化为浆细胞并分泌抗体，T 细胞则负责清除被感染的细胞。"
        "记忆细胞让机体在再次遇到同一病原体时产生更快更强的反应。",
    ),
    (
        "城市规划",
        "城市规划需要在密度、交通、公共空间与环境承载力之间取得平衡。"
        "公共交通导向开发把居住与商业集中在站点周边，降低对小汽车的依赖。"
        "街道网络的可步行性、绿地覆盖率与混合用地比例是常用的评价指标。",
    ),
]

FILLER = (
    "本节补充背景材料，说明该主题在教材与工程实践中的常见表述。"
    "读者可以把这些段落当作检索与引用测试的语料，它们不构成新的结论。"
    "为了验证分块与排序，页面会重复少量中性描述，但不改变主题词的位置。"
)


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


def paragraph(c: canvas.Canvas, text: str, y: float, size: float = 10.5, leading: float = 17) -> float:
    for line in wrap(text, int(size), W - MARGIN * 2):
        c.setFont(FONT, size)
        c.drawString(MARGIN, y, line)
        y -= leading
    return y


def main() -> None:
    total = 32
    path = OUT / "sample-long.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle("长文档检索测试")

    for page in range(1, total + 1):
        title, body = TOPICS[(page - 1) % len(TOPICS)]
        c.setFillColorRGB(0.35, 0.35, 0.45)
        c.setFont(FONT, 8)
        c.drawString(MARGIN, H - 36, "长文档检索测试 · " + title)
        c.drawRightString(W - MARGIN, H - 36, f"{page} / {total}")
        c.setStrokeColorRGB(0.82, 0.82, 0.86)
        c.line(MARGIN, H - 44, W - MARGIN, H - 44)

        c.setFillColorRGB(0.09, 0.12, 0.18)
        c.setFont(FONT, 19)
        c.drawString(MARGIN, H - 90, f"{page:02d}  {title}")
        c.setFont(FONT, 9)
        c.setFillColorRGB(0.45, 0.45, 0.55)
        c.drawString(MARGIN, H - 110, f"第 {page} 页 · 主题：{title}")

        c.setFillColorRGB(0.09, 0.12, 0.18)
        y = H - 145
        for _ in range(3):
            y = paragraph(c, body, y)
            y -= 12
        for _ in range(4):
            y = paragraph(c, FILLER, y)
            y -= 10

        c.setFont(FONT, 8)
        c.setFillColorRGB(0.6, 0.6, 0.68)
        c.drawString(MARGIN, 48, "本地 BM25 测试语料 · 不包含真实研究结论")
        c.showPage()

    c.save()
    print(path, path.stat().st_size)


if __name__ == "__main__":
    main()
