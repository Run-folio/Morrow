from math import sin
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    Flowable,
    Frame,
    FrameBreak,
    HRFlowable,
    Image as RLImage,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageTemplate,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "shaun-whiting-staff-product-designer-resume.pdf"

PAGE_W, PAGE_H = A4
PINK = colors.HexColor("#ff3d8b")
NAVY = colors.HexColor("#1F1D3D")
INK = colors.HexColor("#090909")
MUTED = colors.HexColor("#686868")
LIGHT = colors.HexColor("#E7E5DF")
PAPER = colors.HexColor("#FCFCFA")
PANEL = colors.HexColor("#F4F3F0")


class BrandMark(Flowable):
    def __init__(self, width=22, height=17):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setStrokeColor(INK)
        c.setLineCap(1)
        c.setLineJoin(1)
        c.setLineWidth(3.3)
        h = self.height
        # A compact hand-drawn version of the SW mountain mark for PDF output.
        c.line(1, 1, 8, h - 1)
        c.line(8, h - 1, 13, 8)
        c.line(13, 8, 17, h - 4)
        c.line(17, h - 4, self.width - 1, 1)
        c.setLineWidth(2.7)
        c.line(7, 1, 12, 11)
        c.line(12, 11, 16, 5)
        c.line(16, 5, 20, 10)
        c.restoreState()


class DotMountain(Flowable):
    def __init__(self, width, height=42):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(colors.HexColor("#B9B9B6"))
        cols = 118
        for i in range(cols):
            x = self.width * i / (cols - 1)
            ridge = 18 + 12 * sin(i / 13) + 18 * sin((i - 24) / 29)
            density = 1 + int(max(0, ridge) / 8)
            for j in range(density):
                y = 4 + j * 7 + (sin(i * 1.7 + j) + 1) * 2
                if y < self.height - 3:
                    shade = 0.52 + (j / 12)
                    c.setFillColor(colors.Color(shade, shade, shade, alpha=0.55))
                    c.circle(x, y, 0.55, fill=1, stroke=0)
        c.setFillColor(PINK)
        c.circle(self.width * 0.74, self.height * 0.48, 2.4, fill=1, stroke=0)
        c.restoreState()


class MetricBand(Flowable):
    def __init__(self, items, width, height=33):
        super().__init__()
        self.items = items
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(INK)
        c.roundRect(0, 0, self.width, self.height, 7, fill=1, stroke=0)
        col_w = self.width / len(self.items)
        for idx, (value, label) in enumerate(self.items):
            x = idx * col_w + 13
            c.setFillColor(PINK)
            c.setFont("Helvetica-Bold", 7)
            c.drawString(x, 18, value)
            c.setFillColor(colors.white)
            c.setFont("Helvetica", 6.5)
            c.drawString(x, 8, label.upper())
        c.restoreState()


class PinkDot(Flowable):
    def __init__(self, size=5):
        super().__init__()
        self.width = size
        self.height = size

    def draw(self):
        self.canv.setFillColor(PINK)
        self.canv.circle(self.width / 2, self.height / 2, self.width / 2, fill=1, stroke=0)


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="Name",
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=20,
        textColor=INK,
        spaceAfter=2,
    )
)
styles.add(
    ParagraphStyle(
        name="Role",
        fontName="Courier",
        fontSize=7.4,
        leading=9,
        textColor=PINK,
        tracking=1.5,
    )
)
styles.add(
    ParagraphStyle(
        name="H1",
        fontName="Helvetica",
        fontSize=27,
        leading=29,
        textColor=INK,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="Section",
        fontName="Helvetica-Bold",
        fontSize=11.1,
        leading=12.5,
        textColor=INK,
        spaceBefore=7,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Label",
        fontName="Courier-Bold",
        fontSize=6.5,
        leading=8,
        textColor=PINK,
        tracking=1.2,
        spaceBefore=6,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Body",
        fontName="Helvetica",
        fontSize=7.55,
        leading=9.55,
        textColor=colors.HexColor("#202020"),
        spaceAfter=2.2,
    )
)
styles.add(
    ParagraphStyle(
        name="Small",
        fontName="Helvetica",
        fontSize=6.85,
        leading=8.5,
        textColor=MUTED,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="Job",
        fontName="Helvetica-Bold",
        fontSize=8.55,
        leading=9.8,
        textColor=NAVY,
        spaceBefore=4.2,
        spaceAfter=1,
    )
)
styles.add(
    ParagraphStyle(
        name="Meta",
        fontName="Courier",
        fontSize=6.05,
        leading=7.2,
        textColor=PINK,
        spaceAfter=2,
    )
)
styles.add(
    ParagraphStyle(
        name="Date",
        fontName="Courier",
        fontSize=6.5,
        leading=8,
        textColor=colors.HexColor("#9A9A96"),
        alignment=2,
    )
)


