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

## W3 — recurring personal days and calendar compatibility

- Four API/SQL RED cases for raw template, promotion, inherited revision and dependent reset; GREEN with explicit scope/revision checks and atomic promotion. Other incompatible date drafts cause409 without changes.
- The automatic-target freeze was reproduced in the pure patch builder and fixed; explicit fixed rest survives even when equal to current phase. Cache invalidation preserves other owners/programs/outbox.
- Actual PostgreSQL tests cover four-day rotation/cursor, new program version and return, move/cancel, repeated move and return to default, target draft conflict. Repeated-date source bug and cancelled legacy unique collision reproduced/fixed. Two actual concurrent-connection tests fail without user locks and pass with them.
- Final backend985 passed/Ruff PASS (one existing Starlette deprecation warning); frontend754 unit/lint/build/PWA PASS;16 Chromium cases PASS, including both themes/four widths and separate persistent reset. Updated393px light/dark screenshots inspected.
- Aggregate JS initially exceeded W2 cap. Same-session W2 baseline596558/540081 -> W3 598001/541545 (product+1464bytes). Bounded caps598600/542100 pass; largest/vendor/admin limits unchanged, no dependency added.
- Server commit did not publish changes; methods/sequence/timers and remaining offline/Android stages still pending.


## W4 — structured results and compatibility

- Valid RED: old plan validation discarded method/groups; SQL writes had no child parts, legacy writes could flatten the result; personal delta omitted methods; both restore/prefill paths clipped slots13–20. All repaired with focused assertions.
- Actual PostgreSQL checks cover partial/all-skipped/completed parts, immutable operation receipts, stale revisions, two concurrent devices, offline part IDs, private access, invalid weights, legacy dispatch, stale prepared snapshot and private cluster-in-superset plan.
- Migration tested against synthetic ordinary history: intentionally failed transaction rolls back all new schema, successful migration retains IDs/reps/weight/completion. Calendar completion lock order was reproduced separately and aligned to user-before-workout; final execution/idempotency28 PASS.
- Full backend1003 PASS before final bounded-size/lock-order additions; final targeted28 PASS and Ruff PASS. Migration checker57 PASS. Frontend761 unit, lint/types/build/PWA PASS. Chromium15 PASS (preparation plus composer, four widths and both themes).
- Bundle598238 total /541770 product, largest108742/admin56468, within unchanged W3 limits; shared API mapping replaces duplicated program-start parsing. No new dependency.
- No native implementation/device claim: only the existing legacy protocol dispatch was exercised. Timer/runtime UI/analytics integration and W9 durable queue remain pending; no deployment at this stage.


## W5 — sequence and deadline clock

- Pure domain vectors cover every rest decision: ordinary sets/blocks, drop, cluster20/20/120 and20/20/end, superset0/90/0/end, triset, circuit with timed member, cluster inside group and following independent block. AutoAdvance does not change timing.
- RED: absent engine/clock, missing bridge, whole-participant skip incorrectly completed work, stale undo could cancel a new completion of the same step. All corrected; original UUIDs and completed parts retained.
- Clock vectors cover delayed response, throttling, same deadline after reload, owner/workout boundary, late return with one signal, zero, extension/manual stop, no resurrection, midnight/timezone and ambiguous system-clock/sleep changes. Ambiguity requires explicit continuation.
- Full web790 unit PASS; final targeted41 PASS after explicit midnight and stale-undo regressions, lint/types PASS. No backend changes in W5. This is the pure layer: UI/durable transactions/signals are connected in W7/W9, native lifecycle remains untested until Android stages.

W5 final build/PWA PASS; bundle598290/541813, largest108742/admin56477 within unchanged W3 limits.


## W6 — preparation UI

