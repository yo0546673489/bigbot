#!/usr/bin/env python3
"""
Generate a professional Hebrew RTL PDF of all Israeli localities and neighborhoods.
"""
import json
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from bidi.algorithm import get_display

# ── Config ───────────────────────────────────────────────────────────
BASE = r"D:\שולחן עבודה\קלוד\פרויקט ביגבוט\wabot-final\server"
OUT = os.path.join(BASE, "all_israel_locations.pdf")
CITIES_FILE = os.path.join(BASE, "all_cities_israel.json")
HOODS_FILE = os.path.join(BASE, "all_neighborhoods_israel.json")

FONT_REG = "C:/Windows/Fonts/david.ttf"
FONT_BOLD = "C:/Windows/Fonts/davidbd.ttf"
GREEN = HexColor("#2E7D32")
LIGHT_GREEN = HexColor("#E8F5E9")
DARK = HexColor("#1B5E20")

PAGE_W, PAGE_H = A4
MARGIN_L = 30 * mm
MARGIN_R = 30 * mm
MARGIN_T = 25 * mm
MARGIN_B = 20 * mm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

HEB_LETTERS = list("אבגדהוזחטיכלמנסעפצקרשת")

# ── Helpers ───────────────────────────────────────────────────────────
def heb(text):
    """Reshape and reorder Hebrew text for correct RTL rendering in PDF."""
    return get_display(text)

def draw_right(c, x_right, y, text, font="David", size=12, color=black):
    """Draw right-aligned Hebrew text."""
    c.setFont(font, size)
    c.setFillColor(color)
    rendered = heb(text)
    tw = c.stringWidth(rendered, font, size)
    c.drawString(x_right - tw, y, rendered)

def draw_center(c, y, text, font="David", size=12, color=black):
    """Draw centered Hebrew text."""
    c.setFont(font, size)
    c.setFillColor(color)
    rendered = heb(text)
    tw = c.stringWidth(rendered, font, size)
    c.drawString((PAGE_W - tw) / 2, y, rendered)

