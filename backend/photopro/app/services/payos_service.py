"""PayOS payment gateway integration.

API docs: https://payos.vn/docs/api/
Base URL: https://api-merchant.payos.vn
Auth: x-client-id + x-api-key headers
Signature: HMAC_SHA256 with checksum_key over sorted data string.
"""
import hashlib
import hmac
import zlib

import httpx

from app.core.config import settings
from app.models.order import Order


PAYOS_API_BASE = "https://api-merchant.payos.vn"


class PayOSService:
    """PayOS payment link creation and webhook verification."""

    def __init__(self) -> None:
        self._client_id: str = ""
        self._api_key: str = ""
        self._checksum_key: str = ""

    def configure(self, client_id: str, api_key: str, checksum_key: str) -> None:
        self._client_id = client_id
        self._api_key = api_key
        self._checksum_key = checksum_key

    @property
    def is_configured(self) -> bool:
        return bool(self._client_id and self._api_key and self._checksum_key)

    @staticmethod
    def _order_code_to_int(order_code: str) -> int:
        """Deterministic conversion of order_code string to PayOS integer orderCode.

        Uses CRC32 (deterministic, unlike Python's hash() which is randomized).
        Masked to 31-bit positive integer as PayOS requires.
        """
        return zlib.crc32(order_code.encode("utf-8")) & 0x7FFFFFFF

    async def create_payment_url(self, order: Order) -> str:
        """Create a PayOS payment link and return the checkoutUrl."""
        cancel_url = f"{settings.effective_frontend_url}/payment-failed?order={order.order_code}"
        # Use ppOrder param (not orderCode) to avoid PayOS overwriting it
        return_url = f"{settings.APP_URL}/api/v1/payment/payos/return?ppOrder={order.order_code}"
        payos_int_code = self._order_code_to_int(order.order_code)

        # Build signature data: sorted alphabetically by key
        signature_data = (
            f"amount={order.amount}"
            f"&cancelUrl={cancel_url}"
            f"&description={order.order_code}"
            f"&orderCode={payos_int_code}"
            f"&returnUrl={return_url}"
        )
        signature = self._hmac_sha256(self._checksum_key, signature_data)

        payload = {
            "orderCode": payos_int_code,
            "amount": order.amount,
            "description": order.order_code,
            "cancelUrl": cancel_url,
            "returnUrl": return_url,
            "signature": signature,
        }
        if order.customer_email:
            payload["buyerEmail"] = order.customer_email
        if order.customer_phone:
            payload["buyerPhone"] = order.customer_phone

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{PAYOS_API_BASE}/v2/payment-requests",
                json=payload,
                headers={
                    "x-client-id": self._client_id,
                    "x-api-key": self._api_key,
                },
            )
            resp.raise_for_status()
            body = resp.json()

        if body.get("code") != "00":
            raise RuntimeError(f"PayOS error: {body.get('desc', 'unknown')}")

        return body["data"]["checkoutUrl"]

    def verify_webhook_signature(self, data: dict, signature: str) -> bool:
        """Verify webhook payload signature.

        Per PayOS docs: sort data keys alphabetically, join as key=value,
        null/undefined values treated as empty string.
        """
        sorted_keys = sorted(data.keys())
        parts = []
        for k in sorted_keys:
            v = data[k]
            if v is None:
                v = ""
            parts.append(f"{k}={v}")
        data_str = "&".join(parts)
        expected = self._hmac_sha256(self._checksum_key, data_str)
        return hmac.compare_digest(expected.lower(), signature.lower())

    async def get_payment_info(self, order_code_int: int) -> dict:
        """Fetch payment link info from PayOS."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{PAYOS_API_BASE}/v2/payment-requests/{order_code_int}",
                headers={
                    "x-client-id": self._client_id,
                    "x-api-key": self._api_key,
                },
            )
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    def _hmac_sha256(secret: str, data: str) -> str:
        return hmac.new(
            secret.encode("utf-8"),
            data.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()


payos_service = PayOSService()
