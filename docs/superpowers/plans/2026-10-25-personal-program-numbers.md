# Personal program numeric controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь может свободно очистить и набрать числа в конструкторе, выбрать пресет отдыха и сохранить «Без отдыха» без подмены при старте.
**Architecture:** Нулевой отдых сначала проходит существующий personal API и общий plan builder. Затем отдельная UI-задача заменяет eager clamp локальным строковым вводом и блокирует сохранение невалидной формы. Методы/цели следующего этапа не внедряются в эту задачу.
**Tech Stack:** Python/FastAPI/Pydantic, React/TypeScript, pytest/Vitest/Playwright.
**Spec:** docs/superpowers/specs/2026-10-25-web-builder-audit-design.md — утверждён владельцем 25.10.2026, дальнейших согласований не требуется.

## Global Constraints

- Сначала WEB; Android pin/runtime/APK не менять.
- Личные программы: 1–7 дней, 1–12 уникальных упражнений на день, 1–8 подходов.
- Отдых обычного личного упражнения: 0–300 секунд; 0 означает «Без отдыха». Старые payload и история остаются совместимыми.
- Строковый ввод сохраняет пустое промежуточное значение и не clamp-ится на каждом onChange. Пустое обязательное значение не становится 0.
- Проверки только isolated fixtures; реальные данные/настройки, ADB и рассылки не менять.
- Каждый шаг RED → GREEN → review → отдельный commit. Не параллелить реализацию общей модели.

## Review Focus

1. Явный ноль против отсутствующего значения — B01a test отсутствия/default и explicit0 во всех фазах.
2. Старая phased-программа и ненулевой отдых — B01a regression, фазовые правила не менять в этом маленьком шаге.
3. Пустое/дробное/слишком большое число — B01b форма не сохраняет предыдущую скрытую цифру.
4. Смена дня/удаление упражнения/восстановление draft — B01b ошибка не остаётся от удалённого поля и не теряется молча.
5. Узкий экран и диктор — B01b 320/393/1440, обе темы, области44, поля16, адресная ошибка.

### Task 1: B01a — нулевой отдых через API и plan assembly

**Files:** backend/app/schemas/program.py; backend/app/services/workout_service.py; backend/tests/test_personal_programs.py; docs/USER_GUIDE.md; docs/CHANGELOG.md.
**Interfaces:** PersonalProgramExercise.rest_sec остаётся int, default60, диапазон становится0..300. build_plan_from_program_day сохраняет explicit0 из exercise либо day rest default; отсутствие обоих даёт60 до прежней фазовой обработки. Ненулевые значения сохраняют существующие heavy/light правила.

- [ ] Добавить тесты schema0/300 принимаются, -1/301 отклоняются; create→build plan для linear/phased и light/medium/heavy сохраняет0; отсутствие exercise rest использует day default0, отсутствие обоих — прежний default/phase.
- [ ] Запустить новые тесты через C:/fitness_prog/backend/.venv/Scripts/python.exe -m pytest tests/test_personal_programs.py -q; сохранить реальный RED и причину.
- [ ] Исправить schema и truthiness fallback: отличать None от0; не применять фазовый минимум/максимум к0. Не исправлять иные фазовые решения заодно.
- [ ] Запустить файл personal-program tests и затронутые program/workout plan tests, ruff на затронутых файлах; фиксировать реальные результаты.
- [ ] Добавить короткие USER_GUIDE/CHANGELOG записи с честным статусом backend-first. Независимый reviewer проверяет diff+тестовое свидетельство.
- [ ] Root проверяет diff и делает отдельный commit; обновляет ledger. Следующая задача после чистого review.

### Task 2: B01b — управляемый числовой ввод конструктора

**Files:** frontend/src/features/workout/pages/PersonalProgramBuilderPage.tsx; новый узкий component/helper рядом с builder при необходимости; frontend/e2e/personal-program-numbers.spec.ts; frontend/e2e/fixtures/personal-program.tsx при необходимости; docs/USER_GUIDE.md и CHANGELOG.
**Interfaces:** использовать существующий DecimalInput/NumberStepper только если это сохраняет0, поддерживает максимум и44px. Не менять старый NumberStepper глобально ради одной формы. Допустим отдельный scoped numeric component с value:string, min/max/step/presets; parent хранит черновые строки, adapter выпускает numbers только после полной проверки. API payload остаётся PersonalProgramInput.

- [ ] Browser RED на отдельной fixture: очистить отдых → поле пустое; набрать120 → остаётся120; 0 → POST rest_sec0; -1/301/пусто/дробь не позволяют сохранить с адресной ошибкой. То же свободное редактирование количества подходов1..8 и недель1..52.
- [ ] Реализовать строковое состояние с явным parse/validation перед API; numeric fields не подставляют min/max при наборе. Ввод «Без отдыха»,30/60/90/120 и ± доступны без клавиатуры, пределы не превышаются; строка "" не является0.
- [ ] Сохранить owner-scoped recovery, старые numeric drafts читать совместимо; разные дни не обмениваются черновыми полями/ошибками. Удаление поля очищает только его ошибку.
- [ ] Прогнать browser cases на320/393/1440, light/dark и короткой высоте; проверить computed font>=16, touch>=44, нет горизонтального overflow. Не обновлять snapshots механически.
- [ ] Запустить имеющийся personal-program path и long-draft-recovery, целевые unit при наличии чистого parser, lint/tsc/build. Результаты сохранить в ledger.
- [ ] Независимое review, исправление замечаний, повторная целевая проверка, отдельный commit root.

## Дальнейшая очередь (отдельные планы перед реализацией)

B02: atomic personal-day round-trip групп, методов и явных целей; B03: WorkoutDayComposer в builder с limits; B04: reps range/weight/time presets, actual-start/drafts/modal и fingerprint compatibility. Затем F01,F02,F04,F05,F07,F06,F10,F03,F08,F09. Новые N01–N06 хранятся отдельно в spec/ledger. H01–H03 — проверка гипотез, не автоматическое внедрение предположений. Production WEB по утверждённым правилам после законченного проверенного этапа; промежуточный commit не является выпуском.
