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
    domain_display = settings.effective_frontend_url.replace("https://", "").replace("http://", "")
    html_body = f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <tr>
          <td style="background:linear-gradient(135deg,#0a4d36,#1a6b4e);padding:28px 32px;text-align:center">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700">&#128248; &#7842;nh c&#7911;a b&#7841;n &#273;&#227; s&#7861;n s&#224;ng</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px">M&#227; &#273;&#417;n: {order_code}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;color:#333;font-size:15px">Xin ch&#224;o <strong>{customer_phone_masked}</strong>,</p>
            <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6">
              C&#7843;m &#417;n b&#7841;n &#273;&#227; mua <strong style="color:#1a6b4e">{photo_count} &#7843;nh</strong>.
              Nh&#7845;n n&#250;t b&#234;n d&#432;&#7899;i &#273;&#7875; xem v&#224; t&#7843;i &#7843;nh ch&#7845;t l&#432;&#7907;ng cao v&#7873; m&#225;y.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="{download_url}"
                   style="display:inline-block;padding:14px 40px;background:#1a6b4e;color:#ffffff;
                          text-decoration:none;border-radius:8px;font-size:16px;font-weight:700;
                          letter-spacing:0.02em">
                  Xem &amp; T&#7843;i &#7843;nh ngay &#8594;
                </a>
              </td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;background:#f8faf9;border-radius:8px;border:1px solid #e8ede9">
              <tr><td style="padding:16px 20px">
                <p style="margin:0 0 6px;color:#666;font-size:13px">&#128279; Link t&#7843;i: <a href="{download_url}" style="color:#1a6b4e;word-break:break-all">{download_url}</a></p>
                <p style="margin:0 0 6px;color:#666;font-size:13px">&#9200; H&#7871;t h&#7841;n: <strong>{expires_at_str}</strong></p>
                <p style="margin:0;color:#666;font-size:13px">&#128229; S&#7889; l&#7847;n t&#7843;i t&#7889;i &#273;a: <strong>{max_downloads} l&#7847;n</strong></p>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#f8f8fa;border-top:1px solid #eee;text-align:center">
            <p style="margin:0;color:#999;font-size:12px">H&#227;y t&#7843;i &#7843;nh v&#7873; m&#225;y s&#7899;m &#273;&#7875; tr&#225;nh h&#7871;t h&#7841;n link.</p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px">&copy; {domain_display}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    try:
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to_email],
            "subject": f"\U0001f4f8 \u1ea2nh c\u1ee7a b\u1ea1n \u0111\u00e3 s\u1eb5n s\u00e0ng \u2013 {order_code}",
            "html": html_body,
        })
    except Exception:
        logger.exception("Failed to send download email for order %s", order_code)
