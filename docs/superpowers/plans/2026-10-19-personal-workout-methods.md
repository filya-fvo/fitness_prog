# Личные тренировки и методы выполнения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Исполнение последовательное; подготовка плана не означает запуск реализации.

**Goal:** Добавлять упражнения и сложные методы в личный вариант текущей программы, с правильным таймером и сохранением результатов, сначала web, затем Android.

**Architecture:** Персональные изменения поверх закреплённой программы, отдельные правки на дату и снимок начатой тренировки. Один движок последовательности и времени для общего React; структурированные части подхода и серверный расчёт нагрузки. Android переиспользует проверенный shared-код с собственным durable storage.

**Tech Stack:** FastAPI/Pydantic 2, async SQLAlchemy/PostgreSQL, React/TypeScript/Zod, Zustand/Dexie, Vitest/Playwright; Android Capacitor/SQLite/JVM/instrumentation.

**Spec:** [Описание поведения и таймера](../specs/2026-10-19-personal-workout-methods-design.md).

## Общие ограничения

- Сначала полностью web, затем Android; каждый этап: тест → реализация → проверка. Если ошибок нет — отдельный коммит. Если найдена ошибка — исправление → повторная проверка до успешного результата → отдельный коммит.
- Исправления и повторные проверки нужны только при найденных ошибках или новых изменениях; успешную проверку без причины не повторять.
- Не начинать следующий этап с красными проверками или незакоммиченным результатом предыдущего.
- Не менять общий каталог/seed ради персональных изменений. Не сбрасывать календарь, фазы, данные или историю.
- Миграции append-only; legacy payload совместим с обычными тренировками.
- 1–20 упражнений/подходов/раундов; части 2–8; паузы 0–600 с. Старые данные не обрезать.
- Все новые тексты русские; 44×44 px, inputs от 16 px, доступные модальные окна.
- Самостоятельные блоки вынести из `ActiveWorkout.tsx`, `workout_service.py`, `syncQueue.ts`; без общего рефакторинга.
- Без внешних AI API, native health, рассылок и seed/reset. Приватные дневники и секреты не попадают в отчёты.
- Статус этой поставки — документация. Команды ниже выполняются при реализации, а не при подготовке плана.

## Review Focus

1. Перестановка или замена упражнения не переносит записанные результаты на другое упражнение — W2.
2. Правки личного дня не замораживают лёгкую/среднюю/тяжёлую фазу и не стирают readiness — W1/W3.
3. Поздний ответ, двойной submit и replay не запускают отдых повторно — W5/W9.
4. Частично выполненный кластер сохраняет нагрузку без фиктивного рекорда — W4/W8.
5. Старый APK или stale snapshot не удаляет новые части/правки при синхронизации — W4/W9/A2.

## Карта файлов и новых границ

Пути ниже относительны корню соответствующего репозитория. Новые имена — проектируемые,
не утверждение о существовании. Перед каждым этапом сверить с актуальной основой.

| Ответственность | Существующие точки | Новые модули |
|---|---|---|
| Личные правки дня | `backend/app/services/planned_workout.py`, `models/workout_plan_override.py`, `routers/workouts.py` | `models/user_program_day_override.py`, `schemas/workout_customization.py`, `services/workout_customization.py` |
| Составные подходы | `models/workout.py`, `schemas/workout.py`, `api/workouts.ts`, `types/workout.ts` | `models/workout_set_part.py`, `schemas/workout_execution.py`, `services/workout_execution.py`, `frontend/src/api/workoutExecution.ts` |
| Последовательность/таймер | `utils/workoutSession.ts`, `store/workoutStore.ts`, `RestTimer.tsx`, `RestTimerHost.tsx` | `utils/workoutExecution.ts`, `utils/workoutRest.ts`, `features/workout/hooks/useWorkoutExecution.ts` |
| Подготовка | `PlannedWorkoutEditor.tsx`, `PlannedExercisePicker.tsx`, `ProgramWeekPreview.tsx` | `WorkoutDayComposer.tsx`, `WorkoutMethodEditor.tsx`, `WorkoutGroupEditor.tsx`, `WorkoutTimingPreview.tsx` рядом с существующими компонентами |
| Экран выполнения | `pages/ActiveWorkout.tsx`, `components/AddSetModal.tsx` | `components/CompoundSetEditor.tsx`, `components/WorkoutExecutionNavigator.tsx` |
| История/аналитика | `workout_metrics.py`, `progress_dashboard.py`, `exercise_progress.py`, `strength_trends.py`, `workout_load_hints.py`, `utils/workoutCompletion.ts`, `utils/workoutHistorySets.ts` | `services/workout_load_rows.py`, общий UI частей для истории |
| Offline | `db/syncQueue.ts`, `db/offlineWorkoutContext.ts`, `services/offline_workouts.py`, `services/android_sync/prepared_start.py` | `db/workoutCustomization.ts`, специализированные queue handlers при необходимости |
| Android | `src/native/diaryMutations.ts`, `offlineProgramStart.ts`, `journal.ts`, `syncEngine.ts`, `android/.../FitnessStorage.java` | узкий native adapter персональных правок и новые регрессионные тесты |

