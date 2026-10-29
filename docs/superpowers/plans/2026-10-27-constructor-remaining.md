# Remaining WEB constructor work

> Historical plan, superseded on 29 October by the owner decision recorded in
> [the active finish plan](2026-10-29-constructor-finish.md). G1–G7 remain complete.
> G8 migration/salvage and G11 design-audit/new-chat work are cancelled; do not
> execute the historical queues below. R1/R2 are committed; R3 reconciles docs.

**Current goal:** finish and release WEB, then port to APK through shared code under the active finish plan. No design audit or new chat.

**Architecture:** keep the shared WorkoutDayComposer and the single personalProgramDraft → WorkoutPlan/API boundary. UI-only raw text and time units belong to recoverable personal drafts. Existing execution contracts remain authoritative.

**Spec:** docs/superpowers/specs/2026-10-25-web-builder-audit-design.md

## Global constraints

Only this isolated worktree; no main/previous checkout, Android/APK/devices, production test records or notifications. Personal limits remain 1–7 days, 1–12 exercises, 1–8 sets, ordinary rest 0–300 seconds; method/group pauses retain their current limits. Shared recovery default 100000 characters, personal recovery budget 4000000. No new dependencies or duplicate execution mathematics. No deployment until the constructor is complete. Release requires reviewed diff, green checks, backup/restore verification and live verification under the existing runbook.

## Stop scope drift

Each item below has its own brief, tests, independent review and commit. The same implementer fixes a concrete defect in the current item's changed behavior. A finding outside that behavior receives a separate ID, reproduction and priority; it does not silently expand the current item. Review fixes are scoped to the reported defect and new breakage caused by that fix. No broad refactors or repeated broad suites without a changed risk. Root owns commits and final release. Already committed B01/B02/B03/N17 are not repeated.

## Historical steps — G1–G7 evidence retained; later queue superseded

- [x] **G1: goal data and exact time conversion.** Extract the partial B04a data changes from the unfinished UI. Validate reps ranges, optional complete weights and integer-second time; preserve raw strings and strict owner-bound time-unit metadata across recovery/reorder/removal. Legacy parser retains invalid text. Existing UI remains unchanged. Unit RED/GREEN, type/lint and targeted adapter regression; independent review and commit.
- [x] **G2: repeats and optional weight controls.** Connect two range inputs and optional planned weight for compatible catalog rows through the shared contextual goal renderer. Empty/incomplete values stay editable and block save, complete comma/dot values work, weight mode uses existing semantics. Targeted browser RED/GREEN and responsive layout check; review and commit. Time UI remains unchanged in this step.
- [x] **G3: work-time controls.** Add seconds/minutes, presets and steppers for timed rows. Convert exactly to seconds; preserve empty/incomplete raw text and reject fractional seconds. Unit selection works before entering text. Valid conversions preserve seconds; impossible exact conversions explain recovery. Reload/owner and timed-start checks; review and commit.
- [x] **G4: explicit legacy-goal conversion.** Existing old goal text remains editable; visible action converts parseable reps/time, unparseable text blocks conversion/save without loss. Recovered old numeric/string drafts and current goal drafts stay usable. Targeted RED/GREEN; review and commit.
- [x] **G5: cross-load exercise replacement.** Keep the existing compatibility guard and add an explicit reset-and-replace action. Clear only replaced goal/method/raw/unit/weight-mode ownership; retain counts, rest, groups and unrelated rows. Cancel leaves the draft unchanged. Targeted RED/GREEN; review and commit.
- [x] **G6: honest prepared typed goals (N11).** Show actual typed range/time/weight read-only with explanation; hide legacy inputs the runtime ignores only on typed rows. No-target preparation retains current edits. No new target-delta API. Targeted RED/GREEN; review and commit.
- [x] **G7: durable end-to-end acceptance (B04b).** Add one representative real disposable-PostgreSQL create → fresh session read → actual plan → prepared start → explicit result → fresh reload case, including private ownership and goal/fact separation. Existing mock/browser layers complement this test. Local skips remain skips; hosted execution must pass. Review and test-only commit.
- [ ] **G8: old-tab draft compatibility (N14).** Reproduce deletion with the exact production reader; isolate new personal format with safe migration of old drafts, source comparison, owner/quota/size safeguards and no ghost reimport after accepted save/discard. Narrow RED/GREEN; review and commit.
- [ ] **G9: final constructor gate.** Review the complete branch once; address concrete blockers individually. Run applicable exact-head CI including G7 actual PostgreSQL, final WEB scenarios and visual/bundle checks. Preserve earlier flaky-run evidence. Refresh final PR description around the finished behavior.
- [ ] **G10: production release.** Push the checked production ref, verify backup and restore, ff-only VPS update/build/migrate, API readiness before new WEB, live services/API/site/affected read checks, cache maintenance. Record exact released SHA; a local commit is not deployment.
- [ ] **G11: new audit chat.** Only after G10, create the explicitly authorized new chat with its own isolated worktree and handoff; begin F01,F02,F04,F05,F07,F06,F10,F03,F08,F09 one at a time. Do not recreate fulfilled one-shot schedules.

