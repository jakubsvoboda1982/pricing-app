"""
Nuties Pricing Manager — generátor PDF cenových reportů
Vytváří PDF s přehledem změn cen nad nastaveným prahem.
"""

from __future__ import annotations
import io
import os
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Fonty s českou diakritikou ───────────────────────────────────────────────
_FONT_DIRS = [
    '/System/Library/Fonts/Supplemental/',   # macOS
    '/usr/share/fonts/truetype/liberation/', # Linux (Railway)
    '/usr/share/fonts/truetype/dejavu/',     # Linux fallback
]
_FONT_CANDIDATES = {
    'R': ['Arial.ttf',          'LiberationSans-Regular.ttf', 'DejaVuSans.ttf'],
    'B': ['Arial Bold.ttf',     'LiberationSans-Bold.ttf',    'DejaVuSans-Bold.ttf'],
    'I': ['Arial Italic.ttf',   'LiberationSans-Italic.ttf',  'DejaVuSans-Oblique.ttf'],
}

def _find_font(variants: list[str]) -> Optional[str]:
    for d in _FONT_DIRS:
        for v in variants:
            p = os.path.join(d, v)
            if os.path.exists(p):
                return p
    return None

_reg_R = _find_font(_FONT_CANDIDATES['R'])
_reg_B = _find_font(_FONT_CANDIDATES['B'])
_reg_I = _find_font(_FONT_CANDIDATES['I'])

if _reg_R:
    pdfmetrics.registerFont(TTFont('Rep',      _reg_R))
    pdfmetrics.registerFont(TTFont('Rep-Bold', _reg_B or _reg_R))
    pdfmetrics.registerFont(TTFont('Rep-Ital', _reg_I or _reg_R))
    _FONT = 'Rep'
    _FONTB = 'Rep-Bold'
else:
    _FONT = 'Helvetica'
    _FONTB = 'Helvetica-Bold'

# ── Paleta barev ─────────────────────────────────────────────────────────────
DARK     = colors.HexColor('#0f172a')
NAVY     = colors.HexColor('#1e3a5f')
ACCENT   = colors.HexColor('#1d4ed8')
TEAL     = colors.HexColor('#0891b2')
GREEN    = colors.HexColor('#16a34a')
GREEN_BG = colors.HexColor('#f0fdf4')
RED      = colors.HexColor('#dc2626')
RED_BG   = colors.HexColor('#fef2f2')
AMBER    = colors.HexColor('#b45309')
AMBER_BG = colors.HexColor('#fffbeb')
WHITE    = colors.white
GREY_BG  = colors.HexColor('#f8fafc')
GREY_BDR = colors.HexColor('#cbd5e1')
GREY_TXT = colors.HexColor('#64748b')
BLUE_BG  = colors.HexColor('#eff6ff')

W, H    = A4
MARGIN  = 14 * mm
CW      = W - 2 * MARGIN

# ── Pomocník pro styly ────────────────────────────────────────────────────────
_n = 0
def _s(font=None, size=9, color=colors.black, leading=None, align=TA_LEFT,
        sa=0, sb=0, bold=False) -> ParagraphStyle:
    global _n; _n += 1
    return ParagraphStyle(
        f'_r{_n}',
        fontName=_FONTB if bold else (font or _FONT),
        fontSize=size, textColor=color,
        leading=leading or round(size * 1.35),
        alignment=align, spaceAfter=sa, spaceBefore=sb,
    )