### W0. Установить актуальную основу и исходные проверки

Результат: изолированный checkout актуального web, краткий baseline и выбранный scope первого этапа.

- [x] Прочитать AGENTS обоих репозиториев и актуальный Android HANDOFF; сверить HEAD, status, worktrees, shared pin, origin production branch и сведения VPS read-only.
- [x] Учесть обнаруженное расхождение `85d5974`/`a2cb5cc`; взять основу с уже выпущенными offline/android_sync. Не начинать от старого checkout и не менять pinned submodule напрямую.
- [x] Выбрать чистую существующую worktree либо создать `codex/personal-workout-methods`; не включать чужие dirty-файлы.
- [x] Пройти текущие сценарии подготовки/замены/старта и применимые tests; сохранить реальные исходные провалы отдельно от новых ошибок.
- [x] Зафиксировать baseline и границы в документе работ, отдельный docs-коммит `docs: record workout customization implementation baseline`.

### W1. Серверный слой персональных изменений дня

**Files:** новые customization model/schema/service; `models/__init__.py`, `services/workout_service.py`, `services/planned_workout.py`, `routers/workouts.py`; новая timestamp SQL migration; `backend/tests/test_workout_customization.py`.

**Interfaces:** `WorkoutDayPatch` содержит `added_exercises`, `removed_exercise_ids`, `exercise_overrides`, `exercise_order`, `groups`; IDs внутри дня уникальны. `WorkoutCustomizationRequest` содержит `program_id`, `day_index`, `scope: occurrence|program_day`, дату для occurrence, `base_revision`, `patch`. Новый `/workouts/customizations` GET/PUT/DELETE возвращает patch/revision; запись использует optimistic revision. DELETE также требует revision. Существующий `/planned-plan` сохраняет поддержку legacy replacements.

- [x] Написать и запустить failing tests `test_personal_day_is_owner_scoped`, `test_occurrence_wins_without_changing_next_occurrence`, `test_stale_revision_preserves_both_changes`, `test_reset_does_not_delete_occurrence_or_history`.
- [x] Assertions: A добавляет пресс в день 1; B и дни 2–4 неизменны; версия/курсор программы не сброшены; запись с прежней revision даёт 409; повтор той же операции не создаёт вторую запись.
- [x] Реализовать слой deltas и единый resolver для preview/start/offline preparation. Существующие legacy replacements переводить в тот же resolver, не создавать конкурирующие состояния.
- [x] Проверить фазы и readiness: не переопределённые reps/rest остаются расчётными; добавленное упражнение получает параметры без замораживания фазы.
- [x] Проверить миграцию на пустой и существующей тестовой PostgreSQL, ownership/soft delete/unique constraints; `check_migrations.py` дополнить только если его контракт требует этого.
- [x] Запустить targeted backend tests, Ruff изменённых модулей; при ошибках исправить их и повторить затронутые проверки. При успехе перейти к коммиту.
- [x] Обновить описание API/CHANGELOG и закоммитить `feat: persist personal workout day customizations`.

### W2. Обычные упражнения: добавление, удаление и порядок без потери результатов

**Files:** `workout_service.py`, `PlannedWorkoutEditor.tsx`, `PlannedExercisePicker.tsx`, новый `WorkoutDayComposer.tsx`, `api/workouts.ts`, `types/workout.ts`; `test_planned_workout.py`, новый `frontend/e2e/workout-customization.spec.ts`.

