# Telegram APK login and in-app update implementation

Spec: docs/superpowers/specs/2026-10-08-native-login-update-design.md
Execution: inline, owner delegated design. Baselines: web aa06200, native 0b8417e. Global constraints: pinned shared unchanged until verified upstream commit; original key, same accounts and durable diary; no campaign replay or body photo/health/external AI.

### Task 1: Canonical server Telegram handshake
Files: backend/app/models/android_login.py, schemas/android_login.py, services/android_login.py, services/telegram_android_login.py, routers/android_auth.py; thin registration in main.py and secret-verified telegram.py; migration 20261008000055_android_login.sql; worker cleanup. Tests: backend/tests/test_android_login.py and test_android_login_routes.py.
Interfaces: start(challenge, source_hash) -> request_id/bot_url/expires_in_sec; POST status/exchange/cancel(request_id,verifier). status waiting/ready with public display_name only. Exchange produces existing TelegramAuthResponse through canonical resolver and serializer. Bot start/confirm consume opaque token only under trusted private Telegram actor.
1. RED real SQL lifecycle/parser tests for missing service. Expected: assertion feature missing.
2. Implement hashed tokens, TTL, conditional claim/approve/consume, rate bound, cleanup. Test verifier theft, expiry, replay, actor mismatch, malformed updates and group/edited/bot exclusion. Expected targeted tests green.
3. RED HTTP routes including missing secret and canonical resolver result. Register service + thin router. Expected HTTP contract green.
4. Run pytest -q and Ruff. Expected all green; commit own paths, push feature head and draft PR for mandatory CI.

### Task 2: Native login without email
Files: Java NativeTelegramLogin and FitnessNative bridge; src/native/TelegramLogin.tsx, telegramLogin.ts, bridge.ts; tests and dedicated shell E2E.
Interfaces: beginTelegramLogin -> waiting/ready public name; inspect/complete/cancel protected Java verifier; complete -> existing auth data with native-session; nativeSession.restore before callback. Server interfaces Task1 exact. Upstream pin only after tests pass.
1. RED native UI lifecycle and Java handshake tests. Expected missing login behavior fails.
2. Implement native private verifier, fixed API requests through NativeHttp, explicit bot opening, resume/poll/retry/cancel, account-name confirmation. Preserve vault generation and outbox; adopt existing merged data.
3. Run native tests/lint/build/shared/shell + instrumentation. Expected green and no JS JWT/verifier; commit.

### Task 3: Native update download and install
Files: Java update manifest/downloader/installer plugin + root native update panel, Android permissions/callback, tests and CI device fixture.
Interfaces: check -> current/available; start/status/cancel -> download/verify/ready/failed; install -> permission/pending/user-action/failure. Exact manifest fields from public latest.json. Root panel protects active workout/form/dialog state before installation.
1. RED manifest and progress tests, including 100%-running, wrong path/hash/package/cert, current/offline.
2. Implement fixed-origin public fetch, persistent own DownloadManager ID/file, actual completion validation and user-triggered PackageInstaller callback. No native credentials. Expected tests green.
3. Verify actual Android upgrade preserving diary/session and restart where system permits. Run whole native/shared/shell checks. Expected green; unresolved OEM limits documented; commit.

### Task 4: Review, release and handoff
1. Fresh whole-branch review with skill reviewer; Critical/Important fixes RED/GREEN + full checks, minor ledger only.
2. Exact upstream CI green, push production branch, remote backup + restore + ff-only + sequential rebuild/migration/up/health. Expected identical reviewed SHA and healthy containers.
3. Pin native upstream; monotonic next APK with original certificate; original-key publication; exact native CI + public full-download SHA/signature/Range/MIME and /app link. Expected pass, no placeholder artifact published.
4. Update guides/NEXT-CHAT and primary owned artifact report including previous APK7 release and campaign, all rulings and limitations. No primary dirty source edits. Expected report links resolve.

## Review Focus
Link leakage cannot exchange without native verifier; bot approval cannot switch actor; native stale requests/logout cannot save another account; race exchange exactly one consumer; updater success requires terminal DownloadManager status and verified bytes; callback cannot be spoofed; installed data retained; user confirmation required; no unchecked download origin or JWT exposure. Dedicated device only.
