# FilFit: базовые документы, подтверждение и выпуск Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Опубликовать три базовых документа, единоразовое подтверждение общего аккаунта, автоматическое обновление APK по кнопке `/app` и затем уведомить пользователей.

**Architecture:** Общий React показывает документы и окно; FastAPI хранит отдельные подтверждения их опубликованных редакций в PostgreSQL. Подтверждённое состояние входит в серверный профиль и его существующий кэш. APK использует проверенный shared commit; Nginx раздаёт файл из отдельного постоянного каталога.

**Tech Stack:** React/TypeScript/Zod, FastAPI/Pydantic, async SQLAlchemy/PostgreSQL, Capacitor/Android, Nginx/Compose, SSH, существующие Telegram/ARQ-рассылки.

**Spec:** `docs/superpowers/specs/2026-10-08-legal-consent-design.md`, commit `8a0f851`. Схема утверждена владельцем; план ожидает проверки перед реализацией.

## Global Constraints

- Три самостоятельных документа: Политика, базовое согласие, бесплатная оферта без условий оплаты.
- Специальное письменное согласие на сведения о здоровье/цикле отложено прямым решением владельца; базовый этап не объявляется правовым основанием этой обработки.
- Три независимые выключенные отметки; закрытие окна не создаёт принятия.
- Один аккаунт в Telegram/web/APK; после принятия редакции нет повторного запроса при входе, перезапуске, смене устройства или переустановке.
- Серверная история — источник истины; локальный кэш только восстанавливает ранее проверенный профиль.
- На базовом этапе нет общего ограничения API. Дневник, активная тренировка, очередь и существующие пользовательские данные сохраняются.
- Общая функция сначала upstream web/backend, затем проверенный commit → Android shared pin. Pinned submodule не редактировать.
- Основной dirty checkout `C:/fitness_prog` не менять. Web: существующий isolated worktree `C:/Users/broadview/.codex/worktrees/android-shell-20261007/fitness_prog`, ветка `codex/android-distribution-consent`. Android: `C:/fitness-android`.
- Не трогать пользовательский BlueStacks; не очищать данные и не менять owner signing key. Публичный APK содержит `https://api.filfitclub.ru`, пакет `ru.filfitclub.app` и прежнюю подпись.
- Производственный выпуск и рассылка выполняются только после зелёных проверок и проверки живых документов/скачивания. Авторизация владельца на эту рассылку уже есть.

## Review Focus

- Старый кэш без нового поля: показать окно, не считать согласие принятым и не очищать очередь — задачи 2–3.
- Смена аккаунта во время запроса: ответ первого аккаунта не подтверждает второй — задачи 2–3.
- CRLF Windows/LF Docker: оба клиента и сервер подтверждают один и тот же нормализованный текст — задача 1.
- Принятие на другом устройстве: обновление серверного профиля закрывает окно без повторного согласия — задача 3.
- Обрыв передачи APK или повтор выпуска: старый файл остаётся доступен, другой ключ/placeholder/понижение версии не публикуются — задача 4.

## Уже выполнено независимо от механизма согласия

Команда `/app` подготовлена: приватный чат, HTTPS-кнопка `/android/latest.apk`, меню/клавиатура/помощь, polling retry и webhook delivery. Telegram-набор: 90 passed, Ruff passed. Локальная папка `C:/fitness-android/apk-releases` и APK версии 3 подготовлены; выпуск с окном согласия ещё впереди. Эти результаты не означают публикацию `/app` или готовность рассылки.

### Task 1: Опубликованные тексты и единый контракт редакций

**Files:** `frontend/src/features/legal/documents/{privacy,consent,offer}.md` (подготовлены); создать `frontend/src/features/legal/documents/manifest.json`, `frontend/src/features/legal/documents.ts`, `backend/app/services/legal_documents.py`, `backend/app/schemas/legal.py`, `backend/tests/test_legal_documents.py`; изменить `backend/Dockerfile`, корневой `Dockerfile` и `.dockerignore` только при необходимости упаковки. Проверить существующий `backend/tests/test_timeweb_deployment.py`.

**Interfaces:** `LegalDocumentId = Literal['privacy','consent','offer']`; редакция каждого — `2026-10-08`. Метаданные: `document_id`, `title`, `revision`, `text_sha256`. `current_documents() -> tuple[LegalDocument, ...]` читает канонические файлы и проверяет manifest. `LegalStatus`: `user_id: UUID`, `accepted: bool`, `documents: list[LegalDocumentStatus]`; каждый статус содержит метаданные и `accepted_at: datetime | None`. В frontend экспортировать `legalDocuments` и одноимённые Zod-схемы через `api/legal.ts` в задаче 2.