**Interfaces:** composer принимает `WorkoutPlan`, `WorkoutDayPatch`, `onChange`; возвращает patch, не мутирует Program. `applyDayPatch(base, patch)` сохраняет идентичность по exercise_id и явной замене, не `order`.

- [x] Воспроизвести тестом опасность перестановки: A/B с уже записанными весами переставлены — exercise_id и факты остаются теми же.
- [x] Реализовать «Добавить упражнение», удалить/переставить/вернуть исходное, поиск по существующему каталогу; повторное упражнение запрещено понятным сообщением.
- [x] При старте создать обычные set slots для добавленных упражнений, без повторов при retry. Структурные изменения уже начатой тренировки не открывать новым UI.
- [x] Проверить добавление пресса, закрытие/открытие, старт, выполнение и историю. Старые planned replacement тесты остаются зелёными.
- [x] Проверить ошибки каталога/сохранения, focus/BackButton; обновить USER_GUIDE/CHANGELOG.
- [x] Проверки; только при ошибках — исправления и повторные проверки; после успеха — `feat: add exercises to prepared personal workouts`.

### W3. Постоянное применение личных правок и preview фаз

**Files:** composer, `PlannedWorkoutEditor.tsx`, `ProgramWeekPreview.tsx`, API customization, scheduler/assignment/reschedule только в точках получения плана; существующие `active-program-preparation.spec.ts`, `prepared-plan-stability.spec.ts`.

**Interfaces:** явный выбор scope; сохранение возвращает новую revision и effective preview. Персональный patch привязан к program_id/version/day_index, occurrence — дополнительно к дате.

- [x] Написать тест следующего повторения дня 1 и смены фазы; отдельный тест смены версии/возврата к программе и разового переноса даты.
- [x] Реализовать выбор scope и индикатор «Изменено для вас», просмотр/сброс личных изменений. Сброс occurrence и program_day — отдельные действия.
- [x] Инвалидировать prepared/cache/query после сохранения. При переключении программы показывать применимость правок; не переносить их молча на другую версию.
- [x] Пройти «Чередование акцентов» на четырёх днях с прессом только в выбранном дне; убедиться, что регулярность/следующий день/дата старта сохранены.
- [x] Targeted unit/E2E; только при ошибках — исправления и повторная проверка; после успеха — документация и `feat: apply personal changes to recurring program days`.

### W4. Хранение сложных подходов и защита старых клиентов

**Files:** новые execution schema/service/model; `models/workout.py`, `schemas/workout.py`, `services/workout_service.py`, `services/android_sync/dispatch.py`, frontend types/Zod; новая SQL migration; `test_workout_execution.py`, `test_workout_idempotency.py`.

**Interfaces:** план получает `execution_version: 2`, `groups` и `set_methods` у упражнения.
`set_methods` задаёт set_number, kind=drop|cluster, части с target_reps/target_weight и pause_after_sec.
Группа содержит id/kind/exercise_ids/rounds/transition_sec/round_rest_sec; group kind=superset|triset|circuit.
Результат родителя получает `execution_kind: standard|drop|cluster`, `execution_revision` и `parts`.
Часть: id(UUID), ordinal, reps, weight, duration_sec, status(pending|completed|skipped), rest_after_sec;
weight_mode наследуется от родителя. При сложном подходе legacy reps/weight родителя — null,
запрещено представлять его суммарными reps и фиктивным единым весом.

- [x] Failing tests на сохранение/чтение, частичные части, повтор operation UUID, устаревшую revision, возрастающий вес дропа, разный вес кластера и неверные ссылки групп.
- [x] Реализовать родитель + дочерние части в одной транзакции. Существующая уникальность подхода сохраняется, новые части upsert по стабильным ID; пропуск виден отдельно.
- [x] REST и native sync вызывают один service. Сложный write передаёт полный список частей, `base_execution_revision`, `client_operation_id`; повтор той же операции возвращает исходный результат.
- [x] Для v2-снимка требовать `execution_version:2` при start/plan/set/complete; legacy запись v2 без версии отвергать безопасной ошибкой 409, не стирать данные. Обычные v1 продолжают работать. Кэшированные клиенты не должны незаметно менять состав personal-day: start сверяет snapshot revision.
- [x] Проверить старый APK протокольным fixture: обычная outbox уходит, сложная конфликтует без удаления локального результата. Старый sync не должен очищать новые поля через projection.
- [x] Проверить transactional migrations, размер/диапазоны payload; дополнить Zod/API roundtrip tests. Для новых планов согласовать максимум 20 подходов во всех слоях: в текущем восстановлении frontend есть cap 12, его нельзя оставить с молчаливой потерей слотов 13–20.
- [x] Проверки; только при ошибках — исправления и повторные проверки; после успеха — `feat: store structured compound workout sets`.

