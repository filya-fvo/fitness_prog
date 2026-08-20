# UX Improvements — Fitness Mini App

**Дата:** 2026-08-04  
**Бэкап перед работами:** `backups/full_pre_p0_20260804_165212`  
**Статус:** P0–P3 (кроме Stars) — реализовано (0.9.5–0.9.8)

---

## Контекст

По UX-аудиту продукт выше демо-MVP, но упирается в **скорость логирования**, **первый успех после онбординга**, **навигацию**, **процесс видео** и **защиту ограничений** (колени/спина).

---

## P0 — максимальный ROI (сейчас)

### P0.1 Быстрый лог подходов
- При старте упражнения: слоты по `target_sets` с весом/повторами из истории (suggest).
- Тап **«Готово»** на слоте завершает подход без обязательной модалки (если есть reps/weight или timed duration).
- Кнопка **«Как прошлый»** / повтор последнего сета.
- **«Изменить»** / «Добавить подход +» → модалка wheel (как сейчас).
- Сохранить защиту от stale-state (`getState().drafts`).

### P0.2 First-run success
- После онбординга: авто-назначить top-1 программу (`active_program_id` + cursor).
- Редирект на **Главную**, не в сырой список программ.
- На главной один явный CTA «Начать день 1».

### P0.3 Навигация
- Нижнее меню: **Главная · Тренировки · Питание · Прогресс · Ещё**.
- «Ещё» = профиль + AI + (при необходимости) админ.
- Программы/каталог доступны из блока «Тренировки» (главная/programs hub) или отдельного экрана-хаба.

### P0.4 Видео-процесс
- Скрипт/обёртка: после rebuild каталога — `apply_video_urls.py --from-checklist`.
- Документировать в `exercise-media-checklist.md` / `exercise-gifs.md`.
- Не затирать `video_url` при rebuild seed (или сразу re-apply).

### P0.5 Защита ограничений
- Если в профиле `no_knee` / `no_spine` и пользователь стартует программу **без** этого limitation — confirm/warning.
- В списке программ: фильтр/бейдж «подходит под ограничения».

---

## P1 — следующие 2–4 недели

1. ~~Силовой прогресс (тренды ключевых лифтов, est. 1RM).~~ → Progress · StrengthTrends
2. ~~Прозрачные рекомендации программ («почему эта»).~~ → `scorePrograms` / reasons on cards
3. ~~Питание: недавние / избранное / «как вчера».~~ → DailyLog + localStorage
4. ~~AI в контексте активной сессии (замена текущего упражнения).~~ → ActiveWorkout «AI: замена»
5. ~~Re-entry после пропуска 7+ дней.~~ → Home banner + soft light start

---

## P2 — 1–2 месяца

1. ~~Привычки/чекины (вода, вес, сон).~~ → Home + Progress
2. ~~Достижения / бейджи.~~ → Progress badges
3. ~~Дом `no_spine`, улица `no_knee`.~~ → build_programs_v2
4. ~~Шаблоны каталога (Upper 40 / FB 30).~~ → WorkoutCatalog presets
5. Контент: короткие видео топ-40 — **процесс** (checklist + apply-videos; наполнение URL вручную).
6. Telegram Stars (Pro) — **отложено** (нужна оплата/бэкенд).

---

## P3 — платформа

1. ~~E2E: онбординг → сет → finish → nutrition.~~ → Playwright smoke + funnel nav (полный set/finish — device QA с Telegram auth).
2. ~~Метрики activation / D7 / time-to-log-set.~~ → `set_logged` / `activation_completed` + `lib/metrics.ts`.
3. ~~Единый `make content` пайплайн.~~ → `Makefile` + `scripts/content.cmd`.
4. ~~A11y: зоны тапа ≥44px.~~ → nav + primary workout/habit controls.

---

## Критерии готовности P0

| # | Критерий | Проверка |
|---|----------|----------|
| 1 | Слоты подходов появляются из плана/истории | unit + ручной старт |
| 2 | «Готово» логирует без модалки при заполненных полях | ручной |
| 3 | Онбординг → home + active_program_id | ручной / код |
| 4 | Меню ≤5 пунктов, профиль/AI доступны | UI |
| 5 | apply videos после rebuild задокументирован/скрипт | docs + script |
| 6 | Старт «чужой» программы при no_knee → warning | UI |

---

## Changelog реализации

- 2026-08-04: бэкап `full_pre_p0_20260804_165212`, документ создан, старт P0.
- 2026-08-04: P0 закрыт в **0.9.5**:
  - P0.1 `draftsWithSuggestions` + `draftReadyToComplete` + UI ActiveWorkout (Home/Programs).
  - P0.2 Onboarding → `active_program_id` + navigate `/`.
  - P0.3 Bottom nav 5 пунктов; `TrainHubPage`, `MorePage`.
  - P0.4 rebuild preserve video; `scripts/rebuild-content.cmd`, `scripts/apply-videos.cmd`.
  - P0.5 limitation confirm + badges + filter «Под мои ограничения».
- 2026-08-04: P1 закрыт в **0.9.6**:
  - P1.1 strength trends + est. 1RM (Epley) on Progress.
  - P1.2 program «Почему: …» via `scorePrograms` / `explainProgramMatch`.
  - P1.3 nutrition recent / favorites / copy yesterday.
  - P1.4 ActiveWorkout AI assist for current exercise swap.
  - P1.5 Home re-entry after 7+ days gap.
- 2026-08-04: P2 (кроме Stars) в **0.9.7**:
  - habits check-in, badges, home no_spine + outdoor no_knee programs, catalog Upper40/FB30.
- 2026-08-04: P3 в **0.9.8**:
  - e2e funnel-path, metrics funnel, content.cmd/Makefile, tap-target a11y.
