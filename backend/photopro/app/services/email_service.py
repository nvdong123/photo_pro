import logging

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)

resend.api_key = settings.RESEND_API_KEY


def send_download_email(
    to_email: str,
    order_code: str,
    customer_phone_masked: str,
    photo_count: int,
    download_token: str,
    expires_at_str: str,
    max_downloads: int,
    preview_urls: list[str],
) -> None:
    download_url = f"{settings.effective_frontend_url}/d/{download_token}"
    previews_html = "".join(
        f'<img src="{url}" style="width:120px;margin:4px;" />'
        for url in preview_urls[:3]
    )
    html_body = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:auto">
      <h2>📸 Ảnh của bạn đã sẵn sàng – {order_code}</h2>
      <p>Xin chào {customer_phone_masked},</p>
      <p>Cảm ơn bạn đã mua <strong>{photo_count} ảnh</strong>.</p>
      <p>
        <a href="{download_url}"
           style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
                  text-decoration:none;border-radius:6px;font-size:16px">
          Xem &amp; Tải ảnh ngay
        </a>
      </p>
      <p>Link: <a href="{download_url}">{download_url}</a></p>
      <p>Hết hạn: {expires_at_str}</p>
      <div>{previews_html}</div>
      <hr/>
      <small>Lưu ý: Link chỉ dùng được {max_downloads} lần. Hãy tải về máy ngay.</small>
    </div>
    """
    try:
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to_email],
            "subject": f"📸 Ảnh của bạn đã sẵn sàng – {order_code}",
            "html": html_body,
        })
    except Exception:
        logger.exception("Failed to send download email for order %s", order_code)