def p(text, style="Body"):
    return Paragraph(text, styles[style])


def bullet(items):
    return ListFlowable(
        [
            ListItem(
                Paragraph(item, styles["Body"]),
                bulletColor=INK,
                leftIndent=0,
            )
            for item in items
        ],
        bulletType="bullet",
        start="circle",
        leftIndent=8,
        bulletFontSize=4,
        bulletOffsetY=1.5,
        spaceBefore=0,
        spaceAfter=2,
    )


def rule():
    return HRFlowable(width="100%", thickness=0.45, color=LIGHT, spaceBefore=3.5, spaceAfter=4.5)


def dot_heading(text):
    return Paragraph(f"{text}<font color='#ff3d8b'>.</font>", styles["H1"])


def job(title, meta, date, bullets):
    date_text = f"<font color='#1F1D3D'><b>{title}</b></font><font color='#9A9A96'> {' ' * 4}{date}</font>"
    return KeepTogether([p(date_text, "Job"), p(meta, "Meta"), bullet(bullets)])


def build_story():
    story = []
    story.append(DotMountain(122 * mm, 22))
    story.append(Spacer(1, 2))
    story.append(dot_heading("Complexity solved"))
    story.append(
        p(
            "Staff Product Designer with 16+ years designing AI-enabled workflows, enterprise SaaS, ecommerce and operational systems used by more than 67 million people.",
            "Body",
        )
    )
    story.append(
        MetricBand(
            [
                ("16+", "years"),
                ("67M+", "users impacted"),
                ("$72M+", "measured impact"),
                ("AI / SaaS", "systems"),
            ],
            122 * mm,
        )
    )
    story.append(Spacer(1, 8))
    story.append(p("Selected Impact", "Section"))
    story.append(rule())
    story.append(
        bullet(
            [
                "Delivered measurable savings and revenue growth across reverse logistics, ecommerce and enterprise SaaS.",
                "Built 0-to-1 returns products, kiosks and operational tools that simplified high-volume workflows.",
            ]
        )
    )
    story.append(p("Experience", "Section"))
    story.append(rule())
    story.extend(
        [
            job(
                "Gifthub - Founding Product Designer",
                "AI STARTUP",
                "Oct 2025 - Feb 2026",
                [
                    "Led end-to-end 0-to-1 design for a gifting platform across consumer and admin workflows.",
                    "Used AI-assisted workflows to prototype, test and refine product direction quickly.",
                ],
            ),
            job(
                "Convergent IS - Staff UX Designer",
                "ENTERPRISE SYSTEMS",
                "Sep 2025 - Jan 2026",
                [
                    "Designed AI-powered field-ticketing workflows that reduced manual touch-points by 87%.",
                ],
            ),
            job(
                "Blue Yonder - Senior Staff Product Designer",
                "ENTERPRISE SAAS",
                "Nov 2023 - Jun 2025",
                [
                    "Researched, designed and tested self-service kiosk concepts and returns-processing products.",
                    "Contributed to $15M in revenue and $60M in cost savings through product and logistics improvements.",
                ],
            ),
            job(
                "Doddle - Lead / Founding Product Designer",
                "REVERSE LOGISTICS",
                "Sep 2018 - Nov 2023",
                [
                    "Designed self-service kiosks handling 40M+ parcels and contributing to a $7.5M unit order.",
                    "Created a Returns SaaS platform from scratch, saving $12M in operational costs.",
                    "Improved abandonment by 69%, completion time by 28% and CSAT from 80.2 to 85.1.",
                ],
            ),
            job(
                "Farfetch - Senior Product Designer",
                "LUXURY ECOMMERCE",
                "Aug 2015 - Jan 2018",
                [
                    "Designed native iOS and Android ecommerce apps and connected retail concepts.",
                    "Supported Store of the Future work exhibited at the London Design Museum ahead of IPO.",
                    "Increased checkout conversion by 11.3% through a streamlined purchase flow.",
                ],
            ),
        ]
    )
    return story


