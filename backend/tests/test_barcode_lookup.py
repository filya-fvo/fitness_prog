"""Barcode normalize + Open Food Facts mapping helpers."""

import pytest

from app.services.nutrition_service import (
    _num,
    is_valid_barcode,
    list_categories,
    normalize_barcode,
    normalize_product_name,
    search_products,
)


def test_normalize_barcode_strips_noise() -> None:
    assert normalize_barcode(" 4600-1234 567890 ") == "46001234567890"
    assert normalize_barcode("ean:3017620422003") == "3017620422003"


def test_normalize_product_name_decodes_supplier_entities() -> None:
    assert normalize_product_name('  Батончик &quot;Спорт&quot;  ') == 'Батончик "Спорт"'
    assert normalize_product_name("A&amp;quot;B&amp;quot;") == 'A"B"'


def test_is_valid_barcode() -> None:
    assert is_valid_barcode("3017620422003")
    assert is_valid_barcode("4601234567890")
    assert not is_valid_barcode("123")
    assert not is_valid_barcode("abc")


def test_num_helper() -> None:
    assert _num("12.5") == 12.5
    assert _num(None) == 0.0
    assert _num("x", default=3.0) == 3.0


class _Rows:
    def __init__(self, values: list) -> None:
        self.values = values

    def all(self) -> list:
        return self.values


@pytest.mark.asyncio
async def test_barcode_category_filters_products_with_barcode() -> None:
    statements = []

    class Session:
        async def scalar(self, statement):
            statements.append(statement)
            return 0

        async def scalars(self, statement):
            statements.append(statement)
            return _Rows([])

    await search_products(Session(), q="", category="barcode")
    sql = "\n".join(str(statement) for statement in statements)
    assert "nutrition_products.barcode IS NOT NULL" in sql


@pytest.mark.asyncio
async def test_categories_include_virtual_barcode_filter() -> None:
    class Session:
        async def scalars(self, statement):
            return _Rows(["custom", "dairy"])

        async def scalar(self, statement):
            return 2

    assert await list_categories(Session()) == ["custom", "dairy", "barcode"]
