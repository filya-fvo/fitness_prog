"""Report aggregate PLUS rollout coverage without exposing user data."""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict, dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal

_ACTIVE_USERS = """
    SELECT id
    FROM users
    WHERE is_deleted IS FALSE
      AND merged_into_user_id IS NULL
"""

_ACTIVE_PLUS = """
    SELECT user_id, source
    FROM user_entitlements
    WHERE code = 'plus'
      AND starts_at <= NOW()
      AND revoked_at IS NULL
      AND (ends_at IS NULL OR ends_at > NOW())
"""

_SUMMARY_SQL = f"""
WITH active_users AS ({_ACTIVE_USERS}),
active_plus AS ({_ACTIVE_PLUS})
SELECT
    (SELECT COUNT(*) FROM active_users) AS active_users,
    (SELECT COUNT(DISTINCT user_id) FROM active_plus
        JOIN active_users ON active_users.id = active_plus.user_id) AS plus_users,
    (SELECT COUNT(*) FROM active_users
        WHERE NOT EXISTS (
            SELECT 1 FROM active_plus WHERE active_plus.user_id = active_users.id
        )) AS missing_users,
    (SELECT COUNT(*) FROM active_plus
        JOIN active_users ON active_users.id = active_plus.user_id) AS active_grants
"""

_SOURCES_SQL = f"""
WITH active_users AS ({_ACTIVE_USERS}),
active_plus AS ({_ACTIVE_PLUS})
SELECT active_plus.source, COUNT(*) AS grants
FROM active_plus
JOIN active_users ON active_users.id = active_plus.user_id
GROUP BY active_plus.source
ORDER BY active_plus.source
"""


@dataclass(frozen=True, slots=True)
class PlusReconciliation:
    active_users: int
    plus_users: int
    missing_users: int
    active_grants: int
    grants_by_source: dict[str, int]


async def reconcile_plus_entitlements(session: AsyncSession) -> PlusReconciliation:
    """Return only bounded aggregate rollout counts."""

    summary = (await session.execute(text(_SUMMARY_SQL))).mappings().one()
    source_rows = (await session.execute(text(_SOURCES_SQL))).mappings().all()
    return PlusReconciliation(
        active_users=int(summary["active_users"]),
        plus_users=int(summary["plus_users"]),
        missing_users=int(summary["missing_users"]),
        active_grants=int(summary["active_grants"]),
        grants_by_source={str(row["source"]): int(row["grants"]) for row in source_rows},
    )


async def _run() -> PlusReconciliation:
    async with AsyncSessionLocal() as session:
        return await reconcile_plus_entitlements(session)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--require-complete",
        action="store_true",
        help="Return a non-zero exit code when an active account has no PLUS access.",
    )
    args = parser.parse_args()
    result = asyncio.run(_run())
    print(json.dumps(asdict(result), ensure_ascii=False, sort_keys=True))
    return 2 if args.require_complete and result.missing_users else 0


if __name__ == "__main__":
    raise SystemExit(main())