# Předdefinované styly
sTLG  = _s(size=24, color=WHITE,    bold=True, leading=30)
sSUB  = _s(size=10, color=TEAL,     leading=15)
sMET  = _s(size=8,  color=colors.HexColor('#94a3b8'), leading=12)
sH2   = _s(size=12, color=ACCENT,   bold=True, sa=3, sb=3)
sSM   = _s(size=8,  color=GREY_TXT, leading=12)
sFTR  = _s(size=8,  color=GREY_TXT, leading=12, align=TA_RIGHT)
sCEL  = _s(size=8.5, leading=12)
sCELB = _s(size=8.5, bold=True, leading=12)
sCELR = _s(size=8.5, align=TA_RIGHT, leading=12)
sCELBR= _s(size=8.5, bold=True, align=TA_RIGHT, leading=12)
sCGR  = _s(size=8.5, color=GREY_TXT, align=TA_RIGHT, leading=12)
sCGN  = _s(size=8.5, color=GREEN,    align=TA_RIGHT, bold=True, leading=12)
sCRD  = _s(size=8.5, color=RED,      align=TA_RIGHT, bold=True, leading=12)
sTH   = _s(size=8,  color=WHITE, bold=True, leading=12)
sTHR  = _s(size=8,  color=WHITE, bold=True, align=TA_RIGHT, leading=12)
sTHC  = _s(size=8,  color=WHITE, bold=True, align=TA_CENTER, leading=12)
sKL   = _s(size=7.5, color=GREY_TXT, align=TA_CENTER, leading=11)
sKV   = _s(size=20, bold=True, align=TA_CENTER, leading=24)
sKVG  = _s(size=20, bold=True, color=GREEN, align=TA_CENTER, leading=24)
sKVR  = _s(size=20, bold=True, color=RED,   align=TA_CENTER, leading=24)
sKVA  = _s(size=20, bold=True, color=AMBER, align=TA_CENTER, leading=24)
sRTL  = _s(size=9,  bold=True, leading=13)
sRBD  = _s(size=8.5, leading=13)


def _pos_cell(pos: str) -> Paragraph:
    if pos == 'best':
        return Paragraph('nejlevnejsi', _s(size=8, color=GREEN, bold=True, align=TA_CENTER))
    elif pos == 'worse':
        return Paragraph('drazsi',      _s(size=8, color=RED,   bold=True, align=TA_CENTER))
    return Paragraph('stred',           _s(size=8, color=AMBER, bold=True, align=TA_CENTER))


