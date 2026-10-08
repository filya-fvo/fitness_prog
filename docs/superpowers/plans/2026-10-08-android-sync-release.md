# Android sync release — 2026-10-08

Owner explicitly authorized the VPS release in this chat after observing the missing-server banner.
Scope: mount already validated v1 sync into canonical API, additive PostgreSQL migration,
verify existing auth/account ownership/idempotency/web changes/permissions, backup and deploy,
verify the installed APK with preserved session and SQLite. Photos/background/distribution remain next chat.

1. RED actual app route test: pull returned 404 (observed).
2. Integrate router/schema/services/models and additive migration 53; existing diary APIs reused.
3. Backend suite, lint/static migrations, isolated real PostgreSQL integration; independent final review.
4. Explicit owned-file commit and fast-forward production push; VPS backup, restore rehearsal,
   pull/build/migrate/API restart; health/web/worker/poller and live APK sync verification.
5. Record exact evidence and update Android handoff; do not reset primary dirty checkout or app.

Ruling: reuse the existing isolated worktree at clean upstream base 2b6d56b,
without carrying A1 native commits into production. Existing untracked native artifacts preserved.
Ruling: v1 refresh detects canonical web writes by bounded snapshots; incremental optimization is deferred
until measured need. Cross-account access, stale edits and duplicate operations must remain fail-closed.

Final review: independent auth_sync_review found one P2 (32768 product UUID binds exceed asyncpg32767).
Final fixed: product + personal value queries batch1000; test_large_product_snapshot RED (32768args) → GREEN.
Final suite841/841 PASS; Ruff PASS; real isolated PostgreSQL/HTTP PASS after fix.
No remaining P1/P2; no personal data or existing artifacts staged.
