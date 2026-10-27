# Remaining WEB constructor work

> For agentic workers: use superpowers:subagent-driven-development, one implementation at a time. This is the continuation of the approved 25 October plan, not a new feature proposal.

**Goal:** finish and release personal-program creation, then start the separate design-audit chat requested by the owner.

**Architecture:** keep the shared WorkoutDayComposer and the single personalProgramDraft → WorkoutPlan/API boundary. UI-only raw text and time units belong to recoverable personal drafts. Existing execution contracts remain authoritative.

**Spec:** docs/superpowers/specs/2026-10-25-web-builder-audit-design.md

## Global constraints

Only this isolated worktree; no main/previous checkout, Android/APK/devices, production test records or notifications. Personal limits remain 1–7 days, 1–12 exercises, 1–8 sets, ordinary rest 0–300 seconds; method/group pauses retain their current limits. Shared recovery default 100000 characters, personal recovery budget 4000000. No new dependencies or duplicate execution mathematics. No deployment until the constructor is complete. Release requires reviewed diff, green checks, backup/restore verification and live verification under the existing runbook.

## Stop scope drift

Each item below has its own brief, tests, independent review and commit. The same implementer fixes a concrete defect in the current item's changed behavior. A finding outside that behavior receives a separate ID, reproduction and priority; it does not silently expand the current item. Review fixes are scoped to the reported defect and new breakage caused by that fix. No broad refactors or repeated broad suites without a changed risk. Root owns commits and final release. Already committed B01/B02/B03/N17 are not repeated.

## Remaining steps, in order

- [ ] **G1: goal data and exact time conversion.** Extract the partial B04a data changes from the unfinished UI. Validate reps ranges, optional complete weights and integer-second time; preserve raw strings and strict owner-bound time-unit metadata across recovery/reorder/removal. Legacy parser retains invalid text. Existing UI remains unchanged. Unit RED/GREEN, type/lint and targeted adapter regression; independent review and commit.
- [ ] **G2: repeats and optional weight controls.** Connect two range inputs and optional planned weight for compatible catalog rows through the shared contextual goal renderer. Empty/incomplete values stay editable and block save, complete comma/dot values work, weight mode uses existing semantics. Targeted browser RED/GREEN and responsive layout check; review and commit. Time UI remains unchanged in this step.
- [ ] **G3: work-time controls.** Add seconds/minutes, presets and steppers for timed rows. Convert exactly to seconds; preserve empty/incomplete raw text and reject fractional seconds. Unit selection works before entering text. Valid conversions preserve seconds; impossible exact conversions explain recovery. Reload/owner and timed-start checks; review and commit.
- [ ] **G4: explicit legacy-goal conversion.** Existing old goal text remains editable; visible action converts parseable reps/time, unparseable text blocks conversion/save without loss. Recovered old numeric/string drafts and current goal drafts stay usable. Targeted RED/GREEN; review and commit.
- [ ] **G5: cross-load exercise replacement.** Keep the existing compatibility guard and add an explicit reset-and-replace action. Clear only replaced goal/method/raw/unit/weight-mode ownership; retain counts, rest, groups and unrelated rows. Cancel leaves the draft unchanged. Targeted RED/GREEN; review and commit.
- [ ] **G6: honest prepared typed goals (N11).** Show actual typed range/time/weight read-only with explanation; hide legacy inputs the runtime ignores only on typed rows. No-target preparation retains current edits. No new target-delta API. Targeted RED/GREEN; review and commit.
- [ ] **G7: durable end-to-end acceptance (B04b).** Add one representative real disposable-PostgreSQL create → fresh session read → actual plan → prepared start → explicit result → fresh reload case, including private ownership and goal/fact separation. Existing mock/browser layers complement this test. Local skips remain skips; hosted execution must pass. Review and test-only commit.
- [ ] **G8: old-tab draft compatibility (N14).** Reproduce deletion with the exact production reader; isolate new personal format with safe migration of old drafts, source comparison, owner/quota/size safeguards and no ghost reimport after accepted save/discard. Narrow RED/GREEN; review and commit.
- [ ] **G9: final constructor gate.** Review the complete branch once; address concrete blockers individually. Run applicable exact-head CI including G7 actual PostgreSQL, final WEB scenarios and visual/bundle checks. Preserve earlier flaky-run evidence. Refresh final PR description around the finished behavior.
- [ ] **G10: production release.** Push the checked production ref, verify backup and restore, ff-only VPS update/build/migrate, API readiness before new WEB, live services/API/site/affected read checks, cache maintenance. Record exact released SHA; a local commit is not deployment.
- [ ] **G11: new audit chat.** Only after G10, create the explicitly authorized new chat with its own isolated worktree and handoff; begin F01,F02,F04,F05,F07,F06,F10,F03,F08,F09 one at a time. Do not recreate fulfilled one-shot schedules.

## Review focus

Incomplete strings must never become default/zero/numeric prefixes; time units must never silently round or alter saved seconds; legacy conversion/replacement must not discard text/configuration without explicit action; typed targets must not look editable where preparation cannot persist them; goals must remain distinct from performed facts and private owner boundaries.

## Current checkpoint

27 October 2026: HEAD 1dd724eaa0b2e8d8617ef6a477e0c1d0c2c67af6. Partial B04a work exists without final verification/review. G1 starts by preserving all owned partial UI work in local evidence and removing it from the candidate source tree; no completed work is redone. The former aggregate B04a brief is background; G1–G6 replace its execution boundaries. Detailed identity/evidence remain in .superpowers/sdd/2026-10-25-web-builder-audit/progress.md.
