# Синхронизация дневника Android — v1

Android хранит дневник и очередь в SQLite. Сервер хранит тот же аккаунт и дневник
в PostgreSQL; общего файла базы и прямого подключения телефона к PostgreSQL нет.
Вход по уже привязанной почте выдаёт существующий user UUID, новый аккаунт не создаётся.

POST `/android-sync/v1/push`: `id` UUID операции, `owner` UUID пользователя,
`kind` workout/product/nutrition_log/measurement, `entityId`, `action`, `body`,
`baseRevision` decimal string|null, `createdAt` nonnegative integer. Ответ:
`operationId`, `entity` {key,owner,kind,id,revision,deleted,unavailable,data}, `response`.
GET `/android-sync/v1/pull?cursor=0&limit=100`: version1, scope, changes, cursor, hasMore.
Курсор привязан к аккаунту; limit1..100. Авторизация — существующий JWT dependency.

Доменная запись, receipt, revision и feed фиксируются одной внешней SERIALIZABLE
транзакцией с per-owner advisory lock. Commit существующего domain service остаётся
savepoint. Потерянное подтверждение повторяет receipt, а не запись. Изменение payload
при прежнем operation UUID отклоняется409. Stale baseRevision →409 sync_conflict с
доступной текущей сущностью; APK сохраняет локальную запись для явного выбора версии.

Refresh обнаруживает обычные web/Telegram изменения и soft-delete. Pull отдаёт
только последний агрегат; устаревшие версии не воскрешают завершённую тренировку.
История доступна по действующим правам PLUS; проверки действуют также перед
conflict/receipt. Недоступный агрегат передаётся без данных с unavailable=true;
изменение scope вызывает клиентский replay, восстановление PLUS возвращает историю.

Миграция `20261008000053_android_sync.sql` только добавляет четыре служебные таблицы.
Существующие users/workouts/nutrition_logs/body_measurements не переименовываются и
не очищаются. Код: routers/android_sync.py, schemas/android_sync.py,
services/android_sync/, models/android_sync.py. Main включает API до SPA fallback.
Клиент и строгие boundary tests находятся в отдельном filya-fvo/fitness-android;
публичные web/Telegram API совместимы. ИИ/OCR остаются на VPS.

## Проверки и выпуск

Регрессия: 841 backend tests PASS, Ruff PASS, static migrations53 PASS.
`backend/scripts/check_android_sync_postgres.py` использует только отдельные
127.0.0.1:55439 / fitness_android_sync_test / fitness_android_test. Реальные SQL/HTTP
тесты проверяют repeat/lost receipt, web pull, ownership, conflict, savepoint rollback,
sets/complete/delete, products/logs/measurements, PLUS revoke/restore и pagination.
В CI есть отдельный PostgreSQL18 service. Личные токены и дневник не выводятся.

Владелец явно разрешил production-выпуск 08.10.2026 после сообщения APK об отсутствии
протокола. До публикации: независимый обзор, commit/push FF, backup,
restore rehearsal + migration дважды в изолированном контейнере, build API,
production migration и API restart, health/web/worker/poller, native APK sync.
Фактические результаты выпуска фиксируются после выполнения, не заранее.

Первый refresh ограничен50000 строк на тип и пока читает дневник целиком. Read-only
оценка VPS перед выпуском: максимумы на аккаунт18тренировок,363записи питания,
9замеров. Incremental optimization рассматривается при измеренной необходимости;
лимит не означает доказанную нагрузочную ёмкость50000строк. Фото/фон/распространение
остаются отдельными этапами. Rollback к прежнему API сохраняет добавочные таблицы и
локальную SQLite-очередь, но снова отключает синхронизацию; обратную destructive migration не выполнять.
## Фактический результат выпуска08.10.2026
Runtime code80b3ac60d91eb1d983d0fd2ecf10ef5481cfa416.
Полный [CI37730949531](https://github.com/filya-fvo/fitness_prog/actions/runs/37730949531) SUCCESS:
backend, isolated PostgreSQL sync, frontend unit/build, browser QA, visual QA, Docker API.
Backup `/opt/fitness/backups/fitness-20261008T050932Z.dump`,
SHA25646bcbde9daa3be74afab183a532875e36f670888ac7b86f7def7f428152df037.
RESTORE_VERIFY_OK в отдельном network-none контейнере, миграции дважды и audit trigger PASS.
FF pull/build API+worker+poller, миграция53 MIGRATIONS_OK; API healthy, web200,
защищённый sync401 безJWT. Web/Caddy/LLM/OCR/DB/Redis не пересоздавались.

Live randomQA через работающий API проверил все diary push kinds/sets/complete,
ordinary web edits→pull, receipt repeat/lost response, stale409/foreign owner403/tombstones.
QA_CLEANUP_OK адресно удалил только созданные тестом owner rows и уникальный продукт.
Личные записи не менялись. Native installed APK finalSHA6bd50a78194dc873d86e69d68d443f98cca297cc7a36fa0061061efff7f3d317
с прежним owner:471canonical server records точно совпали со SQLite; cursor471,
pending0/conflicts0, missing-server banner absent. Restart/offline protected session PASS.
Владелец подтвердил на телефоне: «Баннер исчез, дневник появился»; модель в этом ответе не указана.

Однократный503 при первой проверке не скрыт: точная причина не была повторно
воспроизведена; последующий native pull200/полныйSQLite match и liveQA прошли.
Дневник не очищался, existing backoff/manual retry сохранил очередь.
Evidence в изолированном worktree artifacts/android-sync-release/ и
C:/fitness-android/artifacts/vps-sync-release/. Передача: C:/fitness-android/docs/android/HANDOFF.md.
Фото/фон/распространение следующим чатом; новые production изменения требуют нового поручения.