# ── Main ──────────────────────────────────────────────────────────────
def main():
    # Register fonts
    pdfmetrics.registerFont(TTFont("David", FONT_REG))
    pdfmetrics.registerFont(TTFont("DavidBd", FONT_BOLD))

    # Load data
    with open(CITIES_FILE, encoding="utf-8") as f:
        cities = json.load(f)
    with open(HOODS_FILE, encoding="utf-8") as f:
        hoods = json.load(f)

    # Group cities by first Hebrew letter
    city_groups = {}
    for city in cities:
        first = city[0] if city else "?"
        # Normalize: כ/ך→כ, מ/ם→מ, נ/ן→נ, פ/ף→פ, צ/ץ→צ
        norm = {"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"}.get(first, first)
        city_groups.setdefault(norm, []).append(city)

    # Group neighborhoods by city
    hood_groups = {}
    for h in hoods:
        hood_groups.setdefault(h["city"], []).append(h["name"])

    # Create PDF
    c = canvas.Canvas(OUT, pagesize=A4)
    c.setTitle("רשימת כל היישובים והשכונות בישראל — BigBot")
    c.setAuthor("BigBot")

    page_num = [1]
    y = [PAGE_H - MARGIN_T]

    def footer():
        c.setFont("David", 8)
        c.setFillColor(HexColor("#9E9E9E"))
        c.drawCentredString(PAGE_W / 2, 12 * mm, heb(f"עמוד {page_num[0]}"))
        # Green line at bottom
        c.setStrokeColor(GREEN)
        c.setLineWidth(0.5)
        c.line(MARGIN_L, 16 * mm, PAGE_W - MARGIN_R, 16 * mm)

    def new_page():
        footer()
        c.showPage()
        page_num[0] += 1
        y[0] = PAGE_H - MARGIN_T

    def ensure_space(needed):
        if y[0] - needed < MARGIN_B:
            new_page()

    # ═══════════════════════════════════════════════════════════════════
    # TITLE PAGE
    # ═══════════════════════════════════════════════════════════════════

    # Green header bar
    c.setFillColor(GREEN)
    c.rect(0, PAGE_H - 80 * mm, PAGE_W, 80 * mm, fill=1, stroke=0)

    # Title
    c.setFillColor(white)
    c.setFont("DavidBd", 28)
    title = heb("רשימת כל היישובים והשכונות בישראל")
    tw = c.stringWidth(title, "DavidBd", 28)
    c.drawString((PAGE_W - tw) / 2, PAGE_H - 40 * mm, title)

    c.setFont("DavidBd", 20)
    sub = heb("BigBot — מערכת נסיעות חכמה")
    tw2 = c.stringWidth(sub, "DavidBd", 20)
    c.drawString((PAGE_W - tw2) / 2, PAGE_H - 55 * mm, sub)

    c.setFont("David", 14)
    info = heb(f"1,454 רשומות | עודכן: אפריל 2026")
    tw3 = c.stringWidth(info, "David", 14)
    c.drawString((PAGE_W - tw3) / 2, PAGE_H - 70 * mm, info)

    # Stats boxes
    box_y = PAGE_H - 120 * mm
    box_w = 60 * mm
    box_h = 25 * mm

    # Box 1: Cities
    bx1 = PAGE_W / 2 + 10 * mm
    c.setFillColor(LIGHT_GREEN)
    c.roundRect(bx1, box_y, box_w, box_h, 5, fill=1, stroke=0)
    c.setFont("DavidBd", 24)
    c.setFillColor(GREEN)
    n1 = heb("1,252")
    tw_n1 = c.stringWidth(n1, "DavidBd", 24)
    c.drawString(bx1 + (box_w - tw_n1) / 2, box_y + 13 * mm, n1)
    c.setFont("David", 11)
    c.setFillColor(DARK)
    l1 = heb("יישובים")
    tw_l1 = c.stringWidth(l1, "David", 11)
    c.drawString(bx1 + (box_w - tw_l1) / 2, box_y + 4 * mm, l1)

    # Box 2: Neighborhoods
    bx2 = PAGE_W / 2 - 10 * mm - box_w
    c.setFillColor(LIGHT_GREEN)
    c.roundRect(bx2, box_y, box_w, box_h, 5, fill=1, stroke=0)
    c.setFont("DavidBd", 24)
    c.setFillColor(GREEN)
    n2 = heb("202")
    tw_n2 = c.stringWidth(n2, "DavidBd", 24)
    c.drawString(bx2 + (box_w - tw_n2) / 2, box_y + 13 * mm, n2)
    c.setFont("David", 11)
    c.setFillColor(DARK)
    l2 = heb("שכונות ואזורים")
    tw_l2 = c.stringWidth(l2, "David", 11)
    c.drawString(bx2 + (box_w - tw_l2) / 2, box_y + 4 * mm, l2)

    # Sources
    src_y = box_y - 20 * mm
    draw_center(c, src_y, "מקורות: הלמ\"ס, ויקיפדיה עברית, data.gov.il", "David", 10, HexColor("#757575"))

    footer()
    c.showPage()
    page_num[0] += 1

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 1: CITIES
    # ═══════════════════════════════════════════════════════════════════
    y[0] = PAGE_H - MARGIN_T

    # Section header bar
    c.setFillColor(GREEN)
    c.rect(MARGIN_L - 5 * mm, y[0] - 2 * mm, CONTENT_W + 10 * mm, 10 * mm, fill=1, stroke=0)
    c.setFont("DavidBd", 16)
    c.setFillColor(white)
    sec1 = heb("חלק א׳ — יישובים (1,252)")
    tw_s = c.stringWidth(sec1, "DavidBd", 16)
    c.drawString(PAGE_W - MARGIN_R - tw_s, y[0], sec1)
    y[0] -= 18 * mm

    right_x = PAGE_W - MARGIN_R

    for letter in HEB_LETTERS:
        group = city_groups.get(letter, [])
        if not group:
            continue

        # Letter header
        ensure_space(20 * mm)
        c.setFillColor(LIGHT_GREEN)
        c.rect(MARGIN_L, y[0] - 2 * mm, CONTENT_W, 8 * mm, fill=1, stroke=0)
        c.setFont("DavidBd", 14)
        c.setFillColor(GREEN)
        lbl = heb(f"{letter}  ({len(group)})")
        tw_lbl = c.stringWidth(lbl, "DavidBd", 14)
        c.drawString(right_x - tw_lbl, y[0], lbl)
        y[0] -= 12 * mm

        # Cities as flowing text (comma separated, wrapped)
        text = " ,".join(reversed(group))  # reversed for RTL comma display
        rendered = heb(text)
        c.setFont("David", 10)
        c.setFillColor(black)

        # Simple word-wrap
        words = rendered.split(" ")
        line = ""
        for word in words:
            test = line + (" " if line else "") + word
            if c.stringWidth(test, "David", 10) > CONTENT_W:
                if line:
                    ensure_space(5 * mm)
                    c.setFont("David", 10)
                    c.setFillColor(black)
                    c.drawString(MARGIN_L, y[0], line)
                    y[0] -= 4.5 * mm
                line = word
            else:
                line = test
        if line:
            ensure_space(5 * mm)
            c.setFont("David", 10)
            c.setFillColor(black)
            c.drawString(MARGIN_L, y[0], line)
            y[0] -= 4.5 * mm

        y[0] -= 3 * mm

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 2: NEIGHBORHOODS
    # ═══════════════════════════════════════════════════════════════════
    new_page()
    y[0] = PAGE_H - MARGIN_T

    c.setFillColor(GREEN)
    c.rect(MARGIN_L - 5 * mm, y[0] - 2 * mm, CONTENT_W + 10 * mm, 10 * mm, fill=1, stroke=0)
    c.setFont("DavidBd", 16)
    c.setFillColor(white)
    sec2 = heb("חלק ב׳ — שכונות ואזורים פנימיים (202)")
    tw_s2 = c.stringWidth(sec2, "DavidBd", 16)
    c.drawString(PAGE_W - MARGIN_R - tw_s2, y[0], sec2)
    y[0] -= 18 * mm

    # Sort cities by number of neighborhoods (descending)
    sorted_cities = sorted(hood_groups.items(), key=lambda x: -len(x[1]))

    for city_name, neighborhoods in sorted_cities:
        ensure_space(15 * mm)

        # City header
        c.setFillColor(LIGHT_GREEN)
        c.rect(MARGIN_L, y[0] - 2 * mm, CONTENT_W, 8 * mm, fill=1, stroke=0)
        c.setFont("DavidBd", 12)
        c.setFillColor(GREEN)
        city_lbl = heb(f"{city_name}  ({len(neighborhoods)})")
        tw_city = c.stringWidth(city_lbl, "DavidBd", 12)
        c.drawString(right_x - tw_city, y[0], city_lbl)
        y[0] -= 12 * mm

        # Neighborhoods as comma-separated flowing text
        text = " ,".join(reversed(neighborhoods))
        rendered = heb(text)
        c.setFont("David", 10)
        c.setFillColor(black)

        words = rendered.split(" ")
        line = ""
        for word in words:
            test = line + (" " if line else "") + word
            if c.stringWidth(test, "David", 10) > CONTENT_W:
                if line:
                    ensure_space(5 * mm)
                    c.setFont("David", 10)
                    c.setFillColor(black)
                    c.drawString(MARGIN_L, y[0], line)
                    y[0] -= 4.5 * mm
                line = word
            else:
                line = test
        if line:
            ensure_space(5 * mm)
            c.setFont("David", 10)
            c.setFillColor(black)
            c.drawString(MARGIN_L, y[0], line)
            y[0] -= 4.5 * mm

        y[0] -= 3 * mm

    # Final footer
    footer()
    c.save()
    print(f"PDF saved: {OUT}")
    print(f"Pages: {page_num[0]}")

if __name__ == "__main__":
    main()
