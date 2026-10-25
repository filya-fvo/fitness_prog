# Personal program methods and explicit targets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task, no parallel implementation.

**Goal:** Программа хранит существующие сложные методы и точные обычные цели атомарно; они доходят до начальной формы выполнения и совместимого immutable snapshot.
**Architecture:** Optional target на упражнении, существующие groups на дне и set_methods на упражнении. Общие schemas/validators, один start path и единая цель. UI интегрируется только после прохождения round-trip/runtime gates.
**Tech Stack:** Pydantic2, SQLAlchemy JSON, Zod/TypeScript, pytest/Vitest/Playwright.
**Spec:** docs/superpowers/specs/2026-10-25-web-builder-audit-design.md (утверждён25.10).

## Global Constraints

- WEB only; не менять Android/pin/APK или реальные production данные.
- Старые payload без optional полей и active snapshots сохраняют прежнее поведение/ключи.
- Existing drop/cluster, superset/triset/circuit, максимум8 подходов/12 упражнений личного дня.
- suggested_weight — подсказка истории; explicit target — намерение; выполненные факты не создаются из цели.
- Режимы доступны по действующему infer_load_type: weight_reps→вес+повторы, reps_only→повторы, timed/cardio_machine→время. Не предлагать ложное переключение, которое actual runtime не поддержит.
- Каждая задача RED→GREEN→review→commit; новые побочные ошибки регистрируются отдельно.

## Review Focus

1. Absent target не меняет старый snapshot/fingerprint; явный target меняет новый и защищён от plan edit.
2. Explicit0 rest и конкретная цель не подменяются фазой/историей.
3. Неверные диапазоны/точность веса/группы/методы отклоняются сервером, не только UI.
4. Draft с намеренно очищенным вводом и уже выполненные факты переживают reload; prefilling только отсутствующего initial draft.
5. Methods/groups/target переживают создание→GET→preview→start, а не только mock-echo POST.

## Interfaces (фиксируются до реализации)

Добавить общий optional `target` в PersonalProgramExercise и WorkoutPlanExercise:

```ts
type ExplicitWorkoutTarget =
 | { kind: "reps_only"; reps_min: number; reps_max: number }
 | { kind: "weight_reps"; reps_min: number; reps_max: number; target_weight: number | null }
 | { kind: "timed"; duration_sec: number };
```

Server variants extra=forbid, discriminator kind. Reps integer1..100000,min<=max; weight null or >0..10000,≤2 decimals; duration integer1..86400. Weight mode остаётся существующим row.weight_mode:total/per_hand/null и сохраняется как optional personal field. Parts методов используют свой текущий exact target_reps/weight/pause. Совместимая reps-строка старого payload остаётся и формируется из target для показа; target канонический при наличии.

### Task B02a: shared target contract and immutable compatibility

**Files:** новый backend/app/schemas/workout_target.py; backend/app/schemas/workout.py; backend/app/services/workout_preparation.py; backend/app/services/workout_execution.py; frontend/src/types/workout.ts; новый frontend/src/api/workoutTargetSchemas.ts; frontend/src/api/workouts.ts; frontend/src/utils/workoutExecutionState.ts; соответствующие schema/execution/preparation/snapshot tests.
**Produces:** backend ExplicitWorkoutTarget union, frontend ExplicitWorkoutTarget type + explicitWorkoutTargetSchema.

- [x] До изменения зафиксировать deterministic legacy fingerprint/snapshot key в regression fixture. Добавить RED tests всех union variants, bad ranges/unknown fields/precision, optional absent compatibility и target edit rejection.
- [x] Ввести поле и mirrored schema. При канонизации исключать только absent/null target (не глобальный exclude_none); новые поля включать в immutable comparison. Существующий snapshot без target побайтово прежний.
- [x] GREEN focused schemas/keys/fingerprint/plan-edit tests, backend lint и TS/lint. Никакого UI/новых методов здесь.
- [x] Review+fix+commit отдельного контракта.

### Task B02b: atomic personal-day methods and goals round-trip

**Files:** backend/app/schemas/program.py; backend/app/services/program_service.py; backend/app/services/workout_service.py (либо извлечённый personal-day helper, если большой файл); frontend/src/api/programs.ts; backend/tests/test_personal_programs.py; frontend/src/api/programs.test.ts; docs/USER_GUIDE.md/CHANGELOG.
**Consumes:** target B02a и existing WorkoutSetMethod/WorkoutGroup; **Produces:** PersonalProgramInput.days[].groups?, exercises[].target?/set_methods?/weight_mode?.

