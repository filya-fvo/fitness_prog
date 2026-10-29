# WEB then APK — owner decision 2026-10-29

Source authority: read-only C:/Users/broadview/.codex/worktrees/web-program-builder-audit-20261025/fitness_prog/.superpowers/sdd/2026-10-25-web-builder-audit/OWNER-CHANGE-20261029.md. Supersedes old G8 migration and design-audit queue.

Work sequentially, one implementer, independent scoped review and separate commits. G1–G7 already complete at 7953638872c2ce4a83d17b9651b75015abae4e48; do not repeat. Transfer patch SHA256 22469C6F9EC3E09413EF11252CA2363D8CB3C4D425FDFEB8585E1BA61B8C92D1 verified and applied.

1. R1 (complete, independently reviewed; commit 39cdb46c2d798238f1c2d748a3d84cef11a853da): Remove obsolete personal-program draft migration; delete only owner-scoped obsolete personal draft key. Preserve current v2 recovery, raw incomplete values, quotas, owner isolation, current-save acknowledgement/newer drafts. Remove obsolete migration/old-reader fixtures and test expectations. No unrelated backend compatibility cleanup.
2. R2 (complete, independently reviewed; commit 830163a1db62d915e5fdd0a8c68c3871003a1984): Correct two draft-retention browser tests to actual min/max repeats, preserve hidden-day behavior and exact submitted target. All four browser profiles, bounded checks.
3. R3 (complete, independently reviewed; commit 1c6bf355): Reconcile user guide/changelog/architecture and old remaining plan with finished source and owner decision. No design audit or APK claims yet.
4. R4 (whole-constructor review complete; R4-01 amendment independently approved and committed bf968086; exact-HEAD CI pending): Independent final constructor review from production c399250 to final HEAD, narrow blocker fixes only, exact CI checks; no repeat broad audits.
5. R5: Authorized WEB release: inspected diff, commit/push, verified backup and restore, runbook deployment, service/API/site/affected live checks. Production is c399250 until verified otherwise. No fixtures/notifications/user data resets. USER_GUIDE uses neutral WEB instructions without a deployment claim; record the actual released SHA/version only after verified WEB release. Keep the APK status accurate until R6 is verified.
6. R6: Only after WEB, read C:/fitness-android/AGENTS.md and docs/android/HANDOFF.md. Port via shared pin and shared-version, validate native scenario and publish with existing signing/publisher. No duplicated math or temporary WEB/APK bridges without owner question.

Evidence and reports live in .superpowers/sdd/2026-10-29-constructor-finish. Old evidence stays at original read-only path. No timers.

Current evidence: R1 1182 frontend units PASS; TypeScript, full ESLint,
PWA build and original bundle caps PASS. Browser recovery matrix had
128 passed / 12 readiness-guard failures; corrected exact 12 cases passed
separately in four profiles. Initial setup failures and intermediate failed
runs remain in R1-report.md/logs; no single 140-pass claim. R2 reproduced the
two obsolete selectors in Chromium, then 8 cases passed across all four
profiles; file ESLint and TypeScript PASS. Reports are at the evidence path
above; browser tests do not establish native/physical-device acceptance.

Historical CI40702291298 at 795: 1586 passed, 8 obsolete-selector failures,
14 skips, 1 Firefox preparation retry. G7 hosted PostgreSQL: 90 passed,
0 skipped. Existing old evidence remains read-only at the owner-decision
directory above. R4 whole-constructor review and its sole R4-01 amendment are approved; exact-HEAD CI, R5 release and R6 APK are
pending. Preserve the existing backend APK safety bridge; no new temporary
bridge work follows from this documentation task.
