"""
Cenové reporty — generování a odesílání emailem.
"""

from __future__ import annotations

import base64
import os
from datetime import date, datetime, timedelta, timezone
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import verify_token
from app.models import Company, Product, Price
from app.models import CompetitorProductPrice

router = APIRouter(prefix='/api/reports', tags=['reports'])


# ── Schémata ─────────────────────────────────────────────────────────────────
class SendReportRequest(BaseModel):
    recipient_email: str = 'jak.svo1982@gmail.com'
    threshold_pct: float = 5.0
    days_back: int = 1  # porovnávej s cenou starší o N dní


# ── Pomocné funkce ────────────────────────────────────────────────────────────
def _get_company_id(token_payload: dict, db: Session):
    from app.models import User
    user = db.query(User).filter(User.id == token_payload.get('sub')).first()
    return user.company_id if user else None


def _build_product_rows(db: Session, company_id, days_back: int) -> list[dict]:
    """Sestaví data produktů pro report z DB."""
    products = db.query(Product).filter(
        Product.company_id == company_id
    ).all()

    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
    rows = []

    for p in products:
        # Aktuální cena CZ
        latest = (
            db.query(Price)
            .filter(Price.product_id == p.id, Price.market == 'CZ')
            .order_by(desc(Price.changed_at))
            .first()
        )
        if not latest:
            continue

        # Cena před N dny
        old_price_row = (
            db.query(Price)
            .filter(Price.product_id == p.id, Price.market == 'CZ',
                    Price.changed_at < cutoff)
            .order_by(desc(Price.changed_at))
            .first()
        )
        old_price = float(old_price_row.current_price) if old_price_row else float(latest.current_price)

        # Konkurenční ceny
        comp_rows = db.query(CompetitorProductPrice).filter(
            CompetitorProductPrice.product_id == p.id,
            CompetitorProductPrice.market == 'CZ',
        ).all()
        competitors = []
        for c in comp_rows:
            if c.price:
                name = (c.competitor_url or '').replace('https://', '').replace('www.', '').split('/')[0]
                competitors.append((name, float(c.price)))

        # Pozice na trhu
        my = float(latest.current_price)
        min_comp = min((c[1] for c in competitors), default=None)
        if min_comp is None:
            position = 'mid'
        elif my <= min_comp:
            position = 'best'
        elif my > min_comp * 1.05:
            position = 'worse'
        else:
            position = 'mid'

        rows.append({
            'name':        p.name,
            'sku':         p.sku or '',
            'my_price':    my,
            'old_price':   old_price,
            'currency':    latest.currency or 'CZK',
            'competitors': competitors,
            'position':    position,
            'margin_pct':  None,  # TODO: doplnit až bude marže v DB
            'stock':       p.stock_quantity,
        })

    return rows


