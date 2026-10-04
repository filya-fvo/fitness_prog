# Проверка пользовательских сценариев — 2026-10-02

Проверен рабочий checkout `timeweb-production-20260825`, исходный commit
`497e92ff3c67bfd0629ac575928dd183378bf932`, с сохранением существовавших до аудита
локальных правок. Аудит не изменял production-код, рабочую базу, реальные
пользовательские профили, сообщения и рассылки. Результаты относятся к этому
состоянию исходников, а не к произвольному последующему релизу.

## Фактический результат

| Проверка | Результат | Доказательство |
|---|---|---|
| Полный pytest | **600 passed**, 0 failed/skip; 20.45 s | `artifacts/full-audit-20261002-tests/backend-pytest.log`, `backend-junit.xml` |
| Полный Vitest | **631 passed**, 102 файлов, 0 failed/skip; 10.22 s | `frontend-vitest.log`, `frontend-vitest.json` |
| Ruff backend | **passed**, exit 0 | `backend-ruff.log` |
| ESLint frontend | **passed**, exit 0 | `frontend-eslint.log` |
| TypeScript + Vite/PWA build | **passed**, exit 0 | `frontend-build.log` |
| Bundle budget | **passed**, exit 0; product JS gzip 495425 / 497000 B, largest chunk 108742 / 140000 B | `frontend-bundle.log` |
| Полный существующий Playwright | **173 passed, 20 failed, 8 skipped**, 201 случаев, 4 browser projects; 202.60 s | `playwright.log`, `e2e.json` |
| Отдельный Windows visual QA | **13 passed, 0 failed/skip**, Chromium workers 1, `PLAYWRIGHT_VISUAL_QA=1`; 18.7 s | `visual-windows.log`, `visual-windows.json` |
| Повтор checklist, только функциональные assertions | **4 passed**, Chromium, `--ignore-snapshots`; 7.0 s | `checklist-functional.log`, `checklist-functional.json` |
| Реальная временная PostgreSQL/Redis, API-матрица | **368 passed, 0 failed**, 9 настоящих записей пользователей | `api-matrix.json`, `vps-api-matrix-second.log` |
| Все SQL-миграции на пустой PostgreSQL 18 + pgvector | **MIGRATIONS_OK**, runner завершён успешно | `vps-api-matrix-second.log` |
| npm dependency audit | **2 high advisories**, axios и brace-expansion; exit 1 | `npm-audit-online.json`, `npm-audit-summary.json` |
| pip dependency audit | **performed, exit 1**: local 22 raw → 19 unique advisories / 5 packages; production 2 raw → 1 unique / ecdsa | `pip-audit-local.json`, `pip-audit-production.json`; [applicability triage](2026-10-02-dependencies.md) |

Файлы доказательств находятся в `artifacts/full-audit-20261002-tests/`.
Восемь Playwright skip — явно пропущенные desktop-width 1440 cases в мобильных
projects `android-chrome` и `iphone-webkit`; это не ошибки приложения.

## Настоящие синтетические пользователи

Созданы через `/auth/telegram` с локально подписанным синтетическим `initData`
и dummy BOT_TOKEN. Обращений к Telegram при авторизации не было. После проверки
запрета истории для FREE каждому пользователю выдано entitlement `source=qa`
только внутри временной базы, затем выполнены операции как PLUS.

| Профиль | UUID в временной базе | Выбранная программа |
|---|---|---|
| male / gym / beginner | `6600c3da-2479-417d-81b7-f82977f574f7` | М · Зал · Новичок · Тренажёры · Всё тело |
| male / home / intermediate | `96a50693-ac23-49a2-a377-e98674203624` | М · Дом · Опытный · Гантели |
| male / outdoor / advanced | `8144d70d-3e07-496a-a163-cb34bcc3d415` | М · Улица · Продвинутый · Сила и контроль |
| female / gym / beginner | `d97bb7b3-470b-4f8e-99b6-8f288d853549` | Ж · Зал · Новичок · Ягодицы + верх |
| female / home / intermediate | `4ab5a4f0-cabb-4dfe-8e5f-4a9bbd343532` | Ж · Дом · Опытный · Резинки + вес тела |
| female / outdoor / advanced | `9e85e18b-a6c8-4fb5-8e21-c5e3feeaa78d` | Ж · Улица · Продвинутый · Сила и контроль |
| unspecified / gym / beginner | `0567a6ea-8eec-479d-8f5e-ee39a7757984` | М · Зал · Новичок · Тренажёры · Всё тело |
| unspecified / home / intermediate | `0e8ee675-8f8e-4e0c-afde-7f6527b490a9` | М · Дом · Опытный · Гантели |
| unspecified / outdoor / advanced | `23efeadc-521b-409a-9614-9c0f29bcb1dd` | М · Улица · Продвинутый · Сила и контроль |

