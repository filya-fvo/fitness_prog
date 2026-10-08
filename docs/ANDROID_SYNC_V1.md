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