"""Nutrition SQLAlchemy models (TZ §4)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampSoftDeleteMixin

meal_type_enum = ENUM(
    "breakfast",
    "lunch",
    "dinner",
    "snack",
    name="meal_type",
    create_type=False,
)

nutrition_source_enum = ENUM(
    "openfoodfacts",
    "manual",
    name="nutrition_source",
    create_type=False,
)


class NutritionProduct(Base, TimestampSoftDeleteMixin):
    __tablename__ = "nutrition_products"

    name_ru: Mapped[str] = mapped_column(Text, nullable=False)
    barcode: Mapped[str | None] = mapped_column(Text, nullable=True)
    calories: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    proteins: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    fats: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    carbs: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        nutrition_source_enum,
        nullable=False,
        default="manual",
        server_default="manual",
    )


class NutritionLog(Base, TimestampSoftDeleteMixin):
    __tablename__ = "nutrition_logs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    meal_type: Mapped[str] = mapped_column(meal_type_enum, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("nutrition_products.id"),
        nullable=False,
    )
    quantity_grams: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    calculated_kbj: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