Для unspecified программа выбрана явно; это проверка сохранения и выполнения
программы без изменения пола профиля, не тест автоматической рекомендации.
Цели lose_fat/gain_muscle/maintain чередовались между тремя контекстами.
Женские профили включали cycle_training и запускались с `cycle_readiness=reduce`.

База `fitness_audit`, пользователь БД `audit`, контейнеры и сеть
`fitness-audit-20261002-*` были созданы отдельно от Compose production.
PostgreSQL и Redis хранили данные в tmpfs; Docker-сеть создана с `--internal`,
порты на хост не публиковались, worker/poller не запускались. Код текущего
checkout и миграции переданы отдельным snapshot без `.env`, ключей и runtime
данных, подключены read-only. Контейнер API использовал существующий образ
`fitness-api` (id `sha256:7953ee6466c684ab915110744d35efe8d09d7988d37de83918ecf2c146f52d40`)
как runtime зависимостей с read-only текущим исходным кодом.

SMTP/Sentry и admin recipients отключены; LLM/OCR направлены на недоступный
loopback. JWT, initData, invite token/code в отчёт не записывались. API вызывался
через `httpx.ASGITransport` с настоящими FastAPI dependencies, SQLAlchemy,
PostgreSQL и Redis; HTTP reverse proxy/Caddy этим прогоном не проверялся.

После завершения все audit-контейнеры, сеть и `/tmp/fitness-audit-20261002`
удалены. UUID выше — доказательство созданных записей, действующих тестовых
аккаунтов в production не осталось. Cleanup подтверждён
`vps-cleanup-verification.log`.

## Матрица действий и границы проверки

| Область | Выполненные проверки | Границы |
|---|---|---|
| Пол, цели, рекомендации, onboarding | На real DB сохранение/чтение пола и выбранной программы у 9 профилей; Vitest persona matrix: male/female × gym/home/outdoor × 3 levels × 3 goals, ограничения и все 31 непустое сочетание оборудования; Playwright explicit unspecified и предупреждения оборудования | Не полный декартов набор пола × каждой программы × каждого действия |
| Тренировки и расписание | Real DB catalog, recurring schedule, overview, старт seed-программы, completed set, complete/history, custom create/delete, offline replay с проверкой одинакового workout id; existing unit/E2E переносы, отмены, подготовленные замены, load hints, timer/auto-advance/recovery | Тест повторной API-операции не имитирует реальную потерю мобильной сети |
| Цикл и восстановление | Female reduced startup на real DB; unit phase/cursor checks; E2E readiness/rest и игнорирование legacy cycle для male | Медицинские рекомендации и физическая готовность пользователя не валидировались |
| Питание | Real DB manual food → log → daily → edit grams → delete у 9 профилей; unit/E2E barcode, multipart label review, ручной ввод и corrections | Реальный Open Food Facts, camera и OCR не вызывались |
| Замеры и дневной чек-ин | Real DB sleep/steps/activity, dated weight/waist save/read/range/delete; FREE history denied; existing E2E offline/reconnect и analytics periods | Реальные HealthKit/Health Connect отсутствуют и не проверялись |
| Социальные функции и privacy | Real DB invites create/preview/accept/repeat/block, friends/competitions, global join/leave; чужая workout/support запись возвращает 404; unit baseline/scoring/threshold/privacy | Не все соцдействия выполнены каждой парой из 9 пользователей; privacy тела результатов подробно проверяется существующими unit tests |
| Уведомления | Real DB read/settings save с выключенным workout reminder; unit channel/quiet hours/concurrency, E2E preferences | Реальная Telegram/Web Push/email доставка намеренно не выполнялась |
| Поддержка | Real DB create/read/reply/close у 9 профилей и foreign-user 404; unit/E2E idempotency/retry/closed ticket | Внешние сообщения и реальные attachments/camera не использовались |
| Админ-права | У всех 9 обычных пользователей admin/users и admin_view программ запрещены 403; полный unit/E2E suite проверяет admin audit/system/user/catalog/program/broadcast drafts | Реальная рассылка и изменение production-пользователей не выполнялись |
| Browser/PWA/Telegram layout | Chromium, Android Chrome, iPhone WebKit existing suite; a11y, root routes, themes, 320/375/393/1440 widths, simulated back gestures/stale release/offline | Firefox runtime blocked; реальные устройства и push/install/update необходимы отдельно |