- [ ] Проверить окончательные тексты по действующим ст. 9/10/18.1/19/21/22 152-ФЗ и ст. 435/438 ГК РФ, сверить фактические интеграции. Убрать «Проект» только из утверждённых финальных текстов. Сохранить границу специальных категорий, не заявлять оформленными уведомление РКН/договоры поручения.
- [ ] RED: `test_current_documents_match_published_manifest` — ровно три ID; SHA-256 совпадает после UTF-8 и нормализации `\r\n`/`\r` в `\n`; изменённый текст без новой редакции отвергается. Отдельно `test_windows_and_container_text_hashes_match` и `test_backend_image_packages_canonical_documents`.
- [ ] Запустить `python -m pytest backend/tests/test_legal_documents.py -q`; убедиться, что тесты падают на отсутствующем контракте.
- [ ] Реализовать загрузку и безопасное отображение текста без HTML; backend image копирует те же файлы в `/docs/legal`. Доступ к опубликованным редакциям сохраняется; при следующих изменениях добавлять новую редакцию, не переписывать уже принятую.
- [ ] GREEN: целевые тесты и `npx tsc --noEmit` в frontend; проверить результат, commit только файлов этой задачи.

### Task 2: Серверное подтверждение и профиль аккаунта

**Files:** создать `supabase/migrations/20261008000054_legal_acceptances.sql`, `backend/app/models/legal_acceptance.py`, `backend/app/services/legal_consent.py`, `backend/app/routers/legal.py`, `backend/tests/test_legal_consent.py`, `backend/tests/test_legal_routes.py`, `frontend/src/api/legal.ts`; изменить `models/__init__.py`, `schemas/auth.py`, `schemas/user.py`, `services/user_service.py`, `routers/auth.py`, `app/main.py`, `frontend/src/api/{auth,users}.ts`, `frontend/src/lib/browserSession.ts`, `frontend/src/utils/profileCache.ts` и их существующие тесты.

**Interfaces:** таблица `legal_acceptances`: UUID id/user_id, document_id, revision, text_sha256, accepted_at UTC; unique `(user_id, document_id, revision)`. `get_legal_status(session: AsyncSession, user_id: UUID) -> LegalStatus`; `accept_documents(session: AsyncSession, user_id: UUID, body: LegalAcceptRequest) -> LegalStatus`. Запрос: `documents: [{document_id, revision, text_sha256, accepted: true}]`, ровно три разных текущих документа; чужой user_id/лишние поля отвергаются. `GET /legal/status`, `POST /legal/accept` требуют `get_current_user`, возвращают `LegalStatus`; устаревшая редакция — 409, невалидный набор — 422. `legal_status: LegalStatus | None` добавляется в auth/profile, отсутствие означает неподтверждённое состояние. Frontend: `fetchLegalStatus(): Promise<LegalStatus>`, `acceptLegalDocuments(body: LegalAcceptRequest): Promise<LegalStatus>`.

- [ ] RED: `test_existing_user_starts_unaccepted`, `test_all_three_receipts_are_independent`, `test_repeat_and_concurrent_accept_are_idempotent`, `test_stale_hash_false_duplicate_or_missing_documents_rejected`, `test_cannot_accept_for_another_user`, `test_auth_and_profile_return_same_legal_status`. Убедиться, что первоначальное принятие не меняет diary/goals/outbox.
- [ ] Проверить targeted pytest RED. Для файловых fixtures использовать отдельный `--basetemp`, поскольку общая Windows temp-папка имеет проблемы доступа.
- [ ] Реализовать модель/миграцию и транзакционную вставку PostgreSQL `ON CONFLICT DO NOTHING`; конфликт той же revision с другим hash не объявлять принятым. Не обновлять доказательства повторным запросом. Все auth-пути, включая локальный QA и email link, возвращают согласованный статус.
- [ ] Сохранить статус в существующем профильном кэше; валидировать owner и весь контракт через Zod. `authUserFromProfile` переносит поле; старый кэш остаётся читаемым, но не подтверждённым. В account merge не переносить согласие другого account ID автоматически: целевой аккаунт сохраняет свои записи, при их отсутствии подтверждает заново.
- [ ] GREEN: legal/auth/profile/account-merge тесты, frontend API/cache unit tests; migration runner на disposable PostgreSQL дважды. Commit только файлов задачи.

### Task 3: Общий интерфейс документов и окна подтверждения

**Files:** создать `frontend/src/features/legal/components/LegalConsentGate.tsx`, `LegalDocumentReader.tsx`, `LegalLinks.tsx`, `frontend/src/features/legal/hooks/useLegalConsent.ts`, `frontend/src/features/legal/legalState.ts`, `legalState.test.ts`, `frontend/src/features/legal/pages/LegalDocumentPage.tsx`, `frontend/e2e/legal-consent.spec.ts`; изменить `App.tsx`, `components/layout/Shell.tsx`, `features/profile/pages/ProfileHubPage.tsx`. Использовать существующий `hooks/useModalAccessibility.ts`, auth `logout()` и existing profile cache/store.