- Valid browser RED reached missing group editor after correcting the fixture Add-button name. Pure helper tests cover contiguous grouping, explicit rounds, block/member reorder, guarded removal and replacement references.
- Real RED→GREEN: applying a configured100kg cluster to all slots had retained100 only on the last slot; selection now explicitly copies one common template. Invalid descending weights block save, failed network save retains the draft.
- Timed circle member initially had a repetitions-only control; now uses seconds in the existing human-readable target field (e.g.40 с). Weighted methods are blocked for timed/reps-only/cardio types in preparation and server start; sixteen shared fixtures verify client/server classification. Duplicate v2 order rejected.
- Changed catalog type initially prevented reopening a saved personal method; validation moved to writes/start so it can be opened and cleared. Actual SQL regression66 targeted PASS/Ruff after full backend1024 PASS before that final regression.
- Full web814 unit PASS, final lint/types/build/PWA PASS. Combined Chromium29 PASS: previous preparation/composer plus methods, group references, four widths/two themes/393x600, focus and network errors. Final393 light/dark screenshots inspected.
- Playwright option toBeDisabled matcher reported an enabled option despite native disabled=true; changed to the actual HTMLOptionElement.disabled property plus standard-value assertion. No product restriction was weakened.
- W5 bundle598290/541813 -> final604278/547799 (+5986 product gzip bytes). New editors/preview remain in existing lazy Training chunk, same vendor108742/admin56479. Narrow caps604900/548400, other caps/dependencies unchanged.
- Not deployed. Runtime recording/timer screen, analytics, offline reconciliation and installed Android remain later stages.


## W7 — runtime, durable facts and contextual rest

- Valid initial browser RED: real ActiveWorkout had no part UI. GREEN: individual parts, group rounds, timed targets, old correction, exact-action undo, skip remainder and manual navigation.
- IndexedDB tests verify atomic part/cursor/rest/full outbox, rollback on storage failure, duplicate identity/stale-tab rejection, single signal claim, owner boundary and protection from late generic saves. Full v2 projection and dependent-operation blocking preserve all facts.
- Final web828 unit PASS, lint/types/build/PWA PASS. Chromium18 timing/layout/a11y PASS plus8 legacy recovery/day cases; final additional early-finish regression PASS. Four widths320/375/393/1440, light/dark, low height568, actual browser clock and explicit focus/visibility checked. Both393 screenshots inspected.
- Real RED→GREEN: note1001 characters was accepted locally although server allows1000; writer/UI now reject before facts/rest/outbox. Real RED→GREEN: early finish during an in-flight part waited for a later background flush after unmount; a requested follow-up flush now drains immediately in order. Partial finish never marks pending parts completed.
- AutoAdvance changes viewed card only. Completion/correction require user action. Drop0-pause, cluster20/20/120, grouped participant transition before round90, timed40-second target, +15/early stop/no final rest are verified in the browser.
- W6 bundle604278/547799 -> W7 615345/558870 (+11071 product gzip bytes), same dependencies/largest108742/admin56475. Bounded aggregate caps615950/559450 preserve less than0.7KB headroom; admin/largest caps unchanged.
- No release yet: W8 owns report/history math for compound parts; W9 owns full offline fingerprint/conflict/native-projection review and completion timestamp at the server. Android source remains untouched.


## W8 — actual load and structured history

- Valid RED: pure volume returned0 for compounds; actual PostgreSQL lost partial rows and reported0 full volume. Client chart/completion and local diary independently reproduced the same loss. Fixed with one SQL effective-load projection and matched Python/web rules.
- Checked vectors: drop660, cluster1200, partial800, per_hand1600 for partial; no parent duplication, pending/skipped0, deleted part/parent excluded and other owner empty. Ordinary superset participant keeps63.3 estimated1RM for50×8, normal hints/trends, one parent and one workout. Compound methods excluded from points/trends/private relative strength/hints.
- Full backend1035 PASS, then final targeted129 PASS and final expanded metrics/SQL12 PASS; Ruff PASS. Web835 unit/lint/types/build/PWA PASS. API roundtrip verifies nullable root and numeric parts; new version query preserves legacy exercise diary behavior.
- Chromium23 PASS for method history + timing, plus4 legacy day-edit cases earlier. Final2 layout/theme runs after hiding fixture-only diagnostic output passed. Four widths, low height568, both themes, focus restoration and axe checked; screenshots inspected.
- Actual accessibility failure: role=dialog on form was disallowed; replaced with named dialog container and inner form, original axe assertion passes. Failed network correction retains form and retries identical operation UUID; no rest controls in history.
- W7 bundle615345/558870 ->617972/561471 (+2601 product gzip bytes), same dependencies/largest108742/admin56501. Narrow caps618550/562050; admin/largest caps unchanged.
- Not released; W9 offline reconciliation and W10 final acceptance/deployment remain. Native source not started.