В real DB runner основная масса проверок сверяет HTTP status; дополнительно
семантически сверяются persisted sex/program и идентичность workout id после
offline replay. Детальные расчёты, приватность payload и границы схем проверены
существующими unit/E2E assertions. 368 проверок не следует представлять как
368 независимых end-to-end пользовательских путей.

## Ошибки и диагностика

1. **Два visual baseline failure**: `activation-checklist.spec.ts:80` и `:103`.
   Фактическая карточка indigo и актуальная навигация Главная/Упражнения/Дневник/
   Помощь/Профиль расходятся со старым эталоном с зелёной навигацией
   Главная/Тренировки/Питание/Прогресс/Ещё. Изображения actual/expected/diff
   сохранены в `playwright-results/activation-checklist-*`. У первого сравнения
   разница 8075 pixels (5%), выше порога 3%. Отдельный запуск всех четырёх
   checklist cases с `--ignore-snapshots` passed, включая действия после места
   проваленного screenshot. Эталоны и код не обновлялись.
2. **18 Firefox runtime failure / blocked application checks**:
   `browserContext.newPage: Cannot read properties of undefined (reading '_page')`.
   Сбой воспроизведён на двух browser-session tests с `--workers=1` и в отдельном
   минимальном `firefox.launch → newContext → newPage`, без приложения и URL API.
   Это evidence сбоя создания страницы, а не evidence ошибки 18 пользовательских
   сценариев. Причина несовместимости внутри установленного browser runtime
   далее не исправлялась; текущая Firefox матрица остаётся непроверенной.
3. **Первый запуск временного API контейнера** не импортировал приложение:
   read-only `/logs`, потому что в audit runner отсутствовал `LOG_DIR`.
   Миграции при этом прошли; audit cleanup выполнен. Исправлена только настройка
   runner `LOG_DIR=/app/logs`, повтор выполнен на новой пустой базе и прошёл.
4. **Dependency audit**: npm registry сообщает high для installed runtime
   `axios@1.18.1` и dev-only `brace-expansion@1.1.18/2.1.4/5.0.9`.
   Applicability к конкретным runtime paths требует отдельного security triage;
   наличие advisory не доказывает эксплуатацию в приложении. `npm audit fix`
   не запускался. Первый запрос из sandbox не достиг registry; сохранён отдельно
   `npm-audit.json`, успешный network retry — `npm-audit-online.json`.
   Python audit выполнен отдельным временным `pip-audit 2.10.1` по точным спискам
   установленных пакетов local/production с `--no-deps --disable-pip`, без изменения
   зависимостей приложения. Local: 19 уникальных advisories; production: 1.
   Статический triage: local 15 `not_actionable` в рассмотренных путях и 4
   `needs_review`, production ecdsa — `not_actionable` в текущих путях подписи.
   Эксплуатация не доказана. Два local urllib3 streaming advisories имеют возможный
   путь через пользовательский Web Push endpoint при включённом VAPID; production
   urllib3 уже исправлен. Версии, fixes, первичные источники и ограничения —
   [dependency report](2026-10-02-dependencies.md). Audit env/cache удалены root
   после сохранения JSON/logs/lists; приложение не обновлялось.

## Повторение

Локальный pytest запущен через audit-only `run_backend.py`, отключающий чтение
реального backend `.env` и использующий dummy credentials / недоступные DB+Redis.
Vitest: `npm test -- --reporter=default --reporter=json`.
Playwright: `node scripts/run-e2e.mjs --output=<audit directory> --reporter=list,json`.
Исходный `frontend/test-results` не перезаписывался. Verification build писал
только в `.dist-check`; рабочий `frontend/dist` не публиковался.

Real DB runner: `run_ephemeral_vps.sh` + `run_api_matrix.py` и readonly snapshot
в `ephemeral-audit.tar.gz`. Использует только явные audit имена, отказывается
переиспользовать существующий контейнер/сеть, проверяет пустую базу и точный
hostname/database до тестовых записей. Для повторения нужен Docker host с
имеющимися образами `fitness-api`, `pgvector/pgvector:0.8.6-pg18-bookworm` и
`redis:7.4-alpine`. Production Compose команды этим runner не запускаются.

