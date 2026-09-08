"""Aggregate-only PLUS rollout reconciliation."""

from __future__ import annotations

import pytest

from scripts.reconcile_plus_entitlements import reconcile_plus_entitlements


class _Mappings:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def one(self) -> dict[str, object]:
        return self.rows[0]

    def all(self) -> list[dict[str, object]]:
        return self.rows


class _Result:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def mappings(self) -> _Mappings:
        return _Mappings(self.rows)


class _Session:
    def __init__(self) -> None:
        self.results = [
            _Result(
                [
                    {
                        "active_users": 17,
                        "plus_users": 17,
                        "missing_users": 0,
                        "active_grants": 18,
                    }
                ]
            ),
            _Result(
                [
                    {"source": "beta_grant", "grants": 16},
                    {"source": "legacy_stars", "grants": 2},
                ]
            ),
        ]

    async def execute(self, *_args, **_kwargs) -> _Result:
        return self.results.pop(0)


@pytest.mark.asyncio
async def test_reconciliation_returns_no_user_identifiers() -> None:
    result = await reconcile_plus_entitlements(_Session())  # type: ignore[arg-type]

    assert result.active_users == 17
    assert result.plus_users == 17
    assert result.missing_users == 0
    assert result.active_grants == 18
    assert result.grants_by_source == {"beta_grant": 16, "legacy_stars": 2}