def generate_price_change_report(
    products: list[dict],
    period_from: date,
    period_to: date,
    recipient_email: str,
    threshold_pct: float = 5.0,
) -> bytes:
    """
    Vygeneruje PDF report o změnách cen.

    products: seznam dicts se strukturou:
        name, sku, my_price, old_price, currency,
        competitors: [(name, price)],
        position: 'best'|'worse'|'mid',
        margin_pct: float|None,
        stock: int|None,
    threshold_pct: minimální % změna pro zařazení do sekce "Změny cen"
    Vrátí PDF jako bytes.
    """
    today = period_to

    # Filtruj změny přes práh
    def _pct_change(p):
        if not p.get('old_price') or p['old_price'] == 0:
            return 0.0
        return abs(p['my_price'] - p['old_price']) / p['old_price'] * 100

    changes = [p for p in products if _pct_change(p) >= threshold_pct]

    # KPI
    total   = len(products)
    n_best  = sum(1 for p in products if p.get('position') == 'best')
    margins = [p['margin_pct'] for p in products if p.get('margin_pct') is not None]
    avg_m   = sum(margins) / len(margins) if margins else 0.0
    low_m   = sum(1 for m in margins if m < 10)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=0, bottomMargin=12*mm,
    )
    story = []

    # ── HEADER ──────────────────────────────────────────────────────────────
    period_str = (
        f"{period_from.strftime('%-d. %-m. %Y')} – {period_to.strftime('%-d. %-m. %Y')}"
        if period_from != period_to
        else period_to.strftime('%-d. %-m. %Y')
    )
    hdr = Table([[
        [
            Paragraph('Nuties', sTLG),
            Spacer(1, 2),
            Paragraph('Pricing Manager · Cenovy report', sSUB),
            Spacer(1, 5),
            Paragraph(f'Sledovane obdobi: {period_str}', sMET),
            Paragraph(f'Prijemce: {recipient_email} · Frekvence: denne', sMET),
        ],
        [
            Paragraph(str(total), _s(size=40, bold=True, color=WHITE, align=TA_RIGHT, leading=46)),
            Paragraph('sledovanych produktu', _s(size=9, color=TEAL, align=TA_RIGHT, leading=13)),
        ],
    ]], colWidths=[CW * 0.62, CW * 0.38], rowHeights=[50*mm])
    hdr.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,-1), DARK),
        ('VALIGN',        (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING',   (0,0), (0,-1),  9*mm),
        ('RIGHTPADDING',  (1,0), (1,-1),  9*mm),
        ('TOPPADDING',    (0,0), (-1,-1), 7*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7*mm),
    ]))
    story.append(hdr)
    story.append(Spacer(1, 5*mm))

    # ── KPI KARTY ───────────────────────────────────────────────────────────
    story.append(Paragraph('Prehled', sH2))

    kpis = [
        ('CELKEM PRODUKTU',     str(total),        sKV,  GREY_BG,  GREY_BDR),
        ('NEJLEVNEJSI NA TRHU', str(n_best),        sKVG, GREEN_BG, GREEN),
        ('PRUMERNA MARZE',      f'{avg_m:.1f} %',   sKV,  GREY_BG,  GREY_BDR),
        ('NIZKA MARZE (<10 %)', str(low_m),         sKVR if low_m else sKV,
                                                          RED_BG if low_m else GREY_BG,
                                                          RED if low_m else GREY_BDR),
        ('ZMENY CEN',           str(len(changes)),  sKVA if changes else sKV,
                                                          AMBER_BG if changes else GREY_BG,
                                                          AMBER if changes else GREY_BDR),
    ]
    kpi_t = Table(
        [[[Paragraph(lbl, sKL), Spacer(1,3), Paragraph(val, vstyle)]
          for lbl, val, vstyle, bg, bdr in kpis]],
        colWidths=[CW/5]*5, rowHeights=[22*mm],
    )
    kpi_t.setStyle(TableStyle([
        *[('BACKGROUND', (i,0),(i,0), kpis[i][3]) for i in range(5)],
        *[('BOX',        (i,0),(i,0), 1, kpis[i][4]) for i in range(5)],
        ('INNERGRID',     (0,0),(-1,-1), 0.5, GREY_BDR),
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
        ('TOPPADDING',    (0,0),(-1,-1), 5),
        ('BOTTOMPADDING', (0,0),(-1,-1), 5),
        ('LEFTPADDING',   (0,0),(-1,-1), 4),
        ('RIGHTPADDING',  (0,0),(-1,-1), 4),
    ]))
    story.append(kpi_t)
    story.append(Spacer(1, 6*mm))

    # ── ZMĚNY CEN ────────────────────────────────────────────────────────────
    if not changes:
        story.append(Paragraph(
            f'Zadne zmeny cen nad {threshold_pct:.0f} % za sledovane obdobi.',
            _s(size=9, color=GREY_TXT),
        ))
        story.append(Spacer(1, 6*mm))
    else:
        story.append(Paragraph(f'Zmeny cen ({len(changes)} produktu, prah > {threshold_pct:.0f} %)', sH2))
        ch_rows = [[
            Paragraph('Produkt',    sTH),
            Paragraph('Stara cena', sTHR),
            Paragraph('Nova cena',  sTHR),
            Paragraph('Zmena',      sTHR),
            Paragraph('% zmena',    sTHR),
        ]]
        for p in changes:
            diff = p['my_price'] - p['old_price']
            pct  = _pct_change(p)
            cur  = p.get('currency', 'Kc')
            ch_rows.append([
                Paragraph(p['name'], sCEL),
                Paragraph(f"{p['old_price']:.0f} {cur}", sCGR),
                Paragraph(f"{p['my_price']:.0f} {cur}",  sCELBR),
                Paragraph(f"{diff:+.0f} {cur}",  sCRD if diff > 0 else sCGN),
                Paragraph(f"{pct:+.1f} %",        sCRD if diff > 0 else sCGN),
            ])
        ch_t = Table(ch_rows, colWidths=[CW*0.42, CW*0.13, CW*0.13, CW*0.17, CW*0.15])
        ch_t.setStyle(TableStyle([
            ('BACKGROUND',    (0,0),(-1,0),  NAVY),
            ('LINEBELOW',     (0,0),(-1,0),  1.5, TEAL),
            ('ROWBACKGROUNDS',(0,1),(-1,-1), [WHITE, GREY_BG]),
            ('BOX',           (0,0),(-1,-1), 0.5, GREY_BDR),
            ('INNERGRID',     (0,1),(-1,-1), 0.3, GREY_BDR),
            ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
            ('TOPPADDING',    (0,0),(-1,-1), 5),
            ('BOTTOMPADDING', (0,0),(-1,-1), 5),
            ('LEFTPADDING',   (0,0),(-1,-1), 6),
            ('RIGHTPADDING',  (0,0),(-1,-1), 6),
        ]))
        story.append(ch_t)
        story.append(Spacer(1, 6*mm))

    # ── PŘEHLED PRODUKTŮ ─────────────────────────────────────────────────────
    story.append(Paragraph('Prehled produktu a konkurence', sH2))
    all_rows = [[
        Paragraph('Produkt',    sTH),
        Paragraph('Moje cena',  sTHR),
        Paragraph('Min. konk.', sTHR),
        Paragraph('Rozdil',     sTHR),
        Paragraph('Pozice',     sTHC),
        Paragraph('Marze',      sTHR),
        Paragraph('Sklad',      sTHR),
    ]]
    for p in products:
        mc   = min((c[1] for c in p.get('competitors', [])), default=None)
        diff = (p['my_price'] - mc) if mc is not None else None
        cur  = p.get('currency', 'Kc')
        ds   = f"{diff:+.0f} {cur}" if diff is not None else '-'
        ds_s = sCGN if (diff and diff < 0) else (sCRD if (diff and diff > 0) else sCGR)
        ms   = f"{p['margin_pct']:.1f} %" if p.get('margin_pct') is not None else '-'
        ms_s = sCGN if (p.get('margin_pct') and p['margin_pct'] >= 15) else \
               (sCRD if (p.get('margin_pct') and p['margin_pct'] < 10) else sCELR)
        all_rows.append([
            Paragraph(p['name'], sCEL),
            Paragraph(f"{p['my_price']:.0f} {cur}", sCELBR),
            Paragraph(f"{mc:.0f} {cur}" if mc is not None else '-', sCELR),
            Paragraph(ds, ds_s),
            _pos_cell(p.get('position', 'mid')),
            Paragraph(ms, ms_s),
            Paragraph(str(p.get('stock', '-')), sCELR),
        ])
    all_t = Table(all_rows,
        colWidths=[CW*0.30, CW*0.11, CW*0.11, CW*0.12, CW*0.16, CW*0.10, CW*0.10])
    all_t.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),(-1,0),  DARK),
        ('LINEBELOW',     (0,0),(-1,0),  1.5, TEAL),
        ('ROWBACKGROUNDS',(0,1),(-1,-1), [WHITE, GREY_BG]),
        ('BACKGROUND',    (1,1),(1,-1),  BLUE_BG),
        ('BOX',           (0,0),(-1,-1), 0.5, GREY_BDR),
        ('INNERGRID',     (0,1),(-1,-1), 0.3, GREY_BDR),
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
        ('TOPPADDING',    (0,0),(-1,-1), 5),
        ('BOTTOMPADDING', (0,0),(-1,-1), 5),
        ('LEFTPADDING',   (0,0),(-1,-1), 6),
        ('RIGHTPADDING',  (0,0),(-1,-1), 6),
    ]))
    story.append(all_t)
    story.append(Spacer(1, 5*mm))

    # ── FOOTER ───────────────────────────────────────────────────────────────
    story.append(HRFlowable(width=CW, thickness=0.5, color=GREY_BDR))
    story.append(Spacer(1, 2*mm))
    ft = Table([[
        Paragraph('Nuties Pricing Manager · pricing.jacobsvoboda.cz', sSM),
        Paragraph(f"Vygenerovano automaticky · {today.strftime('%-d. %-m. %Y')}", sFTR),
    ]], colWidths=[CW*0.6, CW*0.4])
    ft.setStyle(TableStyle([
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
        ('TOPPADDING',    (0,0),(-1,-1), 0),
        ('BOTTOMPADDING', (0,0),(-1,-1), 0),
        ('LEFTPADDING',   (0,0),(-1,-1), 0),
        ('RIGHTPADDING',  (0,0),(-1,-1), 0),
    ]))
    story.append(ft)

    doc.build(story)
    return buf.getvalue()