### W5. Единый движок последовательности и пауз

**Files:** новые `frontend/src/utils/workoutExecution.ts`, `workoutRest.ts` и их tests; узкая интеграция с `workoutSession.ts`/store.

**Interfaces:** `buildExecutionSteps(plan: WorkoutPlan): ExecutionStep[]`; `resolveExecutionTransition(input: TransitionInput): TransitionDecision`; `remainingRestMs(rest: RestState, now: ClockSnapshot): number`.
Step содержит blockId/round/exerciseId/setNumber/partId; Decision — nextStep, restKind,
durationSec, terminal. RestState — transitionId/sourceActionId/targetStep/startedAt/endsAt/durationSec/owner.
Input содержит plan/факты/курсор/actionId/confirmedAt и текущую паузу. Повтор actionId — no-op.

- [x] Написать табличные tests всех строк раздела 5 spec до интеграции UI.
- [x] Точные assertions: кластер 3×4 перед следующим полным подходом — rest 20/20/120, в конце тренировки — только 20/20; суперсет на 2 раунда — A1/B1/A2/B2; между A/B 0, после B1 90, после B2 при конце тренировки 0.
- [x] Проверить трисет, круг с timed-участником, кластер внутри суперсета, следующий независимый блок, последний шаг, пропуск и отмену. Вложенных групп нет; неравные rounds дают validation error.
- [x] Реализовать pure transition reducer и deadline clock; `autoAdvance=false` меняет только UI-навигацию, не решение таймера.
- [x] Fake clocks: возврат через 10 с, после deadline, background throttling, смена даты/часового пояса, скачок wall clock, повтор actionId, исправление старого подхода, уже идущий отдых. Ноль не заменяется fallback через `||`.
- [x] Проверки; только при ошибках — исправления и повторные проверки; после успеха — `feat: resolve workout sequence and rest timing`.

### W6. Настройка методов в подготовке

**Files:** новые `WorkoutMethodEditor.tsx`, `WorkoutGroupEditor.tsx`, `WorkoutTimingPreview.tsx`; существующий composer/picker; новый `frontend/e2e/workout-method-preparation.spec.ts`.

**Interfaces:** редакторы принимают/возвращают типизированные set_methods/groups из W4; timing preview строится только через W5, отдельной логики таймера в preview нет.

- [x] Failing E2E: добавить второе упражнение на бицепс, объединить в суперсет, выбрать 3 раунда и паузу 90 с; сохранить и открыть без потери настроек.
- [x] Добавить селект «Способ выполнения», выбор подходов, редакторы ступеней/кластеров и групп, scope и понятное расписание пауз перед стартом.
- [x] Для отличающихся target_sets сначала показать итог rounds. Удаление участника требует исправить/распустить группу; нельзя сохранить висящую ссылку.
- [x] Проверить дроп для последнего подхода трицепса, кластер 100×4+4+4, трисет/круг и сочетание метода с группой; ошибки и draft после отказа сети сохранены.
- [x] Проверить ограничения W4 на клиенте и сервере; 320/375/393/1440, обе темы/низкая высота/focus.
- [x] Проверки; только при ошибках — исправления и повторные проверки; после успеха — USER_GUIDE/CHANGELOG и `feat: configure compound sets and exercise groups`.

### W7. Выполнение и пользовательский таймер

**Files:** новые `useWorkoutExecution.ts`, `CompoundSetEditor.tsx`, `WorkoutExecutionNavigator.tsx`; `ActiveWorkout.tsx`, store, RestTimer/Host; новый `frontend/e2e/workout-method-timing.spec.ts`.

