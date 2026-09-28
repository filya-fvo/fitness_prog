"""Personal nutrition fixes stay local until an administrator reviews the catalog."""

from uuid import uuid4
from datetime import date, datetime, timezone

import pytest
import httpx

from app.models.nutrition import NutritionLog, NutritionProduct
from app.models.nutrition_correction import NutritionCorrection
from app.models.user import User
from app.core.database import get_db
from app.deps import require_admin
from app.main import app
from app.schemas.nutrition import NutritionLogCreate, NutritionLogUpdate
from app.services import nutrition_corrections
from app.services.nutrition_service import add_log, update_log


def product() -> NutritionProduct:
    return NutritionProduct(
        id=uuid4(), name_ru="Йогурт", calories=100, proteins=5, fats=3, carbs=12,
        category="dairy", source="manual", is_deleted=False,
    )


def test_correction_is_needed_only_when_catalog_values_differ() -> None:
    row = product()
    same = {"calories": 100, "proteins": 5, "fats": 3, "carbs": 12}
    changed = {**same, "proteins": 6}

    assert nutrition_corrections.needs_review(row, same) is False
    assert nutrition_corrections.needs_review(row, changed) is True


def test_approval_changes_catalog_only_after_review() -> None:
    row = product()
    proposal = nutrition_corrections.new_proposal(
        product=row,
        user_id=uuid4(),
        log_id=uuid4(),
        proposed={"calories": 110, "proteins": 6, "fats": 3, "carbs": 12},
    )
    assert row.proteins == 5

    nutrition_corrections.apply_review(proposal, row, "approve", uuid4())

    assert row.proteins == 6
    assert proposal.status == "approved"
    assert proposal.reviewed_by_user_id is not None


def test_stale_or_repeated_review_does_not_overwrite_catalog() -> None:
    row = product()
    proposal = nutrition_corrections.new_proposal(
        product=row,
        user_id=uuid4(),
        log_id=uuid4(),
        proposed={"calories": 110, "proteins": 6, "fats": 3, "carbs": 12},
    )
    row.proteins = 7
    with pytest.raises(nutrition_corrections.CorrectionConflict):
        nutrition_corrections.apply_review(proposal, row, "approve", uuid4())
    assert row.proteins == 7

    row.proteins = 5
    nutrition_corrections.apply_review(proposal, row, "reject", uuid4())
    with pytest.raises(nutrition_corrections.CorrectionConflict):
        nutrition_corrections.apply_review(proposal, row, "approve", uuid4())
    assert row.proteins == 5


@pytest.mark.asyncio
async def test_personal_override_saves_log_and_queues_catalog_review() -> None:
    row = product()
    user = User(id=uuid4())

    class Session:
        def __init__(self) -> None:
            self.results = iter([row, None, None])
            self.added: list[object] = []

        async def scalar(self, _query: object) -> object:
            return next(self.results)

        def add(self, item: object) -> None:
            self.added.append(item)

        async def execute(self, _query: object) -> None:
            pass

        async def flush(self) -> None:
            for item in self.added:
                if getattr(item, "id", None) is None:
                    item.id = uuid4()

        async def commit(self) -> None:
            pass

        async def refresh(self, _item: object) -> None:
            pass

    session = Session()
    log = await add_log(session, user, NutritionLogCreate(
        product_id=row.id, quantity_grams=100, meal_type="breakfast",
        calories_per_100=110, proteins_per_100=6, fats_per_100=3, carbs_per_100=12,
        date=date.today(),
    ))

    assert log.calculated_kbj["proteins"] == 6
    assert row.proteins == 5
    proposals = [item for item in session.added if isinstance(item, NutritionCorrection)]
    assert len(proposals) == 1
    assert proposals[0].proposed_kbju["proteins"] == 6


@pytest.mark.asyncio
async def test_future_addition_uses_personal_values_without_duplicating_review() -> None:
    row = product()
    user = User(id=uuid4())
    personal = {"calories": 110, "proteins": 8, "fats": 3, "carbs": 12}

    class Session:
        def __init__(self) -> None:
            self.results = iter([row, personal])
            self.added: list[object] = []

        async def scalar(self, _query: object) -> object:
            return next(self.results)

        def add(self, item: object) -> None:
            self.added.append(item)

        async def commit(self) -> None:
            pass

        async def refresh(self, _item: object) -> None:
            pass

    session = Session()
    log = await add_log(session, user, NutritionLogCreate(
        product_id=row.id, quantity_grams=50, meal_type="lunch", date=date.today(),
    ))

    assert log.calculated_kbj["proteins"] == 4
    assert log.calculated_kbj["per_100_override"] == personal
    assert row.proteins == 5
    assert not any(isinstance(item, NutritionCorrection) for item in session.added)


@pytest.mark.asyncio
async def test_editing_existing_diary_entry_updates_its_kbju_and_review_queue() -> None:
    row = product()
    user = User(id=uuid4())
    log = NutritionLog(
        id=uuid4(), user_id=user.id, product_id=row.id, date=date.today(),
        quantity_grams=50, meal_type="breakfast", is_deleted=False,
        calculated_kbj={"calories": 50, "proteins": 2.5, "fats": 1.5, "carbs": 6},
    )

    class Session:
        def __init__(self) -> None:
            self.results = iter([log, row, None])
            self.added: list[object] = []

        async def scalar(self, _query: object) -> object:
            return next(self.results)

        def add(self, item: object) -> None:
            self.added.append(item)

        async def execute(self, _query: object) -> None:
            pass

        async def commit(self) -> None:
            pass

        async def refresh(self, _item: object) -> None:
            pass

    session = Session()
    changed = await update_log(
        session, user, log.id,
        NutritionLogUpdate(proteins_per_100=8),
    )

    assert changed.calculated_kbj["proteins"] == 4
    assert row.proteins == 5
    proposals = [item for item in session.added if isinstance(item, NutritionCorrection)]
    assert len(proposals) == 1
    assert proposals[0].proposed_kbju["proteins"] == 8


@pytest.mark.asyncio
async def test_admin_review_route_applies_only_authenticated_approval() -> None:
    correction_id = uuid4()
    row = product()
    admin = User(id=uuid4())
    proposal = nutrition_corrections.new_proposal(
        product=row, user_id=uuid4(), log_id=uuid4(),
        proposed={"calories": 110, "proteins": 6, "fats": 3, "carbs": 12},
    )
    proposal.id = correction_id
    proposal.created_at = datetime.now(timezone.utc)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        denied = await client.post(
            f"/admin/nutrition/corrections/{correction_id}/decision", json={"decision": "approve"},
        )
    assert denied.status_code == 401
    assert row.proteins == 5

    class Session:
        def __init__(self) -> None:
            self.results = iter([proposal, row])

        async def scalar(self, _query: object) -> object:
            return next(self.results)

        def add(self, _item: object) -> None:
            pass

        async def commit(self) -> None:
            pass

        async def refresh(self, _item: object) -> None:
            pass

    async def fake_db():
        yield Session()

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[require_admin] = lambda: admin
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            approved = await client.post(
                f"/admin/nutrition/corrections/{correction_id}/decision", json={"decision": "approve"},
            )
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"
        assert row.proteins == 6
    finally:
        app.dependency_overrides.clear()
