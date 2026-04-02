"""Email utility for sending verification and notification emails"""

import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import get_settings


async def send_verification_email(email: str, token: str) -> bool:
    """
    Send email verification link to user

    Args:
        email: User's email address
        token: Verification token

    Returns:
        True if email sent successfully, False otherwise
    """
    settings = get_settings()
    from urllib.parse import quote
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}&email={quote(email)}"

    try:
        # Create email message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Ověř svůj email - Pricing Management"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = email

        # HTML email body
        html_body = f"""
        <html>
            <head></head>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <div style="max-width: 500px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Ověř svůj email</h2>

                    <p>Ahoj,</p>

                    <p>Děkujeme za registraci. Klikni na tlačítko níže, abys ověřil/a svůj email a pokračoval/a v procesu schválení přístupu.</p>

                    <div style="margin: 30px 0;">
                        <a href="{verify_url}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Ověřit email
                        </a>
                    </div>

                    <p>Nebo zkopíruj tento odkaz do prohlížeče:</p>
                    <p style="word-break: break-all; color: #666;">
                        <a href="{verify_url}" style="color: #2563eb;">{verify_url}</a>
                    </p>

                    <p style="color: #999; font-size: 12px; margin-top: 30px;">
                        Tento odkaz vyprší za 24 hodin.
                    </p>
                </div>
            </body>
        </html>
        """

        # Plain text version
        text_body = f"""
Ověř svůj email

Ahoj,

Děkujeme za registraci. Ověř svůj email kliknutím na odkaz níže:

{verify_url}

Tento odkaz vyprší za 24 hodin.
        """

        # Attach both text and HTML parts
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        # Send email via SMTP
        # Port 465 uses SSL/TLS from start; port 587 uses STARTTLS
        use_ssl = settings.SMTP_PORT == 465
        smtp = aiosmtplib.SMTP(
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            use_tls=use_ssl,
        )
        await smtp.connect()
        if not use_ssl:
            await smtp.starttls()
        await smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        await smtp.send_message(msg)
        await smtp.quit()

        return True

    except Exception as e:
        print(f"Error sending verification email to {email}: {e}")
        return False


async def send_password_reset_email(email: str, token: str) -> bool:
    """Send password reset link to user"""
    settings = get_settings()
    from urllib.parse import quote
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}&email={quote(email)}"

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Obnova hesla - Pricing Management"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = email

        html_body = f"""
        <html>
            <head></head>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <div style="max-width: 500px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Obnova hesla</h2>
                    <p>Ahoj,</p>
                    <p>Obdrželi jsme žádost o obnovu hesla k tvému účtu. Klikni na tlačítko níže pro nastavení nového hesla.</p>
                    <div style="margin: 30px 0;">
                        <a href="{reset_url}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Nastavit nové heslo
                        </a>
                    </div>
                    <p>Nebo zkopíruj tento odkaz do prohlížeče:</p>
                    <p style="word-break: break-all; color: #666;">
                        <a href="{reset_url}" style="color: #2563eb;">{reset_url}</a>
                    </p>
                    <p style="color: #999; font-size: 12px; margin-top: 30px;">
                        Tento odkaz vyprší za 1 hodinu. Pokud jsi o obnovu hesla nežádal/a, tento email ignoruj.
                    </p>
                </div>
            </body>
        </html>
        """

        text_body = f"""Obnova hesla

Ahoj,

Obdrželi jsme žádost o obnovu hesla. Nastav nové heslo kliknutím na odkaz:

{reset_url}

Tento odkaz vyprší za 1 hodinu. Pokud jsi o obnovu nežádal/a, tento email ignoruj.
        """

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        use_ssl = settings.SMTP_PORT == 465
        smtp = aiosmtplib.SMTP(hostname=settings.SMTP_HOST, port=settings.SMTP_PORT, use_tls=use_ssl)
        await smtp.connect()
        if not use_ssl:
            await smtp.starttls()
        await smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        await smtp.send_message(msg)
        await smtp.quit()
        return True

    except Exception as e:
        print(f"Error sending password reset email to {email}: {e}")
        return False


async def send_approval_notification_email(email: str, full_name: str) -> bool:
    """
    Send email notifying user that their account has been approved

    Args:
        email: User's email address
        full_name: User's full name

    Returns:
        True if email sent successfully, False otherwise
    """
    settings = get_settings()
    login_url = f"{settings.FRONTEND_URL}/login"

    try:
        # Create email message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Tvůj účet byl schválen - Pricing Management"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = email

        # HTML email body
        html_body = f"""
        <html>
            <head></head>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <div style="max-width: 500px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #16a34a;">Vítej!</h2>

                    <p>Ahoj {full_name},</p>

                    <p>Tvůj účet v Pricing Management byl schválen administrátorem. Nyní se můžeš přihlásit a začít pracovat.</p>

                    <div style="margin: 30px 0;">
                        <a href="{login_url}" style="background-color: #16a34a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Přihlásit se
                        </a>
                    </div>

                    <p>Pokud máš jakékoli otázky, neváhej nás kontaktovat.</p>
                </div>
            </body>
        </html>
        """

        # Plain text version
        text_body = f"""
Vítej!

Ahoj {full_name},

Tvůj účet v Pricing Management byl schválen administrátorem. Nyní se můžeš přihlásit a začít pracovat.

{login_url}

Pokud máš jakékoli otázky, neváhej nás kontaktovat.
        """

        # Attach both text and HTML parts
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        # Send email via SMTP
        use_ssl = settings.SMTP_PORT == 465
        smtp = aiosmtplib.SMTP(
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            use_tls=use_ssl,
        )
        await smtp.connect()
        if not use_ssl:
            await smtp.starttls()
        await smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        await smtp.send_message(msg)
        await smtp.quit()

        return True

    except Exception as e:
        print(f"Error sending approval notification email to {email}: {e}")
        return False