**Interfaces:** hook исполняет TransitionDecision W5 после durable-сохранения факта;
UI показывает часть/раунд/следующий шаг и причину паузы. Сигнал дедуплицирован по transitionId.

- [x] Сначала failing UI tests: длинный ответ API не продлевает отдых; двойное нажатие не дублирует часть; таймер не стартует следующий подход сам.
- [x] Интегрировать сохранение частей, pending/completed/skipped, ручное продолжение, исправление и отмену; логический курсор не зависит от просматриваемой карточки.
- [x] Подписи таймера различают «Между кластерами», «Переход к упражнению», «После круга», «Между подходами». Пауза 0 сразу предлагает следующий шаг.
- [x] Проверить autoAdvance on/off, досрочное окончание отдыха, добавление 15 с, отмену последнего действия, correction старой строки и финал без лишней паузы.
- [x] Выполнить все timing E2E из W5 и реальные browser timers, включая фон/возврат. Сигнал один, новая работа требует пользователя.
- [x] Проверки; только при ошибках — исправления и повторные проверки; после успеха — документация и `feat: run grouped workouts with contextual rest timers`.

### W8. История и расчёт нагрузки

**Files:** `workout_metrics.py`, новый `workout_load_rows.py`, dashboard/exercise_progress/strength_trends/load_hints/competition analytics, AI workout facts; frontend history/completion/progress; `test_workout_method_metrics.py` и targeted analytics tests.

**Interfaces:** `effective_load_rows` — единая SQL-проекция обычных выполненных подходов и выполненных частей; родитель с частями не добавляется вторично. `normalized_set_volume` и frontend completion реализуют тот же контракт. 1ПМ/hints фильтруют drop/cluster; дневник их показывает.

- [x] Failing assertions: дроп=660, кластер=1200; частичный кластер 4+4 из 3 частей=800; per_hand удваивает вес ровно один раз; skipped/pending=0.
- [x] Перевести SQL-агрегации, а не только Python helper; parent count отличается от segment count, но UI объясняет их. Частичный результат учитывается независимо от parent.is_completed.
- [x] История отображает формат и фактические части. `100×(4+4+4)` не становится точкой `100×12`; обычные подходы в суперсете сохраняют прежний расчёт 1ПМ.
- [x] Проверить отсутствие ложных PR/силовых трендов/советов по рабочему весу и новых баллов регулярности; AI получает только вычисленные факты.
- [x] Проверки API + browser history/dashboard; только при ошибках — исправления и повторные проверки; после успеха — документация и `feat: report compound workout results accurately`.

### W9. Web durable drafts, prepared-планы и конфликты

**Files:** `db/workoutCustomization.ts`, `syncQueue.ts`, `offlineWorkoutContext.ts`, `lib/sessionRestore.ts`, store; серверные `offline_workouts.py`, `offline_schedule.py`, `android_sync/prepared_start.py` в части канонического формата; новые offline/session tests и E2E.

**Interfaces:** snapshot сохраняет v2-plan/revision/cursor/rest/action IDs/части/owner;
personal patch queue precedes dependent workout create; fingerprint включает revision правок.
Изменение серверного контракта подготовки — web/backend работа; native адаптация только после W10.

- [x] Failing recovery tests: reload между частями/упражнениями/раундами, закончился отдых в фоне, новый аккаунт, поздний save предыдущей версии.
- [x] Добавить durable-сохранение персональных и разовых drafts и паузы в существующее хранилище. При upgrade Dexie не удалять прежнюю сессию/очередь.
- [x] Проверить offline edit ранее загруженного дня → start → части → reload → complete → reconnect; ровно одна тренировка и все факты на сервере.
- [x] Конфликт двух вкладок/устройств и смена серверного дня во время offline: результат остаётся локально, нет молчаливой перезаписи, несвязанные записи синхронизируются.
- [x] Проверить bounded offline preparation: лимит ответа 6 MiB и native transport 8 MiB сохраняются; большой личный план предлагает меньший диапазон дней, не обрезает части.
- [x] Старый snapshot без v2 восстанавливается как обычный; неизвестная новая версия не конвертируется молча.
- [x] Проверки; только при ошибках — исправления и повторные проверки; после успеха — документация и `feat: recover customized workouts and rest timers offline`.