async def _send_report_email(
    recipient: str,
    pdf_bytes: bytes,
    report_date: date,
    n_changes: int,
) -> bool:
    """Odešle PDF report emailem přes SMTP (SendGrid nebo jiný SMTP)."""
    from app.config import get_settings
    settings = get_settings()

    smtp_pass = settings.SMTP_PASSWORD
    if not smtp_pass:
        print('[Report] SMTP_PASSWORD není nastaveno — email nebyl odeslán')
        return False

    subject = (
        f'Nuties · Cenový report {report_date.strftime("%-d. %-m. %Y")}'
        + (f' · {n_changes} změn' if n_changes else ' · bez změn')
    )

    msg = MIMEMultipart('mixed')
    msg['Subject'] = subject
    msg['From']    = f'Nuties Pricing <{settings.SMTP_FROM_EMAIL}>'
    msg['To']      = recipient

    # HTML tělo
    change_line = (
        f'<b>{n_changes} produkt{"ů" if n_changes != 1 else ""}</b> zaznamenalo změnu ceny nad nastaveným prahem.'
        if n_changes else
        'Žádné výrazné změny cen za sledované období.'
    )
    html = f"""
    <html><body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0">
      <div style="max-width:560px;margin:0 auto">
        <div style="background:#0f172a;padding:28px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;font-size:22px;margin:0">Nuties</h1>
          <p style="color:#0891b2;margin:4px 0 0">Pricing Manager · Cenový report</p>
        </div>
        <div style="background:#f8fafc;padding:24px 32px;border:1px solid #e2e8f0;border-top:none">
          <p style="margin-top:0">Ahoj Jakube,</p>
          <p>{change_line}</p>
          <p>Kompletní přehled najdeš v přiloženém PDF reportu.</p>
          <div style="margin:24px 0">
            <a href="https://pricing.jacobsvoboda.cz"
               style="background:#1d4ed8;color:#fff;padding:11px 24px;text-decoration:none;
                      border-radius:6px;font-size:14px;display:inline-block">
              Otevřít Pricing Manager
            </a>
          </div>
          <p style="color:#64748b;font-size:13px;margin-bottom:0">
            Report za {report_date.strftime("%-d. %-m. %Y")} · odesláno automaticky
          </p>
        </div>
        <div style="padding:12px 32px;color:#94a3b8;font-size:11px">
          Nuties Pricing Manager · pricing.jacobsvoboda.cz
        </div>
      </div>
    </body></html>
    """
    msg.attach(MIMEText(html, 'html', 'utf-8'))

    # PDF příloha
    attachment = MIMEApplication(pdf_bytes, _subtype='pdf')
    attachment.add_header(
        'Content-Disposition', 'attachment',
        filename=f'nuties-cenovy-report-{report_date.strftime("%Y-%m-%d")}.pdf',
    )
    msg.attach(attachment)

    try:
        use_ssl = settings.SMTP_PORT == 465
        smtp = aiosmtplib.SMTP(
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            use_tls=use_ssl,
        )
        await smtp.connect()
        if not use_ssl:
            await smtp.starttls()
        await smtp.login(settings.SMTP_USER, smtp_pass)
        await smtp.send_message(msg)
        await smtp.quit()
        print(f'[Report] Email odeslán na {recipient}')
        return True
    except Exception as e:
        print(f'[Report] Chyba při odesílání emailu: {e}')
        return False


# ── API endpointy ─────────────────────────────────────────────────────────────
@router.post('/send')
async def send_price_report(
    payload: SendReportRequest,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Ruční odeslání cenového reportu na email.
    Obsahuje pouze produkty se změnou ceny > threshold_pct.
    """
    from app.utils.report_generator import generate_price_change_report

    company_id = _get_company_id(token_payload, db)
    if not company_id:
        raise HTTPException(status_code=400, detail='Společnost nenalezena')

    today = date.today()
    rows  = _build_product_rows(db, company_id, days_back=payload.days_back)

    if not rows:
        raise HTTPException(status_code=404, detail='Žádné sledované produkty')

    pdf = generate_price_change_report(
        products=rows,
        period_from=today - timedelta(days=payload.days_back),
        period_to=today,
        recipient_email=payload.recipient_email,
        threshold_pct=payload.threshold_pct,
    )

    n_changes = sum(
        1 for p in rows
        if p['old_price'] and abs(p['my_price'] - p['old_price']) / p['old_price'] * 100 >= payload.threshold_pct
    )

    sent = await _send_report_email(
        recipient=payload.recipient_email,
        pdf_bytes=pdf,
        report_date=today,
        n_changes=n_changes,
    )

    return {
        'ok': sent,
        'recipient': payload.recipient_email,
        'products': len(rows),
        'changes': n_changes,
        'pdf_size_kb': round(len(pdf) / 1024, 1),
        'message': 'Report odeslán' if sent else 'SMTP není nakonfigurováno — PDF připraveno ale email nebyl odeslán',
    }


@router.get('/preview')
async def preview_report(
    threshold_pct: float = 5.0,
    days_back: int = 1,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Vrátí přehled co by obsahoval report (bez odesílání emailu).
    Použití: ověření dat před odesláním.
    """
    company_id = _get_company_id(token_payload, db)
    if not company_id:
        raise HTTPException(status_code=400, detail='Společnost nenalezena')

    rows = _build_product_rows(db, company_id, days_back=days_back)
    changes = [
        p for p in rows
        if p['old_price'] and abs(p['my_price'] - p['old_price']) / p['old_price'] * 100 >= threshold_pct
    ]

    return {
        'total_products':  len(rows),
        'changes_over_threshold': len(changes),
        'threshold_pct':   threshold_pct,
        'changes': [
            {
                'name':      p['name'],
                'old_price': p['old_price'],
                'new_price': p['my_price'],
                'change_pct': round((p['my_price'] - p['old_price']) / p['old_price'] * 100, 1),
                'currency':  p['currency'],
            }
            for p in changes
        ],
    }