def build_sidebar():
    side = []
    side.append(Spacer(1, 2))
    side.append(p("About", "Section"))
    side.append(rule())
    side.append(
        p(
            "I work best where the challenge is not just designing the interface, but understanding the system behind it: workflows, rules, edge cases and constraints.",
            "Body",
        )
    )
    side.append(
        p(
            "My role is to make that complexity feel obvious to the people using the product.",
            "Body",
        )
    )
    side.append(p("Core Strengths", "Section"))
    side.append(rule())
    side.append(
        bullet(
            [
                "Complex systems",
                "AI product workflows",
                "Enterprise SaaS",
                "Product strategy",
                "Design systems",
                "UX research and testing",
                "Engineering collaboration",
            ]
        )
    )
    side.append(p("Tools", "Section"))
    side.append(rule())
    side.append(
        bullet(
            [
                "Figma",
                "Codex",
                "Claude",
                "Cursor",
                "Miro",
                "Dovetail",
                "Userlytics",
                "Amplitude",
                "Webflow",
                "HTML / CSS",
            ]
        )
    )
    side.append(p("Details", "Section"))
    side.append(rule())
    for label, value in [
        ("Location", "Remote"),
        ("Nationality", "GBR"),
        ("Visa status", "UK citizen"),
        ("Availability", "Now 2026"),
        ("Earlier roles", "Product / UX / interaction design, 2009-2015"),
        ("Education", "BA (Hons), Interactive Media Production"),
    ]:
        side.append(p(f"<font color='#ff3d8b'>{label}</font><br/>{value}", "Small"))
    side.append(p("Contact", "Section"))
    side.append(rule())
    side.append(p("sw@shaunwhiting.com", "Body"))
    side.append(p("www.shaunwhiting.com", "Body"))
    side.append(p("linkedin.com/in/shaunwhiting", "Small"))
    return side


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=13 * mm,
    )

    header_h = 22 * mm
    gutter = 9 * mm
    left_w = 122 * mm
    right_w = PAGE_W - doc.leftMargin - doc.rightMargin - left_w - gutter
    content_top = PAGE_H - doc.topMargin - header_h - 4 * mm
    content_h = content_top - doc.bottomMargin

    frames = [
        Frame(doc.leftMargin, PAGE_H - doc.topMargin - header_h, 19 * mm, header_h, showBoundary=0, id="logo"),
        Frame(doc.leftMargin + 23 * mm, PAGE_H - doc.topMargin - header_h + 2, 75 * mm, header_h, showBoundary=0, id="name"),
        Frame(doc.leftMargin, doc.bottomMargin, left_w, content_h, showBoundary=0, id="main"),
        Frame(doc.leftMargin + left_w + gutter, doc.bottomMargin, right_w, content_h, showBoundary=0, id="side"),
    ]
    doc.addPageTemplates([PageTemplate(id="resume", frames=frames, onPage=on_page)])

    story = [
        RLImage(str(ROOT / "tmp" / "assets" / "sw-mark.png"), width=19 * mm, height=15 * mm),
        FrameBreak(),
        p("SHAUN WHITING", "Name"),
        p("STAFF PRODUCT DESIGNER", "Role"),
        p("Complex systems / AI products / 0-to-1 and scale", "Small"),
        FrameBreak(),
        *build_story(),
        FrameBreak(),
        *build_sidebar(),
    ]
    doc.build(story)


if __name__ == "__main__":
    build()
    print(OUT)