## W9a — first recovery fixes

- Valid RED3: equivalent decimal weights caused a topology conflict; offline completion used server receipt time; occurrence patch survived start. All fixed and SQL-checked, with constant personal-day revision and rejection of late writes to the started date.
- Complete confirmation pair is aware/bounded, future>5min rejected before completion, retry retains original finish/duration. Full web outbox-to-REST assertion verifies both fields.
- Backend1045 PASS/Ruff PASS; web836 unit/lint/types/build/PWA PASS; Chromium2 completion regressions PASS. Remaining W9 durable preparation/envelope/conflict work is still open; no deployment or Android source changes.


## W9b — durable envelope and two-tab recovery

- Valid RED5: wrong planned rest target and inconsistent cursor/future envelope were accepted; reordered equivalent snapshot keys failed; older local revision and unknown API version could apply. Fixed with strict session validation and semantic key matching. Additional real RED: authentication changed before store cleanup; old-owner response now rejected.
- Valid RED: old open correction could overwrite a newer parent when the shared envelope revision had already updated. Added baseSetRevision guard; entered fields remain visible, explicit form refresh loads the new value. Clock-only updates do not conflict with a parent result.
- Full web847 unit/lint/types/build/PWA PASS. Final Chromium25 PASS: reload12s remainder, throttled late return, one signal across tabs, concurrent part recording, corrupted target retained/blocked, ambiguous wall-clock continuation, stale correction proposal plus all earlier timing/layout/a11y vectors. Unit coverage also verifies account change during read, out-of-order restore requests and ordinary legacy recovery.
- W9a bundle618021/561524 ->619937/563437 (+1913 product gzip bytes); existing dependencies and unchanged largest108742/admin56500 caps. Aggregate bounds620550/564050 retain <0.7KB headroom.
- Remaining W9: durable personal/date preparation and ordered dependent create, cross-device standard skipped representation, prepared fingerprint/capability/bounds, post-commit cache warnings and wider async owner audit, PostgreSQL CI wiring. Not deployed; Android waits for W10.


## W9c — ordinary participant skip roundtrip

- Explicit v2 `is_skipped` flag survives REST fetch, local drafts/outbox and history; legacy defaults remain false. Completed and skipped cannot both be true; compound slots use part statuses.
- Actual PostgreSQL roundtrip covers skip/undo/replay and compatibility with existing operation hashes. Append-only migration preserves ordinary IDs/reps/weight/completion; transactional rollback checked.
- Full backend:1050 PASS and one test-harness failure (raw DDL executed before lazy SAVEPOINT). Materialized the SAVEPOINT; all6 skip tests now PASS. Ruff and58-migration checker PASS. Web849 unit/lint/types/build/PWA PASS.
- Bundle620261/563741 below620550/564050, same dependencies and largest108742/admin56520. Chromium25 timing/recovery PASS; new skip test initially had an invalid text encoding, corrected and independently PASS (1).
- Remaining W9 durable preparation/start, fingerprints/bounds, cache/owner audit and CI SQL wiring. No deployment or Android source changes.


## W9d — prepared start identity and SQL CI

- Six valid initial RED failures: missing preparation identity/legacy capability guard. GREEN: private revision, calendar, program version, tampered plan, stable same-ID replay, old client rejection. Expanded checks cover actual6 MiB rejection/explicit1-day complete range, decimal normalization and owner separation.
- Backend1059 full PASS; final58 affected SQL/contract PASS after goals refresh under user lock; Ruff PASS. Web850 full +final26 affected PASS, lint/types/build/PWA PASS. Bundle620202/563704 stays below620550/564050; same dependencies.
- CI PostgreSQL18 job now runs all8 private-plan/structured-execution test modules with WORKOUT_METHODS_TEST_URL, so real transaction checks no longer silently skip there. Hosted CI execution will occur after push.
- Legacy native preparation unchanged; modern nested stamp is ready for web durable start and later Android adaptation. Web durable proposal queue/start UI and smaller-range choice remain next; no release yet.