## Review focus

## Historical small-step queue — 28 October, 21:46 Moscow (superseded)

The following records the former queue, not active instructions. The 29 October owner decision replaces G8 migration and G11 audit with current-draft cleanup and WEB → shared APK release. The active plan owns final review, CI and deployment.

- [ ] **G8a — finish the current migration check.** Diagnose the single intermediate-raw assertion failing in all four browser profiles; preserve the original 120-pass/4-fail result. Correct only the proven cause, then run that case and any directly affected migration cases. The completed 1183 unit tests are evidence, not a reason to repeat them without a source change.
- [ ] **G8b — close draft compatibility.** Finish sequential lint/types/PWA/bundle checks, document exact old-reader provenance and migration limits, obtain independent SPEC/QUALITY review, address only concrete scoped findings, commit G8.
- [ ] **G9a — repair the existing retention scenarios.** Hosted run 40702291298 failed two old tests in `frontend/e2e/draft-retention.spec.ts` on all four browser profiles because they address the former single “Повторы” input. Reproduce locally, adapt them to the actual min/max controls while retaining hidden-day preservation and selected-day-only request assertions, run both cases across four profiles, review and commit separately. Investigate a product change only if those intended assertions fail. The separate Firefox preparation case passed its retry; keep that flaky evidence without claiming a fix.
- [ ] **G9b — reconcile finished feature documentation.** Update only relevant user guide, architecture/release notes and this checkpoint to match the finished constructor, recovery limits and read-only prepared goals. Review the documentation diff and commit it.
- [ ] **G9c — one final whole-branch review.** Package immutable production-base-to-HEAD diff and existing evidence; one independent reviewer checks the complete constructor. Give each concrete blocking finding its own reproduction, exit check and sequential commit. Re-review amendments only; do not begin the separate design audit here.
- [ ] **G9d — final exact-HEAD CI.** Refresh PR title/body, push the final reviewed feature HEAD and require all applicable jobs green, including actual disposable PostgreSQL and the full registered WEB suite. Diagnose only failures from this run; keep original retries/skips visible.
- [ ] **G10a — prepare release.** Recheck production ref/VPS state, publish the reviewed ref through the authorized branch flow, create a backup and obtain `RESTORE_VERIFY_OK` before updating VPS source.
- [ ] **G10b — deploy and verify.** Follow the existing runbook: ff-only update, build/migrations, ready API before WEB, services/API/site and affected read checks, cache maintenance; record actual published SHA/version and rollback evidence.
- [ ] **G11 — start the separate audit chat.** After verified deployment, create the authorized new chat with the finished SHA and independent worktree instructions; confirm it starts the first audit item and save the handoff. No obsolete one-shot schedules are recreated.

Incomplete strings must never become default/zero/numeric prefixes; time units must never silently round or alter saved seconds; legacy conversion/replacement must not discard text/configuration without explicit action; typed targets must not look editable where preparation cannot persist them; goals must remain distinct from performed facts and private owner boundaries.

## Current checkpoint — 29 October 2026

G1 c32c106, G2 b745bdd, G3 b65059f, G4 16a19ac, G5 2d8528b5,
G6 e9e511a and G7 7953638872c2ce4a83d17b9651b75015abae4e48 completed,
independently reviewed and committed. G7 actual hosted disposable PostgreSQL:
90 passed, 0 skipped. Earlier aggregate B04a partial UI hashes and completed
G1–G7 evidence remain historical evidence, not a second implementation.

Original evidence stays read-only in
C:/Users/broadview/.codex/worktrees/web-program-builder-audit-20261025/fitness_prog/.superpowers/sdd/2026-10-25-web-builder-audit
(including progress.md, N14-report.md/G8-review.md and G8-fix1-* logs).
The failed hosted CI40702291298 at 795 is retained: 1586 passed,
8 obsolete-selector failures (2 retention cases × 4 profiles), 14 skips and
1 Firefox preparation retry. Later bounded R2 acceptance does not turn that
historical run green or establish a Firefox flake fix.

R1 39cdb46c2d798238f1c2d748a3d84cef11a853da removes obsolete migration
and deletes only the exact current-owner obsolete personal key while preserving
private v2 recovery. R2 830163a1db62d915e5fdd0a8c68c3871003a1984
updates the two retention tests to actual От/До controls. Both reviewed and
committed. R3 documentation is in progress; final review, exact-HEAD CI and
deployment remain pending. Production remains c399250 until verified release.

New R1/R2 reports and R3 documentation evidence live in
.superpowers/sdd/2026-10-29-constructor-finish. R1 original setup failures,
128-pass/12-readiness-failure run and separate corrected 12-pass run remain
recorded; they are not a single 140-pass run. No automatic old-draft rescue,
new temporary APK bridge, design audit or new chat is authorized by this plan.
