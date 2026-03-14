import hashlib
import hmac
import urllib.parse
from datetime import datetime, timezone

from app.core.config import settings
from app.models.order import Order


class VNPayService:
    """Minimal VNPay integration for v1."""

    def create_payment_url(self, order: Order, client_ip: str = "127.0.0.1") -> str:
        now = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        params: dict[str, str] = {
            "vnp_Version": "2.1.0",
            "vnp_Command": "pay",
            "vnp_TmnCode": settings.VNPAY_TMN_CODE,
            "vnp_Amount": str(order.amount * 100),  # VNPay expects amount * 100
            "vnp_CurrCode": "VND",
            "vnp_TxnRef": order.order_code,
            "vnp_OrderInfo": f"Mua anh PhotoPro {order.order_code}",
            "vnp_OrderType": "other",
            "vnp_Locale": "vn",
            "vnp_ReturnUrl": settings.VNPAY_RETURN_URL,
            "vnp_IpAddr": client_ip,
            "vnp_CreateDate": now,
        }
        sorted_params = sorted(params.items())
        query_string = "&".join(f"{k}={urllib.parse.quote_plus(str(v))}" for k, v in sorted_params)
        signature = self._hmac_sha512(settings.VNPAY_HASH_SECRET, query_string)
        return f"{settings.VNPAY_URL}?{query_string}&vnp_SecureHash={signature}"

    def verify_signature(self, params: dict) -> bool:
        params = dict(params)  # avoid mutating caller's dict
        received_hash = params.pop("vnp_SecureHash", None)
        params.pop("vnp_SecureHashType", None)
        sorted_params = sorted(
            {k: v for k, v in params.items() if k.startswith("vnp_")}.items()
        )
        query_string = "&".join(
            f"{k}={urllib.parse.quote_plus(str(v))}" for k, v in sorted_params
        )
        expected = self._hmac_sha512(settings.VNPAY_HASH_SECRET, query_string)
        return hmac.compare_digest(expected.lower(), (received_hash or "").lower())

    def verify_webhook(self, params: dict) -> bool:
        """Return True only if signature is valid AND payment succeeded (code 00)."""
        if params.get("vnp_ResponseCode", "") != "00":
            return False
        return self.verify_signature(params)

    def _build_test_params(self, order_code: str, amount: int, response_code: str = "00") -> dict:
        """Build VNPay params with a valid HMAC signature — for testing only."""
        params: dict[str, str] = {
            "vnp_TxnRef": order_code,
            "vnp_ResponseCode": response_code,
            "vnp_Amount": str(amount * 100),
        }
        sorted_params = sorted(params.items())
        query_string = "&".join(
            f"{k}={urllib.parse.quote_plus(str(v))}" for k, v in sorted_params
        )
        params["vnp_SecureHash"] = self._hmac_sha512(settings.VNPAY_HASH_SECRET, query_string)
        return params

    @staticmethod
    def _hmac_sha512(secret: str, data: str) -> str:
        return hmac.new(
            secret.encode("utf-8"),
            data.encode("utf-8"),
            hashlib.sha512,
        ).hexdigest()


payment_service = VNPayService()