### W10. Полная web-приёмка и выпуск

**Files:** e2e suites, USER_GUIDE/CHANGELOG/AGENTS по изменившимся утверждениям, новый датированный QA report.

- [x] Пройти все 10 критериев spec, кроме отдельной installed Android-приёмки; проверить существующие custom program, scheduler, illness recovery, replacement и reconnect scenarios.
- [x] Выполнить применимые backend tests/Ruff, frontend unit/lint/build/bundle, Chromium/Firefox/WebKit E2E. Финальный полный набор запускать на собранном web scope, не после каждого микрошагa.
- [x] Миграции применить к копии тестовой существующей схемы, повторный runner не применяет дважды. Проверить REST и SQL roundtrip, не ограничиваться mocks.
- [x] Проверить PWA обновление во время активной тренировки, старую вкладку/старый APK с новым сервером и отсутствие потери очереди.
- [x] Для фактически недоступной среды оставить открытый gate; skip/setup failure не считать PASS.
- [x] Исправить выявленное отдельными небольшими циклами; после зелёных проверок diff review, документация и `test: verify personalized workout methods on web`.
- [ ] При исполнении утверждённой доработки выпустить web по постоянному разрешению владельца: production branch push → проверенный backup/restore → VPS pull --ff-only/rebuild/migrate/up → health/site/затронутые live scenarios. Точный runbook — `docs/TIMEWEB_DOMAIN_CUTOVER.md`. В задаче подготовки плана выпуск не запускать.
- [ ] Зафиксировать точный проверенный web SHA и отчёт. Только после закрытия web-gate переходить к A1.


### A1. Обновить Android shared без второй реализации

**Files (C:/fitness-android):** gitlink `shared/fitness_prog`, `shared-version.json`, root lockfile только если изменились shared dependencies; docs/android.

- [ ] Снова сверить native HEAD/status/HANDOFF и web release SHA; исправить доступ к submodule metadata штатным способом, если сохраняется локальный Permission denied. Не обходить guard редактированием pinned source.
- [ ] Поднять pin до проверенного W10 SHA, обновить manifest; обычный интерфейс и группы приходят из shared.
- [ ] `check:shared`, shared tests, native tests/lint/build/shell; зависимости устанавливать только в Android root.
- [ ] Если найдены интеграционные ошибки, исправить их в соответствующем репозитории; shared фикс получает проверки и коммит до pin update. Если ошибок нет — сразу следующий шаг.
- [ ] Отдельный native commit `chore(android): pin verified personalized workout web release`.

### A2. SQLite/outbox и native восстановление сложных тренировок

**Files:** `src/native/diaryMutations.ts`, `diaryTypes.ts`, `journal.ts`, `offlineProgramStart.ts`, syncEngine/read boundary, узкий adapter customization, FitnessStorage при изменении SQLite schema; tests и instrumentation.

**Interfaces:** shared v2 contract без повторного движка таймера; SQLite — durable source. Новые queued customizations обрабатываются существующим journal/outbox с owner/revision; если добавляется kind, одновременно обновить server protocol и unknown-kind compatibility, предварительно выпустив совместимый backend.

- [ ] Failing native tests на v2 roundtrip, parts/revision/UUID, подготовку изменённого дня, owner boundary, replay и conflict. Проверить, что Zod/native mapping не отбрасывает поля.
- [ ] Атомарно сохранять action/result/cursor/rest в SQLite до UI success; Dexie хранит проекцию. Не записывать две независимые копии истины.
- [ ] Обновить native offline preparation и revision fingerprint; при смене личных правок обновить нужные prepared variants, не сбросить законченные тренировки.
- [ ] Upgrade со старой непустой SQLite/outbox сохраняет обычные записи; старые непризнанные операции не удаляются. Утерянный ack/retry не дублирует части.
- [ ] Проверить native unit/Node/JVM, instrumentation хранилища и затронутый server sync contract; только при ошибках — исправления и повтор; после успеха — `feat(android): persist compound workouts through native journal`.

### A3. Installed Android: паузы, process death и sync

**Files:** `NativeOfflineWorkoutTest.java`, новый `WorkoutExecutionRecoveryTest.java` рядом; scripts runtime proof только при необходимости нового сценария, без ослабления gates.

