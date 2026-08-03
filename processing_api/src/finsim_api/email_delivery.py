"""Email delivery helpers for account verification and security codes."""

from __future__ import annotations

from dataclasses import dataclass
from email.message import EmailMessage
import os
import smtplib


@dataclass(frozen=True, slots=True)
class EmailDeliveryResult:
    local_delivery: bool


class EmailDeliveryError(RuntimeError):
    """Raised when a configured email provider cannot send a message."""


def send_account_email(*, to_email: str, subject: str, body: str) -> EmailDeliveryResult:
    """Send an account email, or keep local codes visible during development."""

    mode = os.environ.get("FINSIM_EMAIL_MODE", "local").strip().lower()
    if mode in {"", "local"}:
        return EmailDeliveryResult(local_delivery=True)
    if mode != "smtp":
        raise EmailDeliveryError("FINSIM_EMAIL_MODE must be local or smtp")

    host = _required_env("FINSIM_SMTP_HOST")
    port = int(os.environ.get("FINSIM_SMTP_PORT", "587"))
    username = _required_env("FINSIM_SMTP_USERNAME")
    password = _required_env("FINSIM_SMTP_PASSWORD")
    sender = _required_env("FINSIM_EMAIL_FROM")
    use_tls = os.environ.get("FINSIM_SMTP_USE_TLS", "true").strip().lower() != "false"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to_email
    message.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=12) as smtp:
            if use_tls:
                smtp.starttls()
            smtp.login(username, password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        raise EmailDeliveryError("Email could not be sent") from error
    return EmailDeliveryResult(local_delivery=False)


def _required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise EmailDeliveryError(f"{name} is required when SMTP email is enabled")
    return value