**Interfaces:** `needsLegalAcceptance(user: AuthUser): boolean` сверяет owner и все три revision/hash из задачи 1. `useLegalConsent(user: AuthUser)` возвращает `status`, `checks`, `setCheck`, `submit`, `pending`, `error`, `decline`. `LegalConsentGate` принимает текущего `AuthUser` и публикует новый профиль через существующий store/cache только при совпадающем owner. Публичные маршруты `/legal/privacy`, `/legal/consent`, `/legal/offer` находятся вне Shell. Reader — отдельный компонент с семантическими заголовками/абзацами, без `dangerouslySetInnerHTML`.

- [ ] RED unit: старый кэш/чужой owner/старые SHA требуют окна; три актуальных receipt разрешают вход. RED browser: существующий и новый аккаунт видят три unchecked отметки; одна/две не включают кнопку; ссылки открывают тексты; отказ/закрытие не создают принятия.
- [ ] Запустить unit и `npm run test:e2e -- --grep 'legal'`; проверить ожидаемое падение на отсутствующем UI.
- [ ] Реализовать gate после auth до Outlet/onboarding; до входа и в Профиле показать постоянные ссылки. Выход/Escape/Telegram BackButton оставляют доступ к публичным документам, не очищают diary/outbox. Сетевой сбой сохраняет отметки и показывает повтор; неподтверждённый офлайн-пользователь получает понятное объяснение необходимости подключения.
- [ ] Добавить E2E: повтор login/reload без окна; подтверждение на другом устройстве обновляет профиль и закрывает окно; смена owner пока POST pending игнорирует старый ответ; accepted offline работает; старый cached profile ждёт сети; активная тренировка/черновик восстанавливаются после окна. Проверить 320/393/1440, светлую/тёмную тему, focus trap/restore, Escape/BackButton и 44px targets.
- [ ] GREEN: legal unit/E2E, auth/reconnect/workout-recovery regression, lint/TS/build/bundle; commit собственных файлов. При auth E2E fixtures явно задавать принятый профиль только в неюридических сценариях, не отключать gate в production.

### Task 4: Автоматическая публикация подписанного APK и `/app`

**Files web:** подготовленные семь файлов команды `/app`; изменить `docker-compose.yml`, `frontend/nginx.conf`, `docs/TIMEWEB_DOMAIN_CUTOVER.md`, `docs/USER_GUIDE.md`; тест `backend/tests/test_timeweb_deployment.py` для отдельного каталога/404 вместо SPA. **Files Android:** создать `scripts/publish-android-apk.mjs`, `scripts/inspect-android-apk.ps1`, `scripts/publish-android.ps1`, `tests/apkPublication.test.mjs`; изменить `package.json`, `AGENTS.md`, документы BUILD/HANDOFF/CHANGELOG и уже подготовленный `.gitignore`.

**Interfaces:** `npm run android:publish` выполняет production build → проверку APK → локальный архив/latest → upload → атомарное переключение серверного current. Параметры SSH передаются через process env `FITNESS_APK_SSH_TARGET`/`FITNESS_APK_SSH_KEY`, без ключей в Git; штатный адрес из VPS_ADMIN_GUIDE, host key verification не отключать. Host каталог `/opt/fitness/apk-releases` монтируется read-only в `/usr/share/nginx/html/android`; `latest.apk` и `latest.json` следуют одному атомарному server current. Файл доступен по `https://app.filfitclub.ru/android/latest.apk`.

- [ ] RED: отвергаются неверные package/API/certificate, CI placeholder, повреждённый файл, downgrade/reuse version для другого APK. Обрыв до активации сохраняет прежний current; повтор идентичной публикации идемпотентен.
- [ ] Реализовать publisher с SHA-256, размером, versionCode/versionName, source/shared commits и прежним certificate SHA-256 `8a313fef52cf7e7b7f692760790b9d0f2b8af76ae9a0bdd69bc56f38d9a69472`. Проверять реальный `assets/capacitor.config.json` и JS production origin, а не запрещать безопасную fallback-константу в DEX. Архивировать файл вне Git в `apk-releases`; сервер проверяет переданный digest перед atomic current switch. Signing key не загружать на VPS.
- [ ] Nginx отдаёт APK как `application/vnd.android.package-archive` с скачиванием, no-store для latest и 404 для отсутствующего APK. Каталог APK живёт независимо от frontend release cleanup. Проверить HTTP Range/Content-Length/digest на настоящем сервере после этапа выпуска.
- [ ] GREEN: `node --test tests/apkPublication.test.mjs`, Telegram tests (90 baseline), Ruff/diff check, Compose/Nginx config validation. Зафиксировать разрешённую владельцем публикацию APK как узкое исключение прежнему правилу AGENTS; CI test APK с временным ключом по-прежнему не публикуется. Commit.