Реальный Telegram initData/OIDC, email OTP, камера, установка/обновление PWA,
доставка push и жест выхода на настоящем устройстве остаются **blocked/manual
device QA**. Полнота «все пользовательские действия во всех средах» этим аудитом
не доказана; выше перечислены точные выполненные случаи и ограничения.

## Дополнительный Windows visual QA и корпус изображений

После основного прогона отдельно выполнен существующий
`visual-regression.spec.ts` на Windows: `PLAYWRIGHT_VISUAL_QA=1`, Chromium,
`--workers=1`, `VITE_API_URL=/`, output в `visual-windows-results`.
**13 passed, 0 failed, 0 skipped; 18.7 s**. Это отдельный дополнительный прогон;
результат основного набора 201 случаев выше не пересчитан.

Проверка использовала документированный `scripts/run-e2e.mjs` и dev Vite server
с fallback API. Рабочий `frontend/dist`, уже удалённый `.dist-check` и визуальные
эталоны не изменялись; `--update-snapshots` не использовался. Существующий
`frontend/test-results/.last-run.json` сохранил SHA256
`91d1c43004802cd49950d78eb11c8fa7d05da8ffffe219a8b13b2f561bc00903`
до и после этого дополнительного запуска.

Спецификация содержит 19 screenshot expectations: шесть light страниц
360×800 (`/`, `/more`, `/faq`, `/help`, `/knowledge`, `/nutrition`), desktop
`/train` 1440×900, шесть root изображений для 320/393/1440 light/dark и шесть
дочерних route изображений 393 light. Дополнительно семь маршрутов
`/`, `/train`, `/workouts`, `/programs`, `/progress`, `/help-center`, `/profile`
проходятся для каждой пары ширины 320/393/1440 и темы light/dark — 42 проверки
горизонтального overflow; весь spec выполняет 49 посещений маршрутов.
Это визуальная проверка shell и доступных route states, а не изображение каждой
открытой формы заполненного аккаунта.

Заполненные PLUS fixtures основного, уже выполненного прогона дополняют эту
матрицу: `content-design.spec.ts` проверяет Помощь, FAQ, обычный и расширенный
Дневник, форму замеров с десятичным вводом и форму ИИ-тренера на
320/375/393/1440 light/dark. Проверяются отсутствие overflow, font-size ≥16,
центрирование calendar SVG/44px touch target, непрозрачные day/missing markers,
composer выше mobile navigation, отправка сообщения и ответ fixture.
`faq-design.spec.ts` проверяет 31 иллюстрацию/карточку, равную ширину фильтров,
загрузку SVG scenes, отсутствие overlap/overflow, search и keyboard expand;
393px Chromium light/dark дополнительно выполняет axe serious/critical checks.

Важное ограничение сохранности результатов: эти две существующие спецификации
содержат **hardcoded** screenshot paths и в основном прогоне записали изображения
в уже существовавшие untracked каталоги `artifacts/design-review-2026-10-02/`
и `artifacts/faq-design-2026-10-02/`, несмотря на отдельный Playwright `--output`.
По времени записи внутри интервала основного прогона идентифицированы **120 PNG**
первого каталога и **62 PNG** второго. Эти generated QA outputs могли заменить
предыдущие файлы с теми же именами; утверждение об их неизменности не делается.
До прогона был сохранён git status, но не hashes/копии этих untracked PNG,
поэтому различить созданный и перезаписанный файл или восстановить старую
версию по этому аудиту нельзя. Исходный код и media source этим побочным
действием тестов не редактировались.

Для дальнейшего просмотра текущие **182 PNG** сначала были скопированы в отдельный
корпус. При завершении 03.10.2026 SHA256 и размеры всех 182 оригиналов и копий
повторно сверены с manifest; все совпали. После этого удалены только новые
избыточные копии (82 705 695 байт), оригиналы в design-review/faq-design сохранены.
Точный список действующих исходных путей, бывших путей копий, размеры, время
записи и SHA256 каждого файла находятся в `screenshot-corpus-manifest.json`;
доказательство сверки/удаления — `new-output-cleanup.json` и
`cleanup_new_audit_outputs.ps1`. Корпус относится к прошедшим populated
fixtures основного прогона; он не доказывает автоматическую визуальную проверку
всех user/admin модалок во всех темах. Существующие diary/personal-program/
workout-recovery tests добавляют snapshot coverage редактора личной программы,
диалога подхода/веса, карточки упражнения и progress dialog, а nutrition-label
проверяет формы сканера/фото/review/manual/edit на мобильной ширине.