- [x] RED create→serialized structure→actual plan assembly для трёх целей, superset и последнего drop/cluster; набор negative tests topology/load types/private owner/unknown fields.
- [x] Serialize optional fields atomically в Program.structure.schedule, не делать второй customization POST. Проверить полный день common WorkoutPlan validator, затем catalog load type. Не переносить методы неподходящему упражнению.
- [x] При explicit target сохранить его и rest в linear/phased; без target прежние программы следуют старым фазовым правилам. groups и methods передаются в execution_version2 snapshot. Валидация не только client-side.
- [x] GREEN personal/program/start tests и соответствующие API tests; сохранить privacy. Review+fix+commit.

### Task B02c: explicit target reaches editable execution

**Files:** frontend/src/utils/workoutTargets.ts (один pure resolver), utils/loadProgression.ts, utils/workoutMethods.ts, utils/workoutSession.ts при необходимости, features/workout/services/programWorkoutStart.ts и ActiveWorkout.tsx (узкий вызов helper вместо нового независимого блока). Relevant tests рядом и workout-prepared-start fixture.
**Produces:** pure initial-draft target resolver; preparedTimeSeconds читает explicit timed, затем legacy string; совместимая видимая подпись цели.

- [x] RED explicit reps_min/weight/time выигрывают phase/history, но existing draft/completed fact не заменяются. В обычной форме reps prefill=min, рядом полный диапазон; duration из target. Для parts приоритет specific method target.
- [x] Исправить initial missing-draft prefilling и timed modal через один helper. Не считать цель completion; не перезаполнять существующий blank draft на reload.
- [x] GREEN unit/start/prepared runtime/recovery; invalid snapshot не заменяет valid durable record. Review+fix+commit.

### Task N02: linear rest is fixed across weeks

After B02b, before B03, separately from explicit-target persistence. Existing linear programs describe fixed weekly targets, but nonzero rest still follows heavy/light clamps. B01a intentionally preserved this until its own test/fix step.

- [x] RED real plan construction: linear exercise30 inheavy must stay30, linear120 inlight stays120; missing rest defaults60 inallphases. Existing phased values retain legacy75/90 clamp behavior. Keep0casesGREEN.
- [x] Apply phase rest adjustment only to phased legacy plan; explicit newtarget rest policy already protected by B02b. Update earlier literal B01a regression expectations specifically for intended linear fix, not globally weakening assertions.
- [x] GREEN personal/plan/cycle regression, Ruff; USER_GUIDE/CHANGELOG exact linear rule, independent review and separate commit. No DB/history rewrites.

### Task N09: compatible goals on exercise replacement

Completed 3f4c9b8 after scoped review/fix/re-review; inherited occurrence-reset validation included.

Separate source-discovered candidate, validate with actual RED before fixing. Before composer integration, test frontend replacement plus both backend prepared replacement paths. Incompatible target/load replacement must reject before saving with a clear explanation to change/remove the goal, rather than silently dropping or converting it. Reuse infer_load_type and common intent validation; compatible goals, methods, rest and weight mode survive. Missing/private/duplicate exercise guards stay. Preserve no-target legacy behavior. Independent review and separate commit.

### Task N10: zero rest through execution UI

Completed ade532a after independent review; invalid rest drafts are owner/session/exercise scoped.

Separate source-discovered candidate, actual browser RED first. ActiveWorkout currently converts zero to60 at display/modal/completion boundaries and clamps runtime edit to15. Preserve explicit0 through display, edit, save and reload; no nonzero timer after completing such a set. Missing fallback60 and positive values stay; shared compound clocks/auto-transition rules unchanged. Reuse bounded stringdraft numeric UX where needed. Synthetic fixtures only, no real notification delivery. Independent review and separate commit.

### Task N13/N13b: test artifact isolation

Completed a39c786 and cf999b8 after independent review: execution, composer, preparation and history diagnostic screenshots use Playwright per-test output. Corrected runs left main-artifact hashes unchanged. Earlier two execution PNG overwrites are recorded; no original restoration claim. No product behavior changed.

### Task B03: one day composer in personal builder

Execute as three independently checked commits: B03a pure lossless adapter + bounded recovery/N08; B03b composer integration and limits; B03c/N12 raw numeric methods/groups. Preserve invalid/blank string drafts and block saving instead of silently normalizing them. Run N07 compatibility, N09 and N10 before exposing the new constructor.