### Task 5: Общая проверка и Android-сборка с окном согласия

**Files:** Android `shared-version.json`, gitlink `shared/fitness_prog`, `android/app/build.gradle`, `tests/` native session/profile fixtures, `e2e/legal-consent.spec.ts`, актуальные HANDOFF/DECISIONS/PARITY.

- [ ] Независимый обзор готового diff: ownership/receipt/version, cache races, preserved outbox, документы, publisher. Исправлять только найденные проблемы в рамках задачи.
- [ ] Полный backend pytest в отдельном basetemp, Ruff; общий frontend unit/lint/TS/build; legal+auth+offline+workout E2E и bundle checks. Disposable PostgreSQL migration/restore: повторный runner и отсутствие изменений старого дневника.
- [ ] После проверенного upstream commit обновить Android pin штатным процессом без редактирования shared. Поднять `versionCode` с 3 до 4 и `versionName` до `0.4.0-dev`; прежний owner signing key.
- [ ] Android: shared guards, unit/lint/shared tests/browser shell; отдельная Android CI с одноразовым emulator/key. Проверить profile-only update не меняет SessionVault generation, старый профиль не подтверждает документы, pending sync сохраняется при gate и logout/account switch.
- [ ] Собрать installable APK с production API и owner key; проверить подпись/manifest/JS/размер/hash. Проверка на выделенном устройстве/эмуляторе, без вмешательства в пользовательский BlueStacks. Не объявлять непроверенную работу камеры/физического телефона завершённой.
- [ ] Commit/push собственных веток; создаваемые PR прикрепить к чату. Сохранить результаты и остающиеся реальные ограничения.

### Task 6: Выпуск web/backend и нового APK

**Files/operations:** штатный `docs/TIMEWEB_DOMAIN_CUTOVER.md`, release reports в ignored artifacts; никакой правки secrets или пользовательской БД вручную.

- [ ] Проверить production branch/remote head: интегрировать только проверенную задачу в `timeweb-production-20260825`, не включать unrelated dirty основной копии. Push, дождаться обязательных CI.
- [ ] На VPS `/opt/fitness/source`: backup штатным `scripts/backup_vps.sh`, проверить dump; подготовить `/opt/fitness/apk-releases`; `git pull --ff-only`, rebuild api/worker/telegram-poller/web, apply migration штатным runner, `docker compose up -d` и status snapshot.
- [ ] Проверить Compose, `https://api.filfitclub.ru/health`, сайт, публичные три документа, статус подтверждения нового/существующего тестового аккаунта и repeat login. Активные пользовательские записи не использовать как QA fixtures.
- [ ] Выполнить publisher задачи 4 для APK задачи 5. Скачать живой APK, сверить digest и подпись; проверить latest.json, Range, headers/404 и `/app` в личном чате администратора. Бот после перезапуска регистрирует новую команду.
- [ ] При проблеме остановить продвижение; оставить прежний APK current или штатно откатить web image/commit. Не отправлять сообщение о недоступном выпуске.

### Task 7: Порученная владельцем рассылка

**Interfaces:** существующие `admin_broadcasts.create_draft/test_delivery/launch/enqueue_campaign`, audience `{kind:'all_telegram'}`; один постоянный campaign/idempotency_key. Никакого отдельного массового цикла sendMessage.

- [ ] Только после live-проверок задачи 6 создать черновик в штатном центре рассылок, сверить обезличенное количество адресатов. Текст: появилось Android-приложение для добровольного тестирования; `/app` для скачивания; общий аккаунт веба/Android; три документа и однократное подтверждение; ошибки через Поддержку. Не просить удалить старую установку.
- [ ] Проверить сообщение тестовой доставкой администратору, затем выполнить ранее прямо порученную рассылку всем доступным Telegram-пользователям с штатным подтверждением/аудитом.
- [ ] Дождаться worker/campaign результата; сообщить фактические sent/skipped/failed. Повторять только retryable failed штатным способом; не дублировать уже доставленные сообщения. Блокировки бота учитывать как skipped.
- [ ] Обновить USER/ADMIN/VPS/Android handoff и короткий release report: ссылка на APK, фактические проверки, campaign ID/обезличенные счётчики. Специальное согласие на здоровье остаётся отдельным этапом.

## Execution handoff

Рекомендуется **Native**: я выполняю задачи в этом чате, затем отдельный reviewer проверяет целый diff перед выпуском. Контракты backend/profile/UI тесно связаны; это сокращает повторное изучение контекста. Альтернатива — **Subagent-driven**: отдельные implementer/reviewer для каждого этапа с большей затратой контекста. До выбора и проверки владельцем задачи механизма согласия не начинать.
