"""Unit tests for VNPay payment service."""
import uuid

import pytest

from app.models.order import Order
from app.services.payment_service import VNPayService

vnpay = VNPayService()


def _make_order(order_code: str = "PP20260306ABCXYZ", amount: int = 50000) -> Order:
    return Order(
        id=uuid.uuid4(),
        order_code=order_code,
        amount=amount,
        customer_phone="0901234567",
    )


def test_create_payment_url_contains_required_fields():
    order = _make_order()
    url = vnpay.create_payment_url(order)
    assert f"vnp_Amount={order.amount * 100}" in url
    assert f"vnp_TxnRef={order.order_code}" in url
    assert "vnp_SecureHash=" in url


def test_create_payment_url_amount_multiplied_by_100():
    order = _make_order(amount=50000)
    url = vnpay.create_payment_url(order)
    assert "vnp_Amount=5000000" in url


def test_verify_webhook_valid_signature():
    params = vnpay._build_test_params(order_code="PP123", amount=50000, response_code="00")
    assert vnpay.verify_webhook(params) is True


def test_verify_webhook_wrong_signature():
    params = {
        "vnp_TxnRef": "PP123",
        "vnp_ResponseCode": "00",
        "vnp_SecureHash": "wrong_hash_value",
    }
    assert vnpay.verify_webhook(params) is False


def test_verify_webhook_failed_payment():
    params = vnpay._build_test_params(order_code="PP123", amount=50000, response_code="24")
    assert vnpay.verify_webhook(params) is False  # code 24 = user cancel


def test_verify_signature_does_not_mutate_input():
    """verify_signature must not pop keys from the caller's dict."""
    params = vnpay._build_test_params(order_code="PP123", amount=10000, response_code="00")
    original_keys = set(params.keys())
    vnpay.verify_signature(params)
    assert set(params.keys()) == original_keys


def test_build_test_params_has_secure_hash():
    params = vnpay._build_test_params("PPTEST", 30000)
    assert "vnp_SecureHash" in params
    assert len(params["vnp_SecureHash"]) == 128  # SHA-512 hex digest