- [ ] Собрать/установить точный APK на отдельный `fitness_` AVD. Не трогать BlueStacks пользователя, общий ADB/OpenVPN или чужие процессы.
- [ ] При сети загрузить изменённую программу → закрыть → cold launch без сети → суперсет/дроп/кластер → остановить процесс внутри короткой паузы → cold restart.
- [ ] До deadline остаток верен; после deadline одна подсказка без каскада шагов. Проверить screen lock/return, ручное окончание отдыха и выключенный автопереход.
- [ ] Закончить офлайн → закрыть → online reopen → sync. На сервере ровно одна тренировка; части/порядок/паузы/объём/история сохранены.
- [ ] Проверить upgrade поверх прежнего APK с непустой очередью и сохранённым входом; физический телефон/OEM/сигнал проверить отдельно и честно записать результат.
- [ ] Сохранить source/shared SHA, APK hash/signature, actual tests/failures/skips и screenshots. E5 не объявлять исправленным из-за невоспроизведения.
- [ ] Если найдены ошибки — исправлять по одной, повторять затронутый installed сценарий и сохранять отдельными коммитами. Если ошибок нет — сразу итоговый коммит `test(android): verify compound workout lifecycle and timers`.

### A4. Android-приёмка и штатный выпуск

- [ ] Все применимые native/shared/installed gates зелёные; непроверенные device-сценарии не закрывать текстом. Обновить HANDOFF/PARITY/CONTRACTS/CHANGELOG.
- [ ] Новый versionCode монотонный; source/shared provenance зафиксирована, старый APK сохранён.
- [ ] После diff review и коммита выпуск штатным `npm run android:publish`, прежняя локальная подпись, production API; temporary-key/placeholder APK не публиковать.
- [ ] Проверить публичные bytes/hash/signature/download, предложение обновления и сохранность данных после установки. Рассылку не запускать.
- [ ] Отдельный release-коммит и итоговый отчёт с web SHA, native SHA, APK version и реально выполненными проверками.

## Команды проверок

Выполнять из указанной папки актуальной worktree. Новые test-файлы появляются в своём этапе;
их отсутствие до реализации не считается исходной ошибкой. Unit tests для этого изменения обязательны,
потому что затрагиваются данные, последовательность и офлайн-протокол.

Backend, из `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_workout_customization.py tests/test_planned_workout.py -q
.\.venv\Scripts\python.exe -m pytest tests/test_workout_execution.py tests/test_workout_idempotency.py -q
.\.venv\Scripts\python.exe -m pytest tests/test_workout_method_metrics.py -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m pytest -q
```

Frontend, из `frontend`:

```powershell
npm test -- src/utils/workoutExecution.test.ts src/utils/workoutRest.test.ts
npm test
npm run lint
npm run build
npm run check:bundle
npm run test:e2e -- e2e/workout-customization.spec.ts e2e/workout-method-preparation.spec.ts e2e/workout-method-timing.spec.ts
```

Миграции, из корня web: `backend/.venv/Scripts/python.exe scripts/check_migrations.py`.
Дополнительно реальное применение на тестовой PostgreSQL; статический checker его не заменяет.
`npm run build` не публикует работающий dist; для выпуска использовать существующий runbook/atomic publisher.

Android, из корня native:

```powershell
npm run check:shared
npm test
npm run test:shared
npm run lint
$env:VITE_API_URL = 'https://android-api.invalid'
npm run android:sync
npm run test:shell
npm run android:apk
npm run android:smoke
```

Placeholder API — только private проверка. Эти команды не заменяют A3 instrumentation
и сценарий с фактическим локальным тестовым API. Production release выполняется publisher
с production-конфигурацией по BUILD.md, а не публикацией private APK из этой команды.

## Журнал выполнения и правило перехода

Для каждого W/A: статус, исходный SHA, результат, точные проверки/число passed-failed-skipped,
причина и исправление ошибки, итоговый SHA коммита, ограничения среды. Статусы:
`не начат / выполняется / проверка не пройдена / проверен и закоммичен / внешняя блокировка`.
Следующий этап начинается только после `проверен и закоммичен`; внешняя блокировка обязательного
gate не превращается в PASS. Коммитить явный список файлов, не `git add .` в грязной рабочей папке.
