"""Barcode normalize + Open Food Facts mapping helpers."""

from uuid import uuid4

import pytest

from app.services import nutrition_service
from app.services.nutrition_service import (
    _num,
    create_product,
    fetch_openfoodfacts,
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


@pytest.mark.asyncio
async def test_create_manual_product_commits_normalized_values() -> None:
    class Session:
        def __init__(self) -> None:
            self.row = None
            self.commits = 0

        def add(self, row) -> None:
            self.row = row

        async def commit(self) -> None:
            self.commits += 1

        async def refresh(self, row) -> None:
            row.id = uuid4()

    session = Session()
    product = await create_product(
        session,
        name_ru="  Йогурт &quot;Тест&quot;  ",
        calories=81.129,
        proteins=5.24,
        fats=2.55,
        carbs=9.16,
    )

    assert session.commits == 1
    assert product.name_ru == 'Йогурт "Тест"'
    assert str(product.calories) == "81.13"
    assert str(product.proteins) == "5.24"
    assert str(product.fats) == "2.55"
    assert str(product.carbs) == "9.16"
    assert product.source == "manual"


@pytest.mark.asyncio
async def test_openfoodfacts_product_is_mapped_without_real_network(monkeypatch) -> None:
    class Response:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "status": 1,
                "product": {
                    "product_name_ru": "Йогурт",
                    "brands": "Тест",
                    "categories_tags": ["en:dairies"],
                    "serving_quantity": 125,
                    "nutriments": {
                        "energy-kcal_100g": 81,
                        "proteins_100g": 5.2,
                        "fat_100g": 2.5,
                        "carbohydrates_100g": 9.1,
                    },
                },
            }

    class Client:
        def __init__(self, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args) -> None:
            return None

        async def get(self, _url: str) -> Response:
            return Response()

    monkeypatch.setattr(nutrition_service.httpx, "AsyncClient", Client)

    product = await fetch_openfoodfacts("4601234567890")

    assert product is not None
    assert product["name_ru"] == "Йогурт (Тест)"
    assert product["calories"] == 81.0
    assert product["proteins"] == 5.2
    assert product["fats"] == 2.5
    assert product["carbs"] == 9.1
    assert product["serving_grams"] == 125.0
