# Workout methods — baseline 2026-10-19

Approved implementation: docs/superpowers/plans/2026-10-19-personal-workout-methods.md.

- Isolated worktree, branch codex/personal-workout-methods, base cf7b50a.
- GitHub production and read-only VPS /opt/fitness/source HEAD both cf7b50abcc7945749a979af7793e5b13099cc553; branch timeweb-production-20260825.
- Backend baseline: planned_workout/idempotency/phase_meta/offline_workouts/schemas — 33 passed.
- Frontend baseline: workoutSession/workoutStore/workouts API/offlineWorkoutContext — 31 passed.
- Initial frontend setup failed to import fake-indexeddb (22 tests passed, 1 suite import failure); root cause was dependency cache from older checkout. This worktree now uses existing cache with exactly matching package-lock hash. Recheck passed; product code not changed.
- Dedicated local test PostgreSQL 18: loopback 55439, database workout_methods_test, synthetic fixtures only; no production data copied.
- Original checkout and Android source remain unchanged. Android implementation waits for W10.

W0 complete. Next: W1 owner-scoped personal day and occurrence patches, revisions, resolver and transactional migration tests.

## W1 — server customization foundation

- RED: public customizations API absent; then preview resolver omitted added exercise. Both confirmed before implementation.
- GREEN: 968 backend tests including 12 real isolated PostgreSQL checks; Ruff all backend; migration checker 56 files; frontend 743 unit tests plus 9 API tests after adding revision roundtrip; ESLint/build/PWA passed.
- Three readiness tests needed empty customization DB results added to their session stubs; existing assertions unchanged. Eleven tmp_path setup errors resolved using a new dedicated basetemp under task artifacts; no product changes for this environment error.
- Existing Starlette/httpx deprecation warning remains; no test failed or skipped in the final backend run.
- API/model/append-only SQL migration, permanent and date deltas, ownership, optimistic revision, replay protection and shared preview/start resolver implemented. UI and methods/timer still pending.

## W2 — identity regression fixed before UI work

Real PostgreSQL RED: reordering two exercises deleted both saved set rows. GREEN: IDs/weights preserved; backend 969 passed, Ruff PASS. Replacement mapping now uses explicit source identity, never display order. First test fixture import failed during setup and was corrected to the repository tests package before the valid RED run. W2 editor still in progress.

## W2 — date-scoped composer

- Browser RED: missing Add exercise button (after repairing a test route that intercepted exercises.ts). GREEN: 18 Chromium cases including 320/375/393/1440, light/dark, 393x600, save/reopen, reorder/remove, conflict draft retention, existing program preparation and recovery. Both 393px screenshots inspected.
- Backend 972 passed / Ruff PASS, including canonical base GET, atomic legacy adoption, added set slots and duplicate start prevention. Frontend 749 unit passed; an added catalog pagination assertion and API checks passed 12/12. ESLint/build/PWA PASS.
- Initial bundle gate failed (596444 total / 539996 product). A clean export of c9d9153 built with the same dependencies measures 594189 / 537727; measured feature growth is 2269 product bytes. Explicit bounded budgets now 597000 / 540500 (<0.6 KB headroom), with admin/largest/vendor boundaries retained; no dependency added.

Final W2 follow-up: a missing catalog-outage notice was reproduced and fixed; current plan remains usable, adding is disabled without catalog, Escape restores focus. All 10 composer browser cases passed, earlier 18 combined cases passed, frontend final 750 passed/lint/build/PWA PASS. Final budget 596558 total / 540081 product, growth 2354 product bytes against the clean baseline; caps 597000/540500 pass. Backend remains at the checked 972 passed/Ruff.