**Files:** PersonalProgramBuilderPage.tsx, новый personalProgramDraft.ts/adapter+tests рядом; WorkoutDayComposer.tsx и reusable numeric/target editors; WorkoutGroupEditor.tsx/WorkoutMethodEditor.tsx только если требуется current contract; personal-program-methods E2E/fixtures; USER_GUIDE/CHANGELOG.

- [ ] RED добавление/сохранение/восстановление superset/triset/circuit/drop/cluster и порядок. Чистый adapter serializes methods/groups/targets/weight_mode/rest0 без потерь и не расширяет limits.
- [ ] Переиспользовать composer, передав limits personal8/12; pending group edit блокирует общее save. Проверить максимальный допустимый методный draft против shared recovery100000-character cap (N08): увеличить только ограниченный context budget либо явно предотвратить тихую потерю допустимого draft; обычные аккаунты/контексты не расширять без причины. Атомарные reorder/remove/replace используют existing utilities. Сохранить numeric UX B01b и old drafts.
- [ ] GREEN backend roundtrip уже B02b + browser payload/reopen; не объявлять mock-echo проверкой сервера. Review+fix+commit.

### Task B03c/N12: raw numeric fields in methods and groups

Every numeric input in the approved constructor must retain raw text. Existing group transition/round rest and method pause/repetition/weight handlers eagerly convert input. Add recoverable identity-bound buffers and validity/pending reporting to the shared editors, preserving group/method invariants and optional blank weight. Regress erase, unfinished decimals, invalid integers, selection changes, day switch and reload. This is a separate RED/GREEN/review/commit and release gate after B03b, before B04. No duplicate personal-only editor.

### Task B04: target controls and final WEB vertical check

**Files:** scoped shared target editor компоненты/helpers; builder/composer интеграция; relevant e2e/visual fixtures; docs.

N11 scope ruling: typed goals are editable during new personal-program creation through the atomic personal API. In existing preparation, a typed program goal is read-only with an explanation; suppress legacy reps/time controls that runtime would ignore. No-target rows retain existing editing. Do not invent a target-delta protocol implicitly.

- [ ] RED обычные reps представлены двумя полями,min<=max; timed — время/единица/пресеты; вес необязателен и учитывает существующий weight_mode. Методы частей сохраняют exact reps. Все numeric controls свободно очищаются/вводятся и не подменяются eager clamp.
- [ ] Реализовать контролы в нынешней дизайн-системе; неподдерживаемые load modes объясняются, не маскируются работающим selector. Не делать новый rest-pause kind.
- [ ] Сквозная приёмка: create→GET→preview→start→draft/modal→save/reload на синтетическом стенде; old payload и active session.320/375/393/1440, две темы, короткая высота, aria/focus/font/touch, reviewed snapshots. Ни phone/production test records.
- [ ] Полные применимые tests/lint/type/build+bundle, независимое whole-stage review, fix/recheck/commit. Только законченный проверенный WEB-этап готов к выпуску по штатному runbook.

### Task N07: compatibility bridge before WEB release

**Files:** backend preparation/start and plan-edit services; focused old-client fixture tests; legacy-readable target label helper. No native source changes.

- [x] RED: pass new target-bearing bundle through exact APK26 stripping Zod schema and old offline context round-trip; server receives target-less plan with retained canonical stamp. Reproduce prepared offline and native online-prepared route contract; do not claim device execution.
- [x] Restore ONLY truly omitted target from authoritative expected server plan before full fingerprint validation; match exercise identity/order, never accept changed non-target topology or an explicitly supplied mismatching/null target. Preserve distinction absent vs explicitnull through Pydantic/model_dump boundaries. Fingerprint itself remains full-strength canonical.
- [x] Whole-plan edit from old client: omitted target retains existing server target; explicit change/null of active target still rejects. Never replace actual facts with goals.
- [x] Legacy fields keep readable reps/time and derived human note for explicit weight, without repurposing suggested_weight. APK26 will require manual goal entry; new WEB provides full initial-target behavior. No claim of new embedded native capability before APK phase.
- [x] GREEN tests exact legacy parser stripping+server expected restore; corruption/target tampering409; old session/fingerprint unchanged; canonical target remains after GET/reload and omission update. Review+fix+commit. Gate this before stage publication even if UI finished.

## Следующий этап

После этого текущий HEAD становится основой перепроверки F01,F02,F04,F05,F07,F06,F10,F03,F08,F09. Каждый дефект — свой небольшой план/brief и собственный commit после проверок. H01–H03 остаются задачами проверки гипотез. Android переносится отдельным этапом после WEB. Повторных согласований этих шагов не требуется.
