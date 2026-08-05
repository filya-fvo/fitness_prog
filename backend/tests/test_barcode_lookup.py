"""Barcode normalize + Open Food Facts mapping helpers."""

from app.services.nutrition_service import (
    _num,
    is_valid_barcode,
    normalize_barcode,
)


def test_normalize_barcode_strips_noise() -> None:
    assert normalize_barcode(" 4600-1234 567890 ") == "46001234567890"
    assert normalize_barcode("ean:3017620422003") == "3017620422003"


def test_is_valid_barcode() -> None:
    assert is_valid_barcode("3017620422003")
    assert is_valid_barcode("4601234567890")
    assert not is_valid_barcode("123")
    assert not is_valid_barcode("abc")


def test_num_helper() -> None:
    assert _num("12.5") == 12.5
    assert _num(None) == 0.0
    assert _num("x", default=3.0) == 3.0
