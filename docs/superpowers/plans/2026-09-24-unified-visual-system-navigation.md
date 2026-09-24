# Unified Visual System and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести Fitness Mini App на подтверждённую насыщенную визуальную систему и корневую навигацию «Главная / Упражнения / Дневник / Помощь / Профиль», сохранив текущие сценарии, данные, offline-режим и старые deep links.

**Architecture:** Изменение выполняется снизу вверх: сначала единые CSS-токены и небольшие UI-примитивы, затем чистая таблица владения маршрутами и новые хабы, после этого функциональные модули. Крупные исторические страницы не раздуваются: новые самостоятельные блоки извлекаются в компоненты и чистые utilities. Backend меняется только там, где воспроизводимый тест докажет ошибку аналитики; публичные API сохраняются.

**Tech Stack:** React 18, TypeScript strict, React Router 7, Tailwind CSS, TanStack Query, Zustand, Dexie, Vitest, Playwright, axe-core, FastAPI, SQLAlchemy async, pytest.

**Spec:** [2026-09-24-unified-visual-system-design.md](../specs/2026-09-24-unified-visual-system-design.md)

## Global Constraints

- Сохранять пользовательские данные, существующие API и offline queue.
- Не добавлять новые runtime-зависимости: иконки и анатомические схемы выполнить локальными SVG-компонентами.
- Градиент `#FF6B24 → #E83D81 → #7C4DFF` использовать для бренда, основных действий и активных состояний; зелёный — только для успеха.
- Каждая интерактивная область — не меньше `44×44 px`; поля на мобильном — минимум `16 px`.
- Проверять ширины `320`, `375/393` и `1440 px`, тёмную и светлую темы, safe-area и низкий экран.
- Публичные `/help`, `/faq`, `/knowledge` остаются доступными без авторизации.
- После каждого завершённого задания: целевые тесты, lint/build при затронутой границе, визуальный smoke, отдельный commit.
- После каждого commit оставлять проверяемый локальный HEAD, сообщать hash и адрес `http://127.0.0.1:5173`; для телефона в одной сети сообщать `http://<LAN-IP>:5173`.
- Не запускать `publish-local.cmd` для обычной проверки: он управляет локальным Funnel/Telegram. Точный Telegram WebView проверять отдельным временным HTTPS-адресом только по необходимости.
- Не трогать уже существующие пользовательские изменения в `frontend/test-results`, `graphify-out` и `artifacts/qa-*`.
- Production не обновлять до общей локальной приёмки и полного зелёного набора проверок.

## Review Focus

- На одном экране нет конкурирующих зелёных и градиентных акцентов.
- Карточки насыщенные, но связанные строки собраны в один модуль и не превращены в набор огромных контейнеров.
- Root navigation имеет ровно пять согласованных пунктов и корректно подсвечивает дочерние маршруты.
- Basic и Advanced дневника показывают реально разные данные.
- У каждого упражнения есть осмысленное превью; детальная карточка явно разделяет фото, анимацию и видео.
- Все старые прямые ссылки либо продолжают работать, либо явно перенаправляются на новый владеющий раздел.

---

### Task 1: Ввести токены и базовые визуальные примитивы

**Files:**
- Create: `frontend/src/theme/visualStyles.ts`
- Create: `frontend/src/theme/visualStyles.test.ts`
- Create: `frontend/src/components/ui/AppCard.tsx`
- Create: `frontend/src/components/ui/AppButton.tsx`
- Create: `frontend/src/components/ui/AppField.tsx`
- Create: `frontend/src/components/ui/AppChip.tsx`
- Create: `frontend/src/components/ui/StatusNotice.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/components/ui/PageSkeleton.tsx`

- [ ] **Step 1: Зафиксировать контракт вариантов в падающем тесте**

```ts
import { describe, expect, it } from "vitest";
import { buttonClass, cardClass } from "./visualStyles";

describe("visualStyles", () => {
  it("keeps success separate from the brand gradient", () => {
    expect(buttonClass("primary")).toContain("app-gradient-action");
    expect(buttonClass("success")).toContain("app-success-action");
    expect(cardClass("raised")).toContain("app-card-raised");
  });
});
```

- [ ] **Step 2: Запустить тест и подтвердить ожидаемое падение**

Run: `cd frontend; npm test -- src/theme/visualStyles.test.ts`

Expected: FAIL — модуль `visualStyles` ещё не существует.

- [ ] **Step 3: Реализовать минимальный типизированный контракт**

```ts
export type AppCardTone = "base" | "raised" | "accent" | "info" | "success" | "danger";
export type AppButtonTone = "primary" | "secondary" | "quiet" | "success" | "danger";

export const cardClass = (tone: AppCardTone): string => `app-card app-card-${tone}`;
export const buttonClass = (tone: AppButtonTone): string => `app-button app-${tone}-action`;
```

`AppCard`, `AppButton`, `AppField`, `AppChip` и `StatusNotice` должны принимать `className`, сохранять нативные props и не скрывать `aria-*` атрибуты.

- [ ] **Step 4: Добавить системные CSS-токены**

В `:root`, `:root[data-theme="dark"]` и `:root[data-theme="light"]` определить семантические переменные:

```css
--app-bg: #07111f;
--app-surface: #101b2f;
--app-surface-raised: #18253f;
--app-brand-start: #ff6b24;
--app-brand-mid: #e83d81;
--app-brand-end: #7c4dff;
--app-info: #27c7e8;
--app-success: #38c77a;
```

Добавить классы `app-gradient-action`, `app-gradient-text`, `app-card-*`, `app-field`, `app-chip` и `app-status-*`. Светлая тема использует те же семантические роли, а не отдельный набор случайных цветов.

- [ ] **Step 5: Перевести Header и skeleton на примитивы без изменения поведения**

Сохранить Telegram/browser back actions, safe-area и существующие `aria-label`.

- [ ] **Step 6: Проверить этап**

Run:

```powershell
cd frontend
npm test -- src/theme/visualStyles.test.ts
npm run lint
npm run build
npm run check:bundle
```

Expected: PASS, bundle остаётся в текущем бюджете.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/theme frontend/src/components/ui frontend/src/index.css frontend/src/components/layout/Header.tsx
git commit -m "feat(ui): add unified visual primitives"
```

---

### Task 2: Заменить корневую навигацию и создать хабы

**Files:**
- Create: `frontend/src/components/layout/navigation.ts`
- Create: `frontend/src/components/layout/navigation.test.ts`
- Create: `frontend/src/components/ui/HubLinkCard.tsx`
- Create: `frontend/src/features/help/pages/HelpHubPage.tsx`
- Create: `frontend/src/features/profile/pages/ProfileHubPage.tsx`
- Modify: `frontend/src/components/layout/BottomNavigation.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/MorePage.tsx`
- Modify: `frontend/src/utils/adminAccess.ts`
- Create: `frontend/e2e/root-navigation.spec.ts`

- [ ] **Step 1: Написать падающий unit-тест владения маршрутами**

```ts
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, rootSectionForPath } from "./navigation";

it("defines the approved five roots", () => {
  expect(NAV_ITEMS.map((item) => item.label)).toEqual([
    "Главная", "Упражнения", "Дневник", "Помощь", "Профиль",
  ]);
});

it.each([
  ["/nutrition", "/"],
  ["/programs", "/train"],
  ["/measurements", "/progress"],
  ["/support/42", "/help-center"],
  ["/notifications", "/profile"],
])("maps %s to %s", (path, root) => {
  expect(rootSectionForPath(path)).toBe(root);
});
```

- [ ] **Step 2: Подтвердить падение**

Run: `cd frontend; npm test -- src/components/layout/navigation.test.ts`

Expected: FAIL — новый контракт отсутствует.

- [ ] **Step 3: Реализовать единственную таблицу навигации**

```ts
export type RootRoute = "/" | "/train" | "/progress" | "/help-center" | "/profile";

export const NAV_ITEMS = [
  { to: "/", label: "Главная", icon: "home" },
  { to: "/train", label: "Упражнения", icon: "exercise" },
  { to: "/progress", label: "Дневник", icon: "diary" },
  { to: "/help-center", label: "Помощь", icon: "help" },
  { to: "/profile", label: "Профиль", icon: "profile" },
] as const;
```

`rootSectionForPath` должен использовать явные префиксы из спецификации, чтобы `NavLink` не ошибался на дочерних маршрутах.

- [ ] **Step 4: Пересобрать BottomNavigation**

Убрать внутреннюю залитую плашку активного пункта. Активное состояние: градиентная иконка/текст и тонкая нижняя линия. Общий контейнер компактный, с одним радиусом и safe-area. Desktop использует ту же таблицу.

- [ ] **Step 5: Добавить маршруты и совместимость**

```tsx
<Route path="help-center" element={<HelpHubPage />} />
<Route path="profile" element={<ProfileHubPage />} />
<Route path="profile/settings" element={<ProfilePage />} />
<Route path="more" element={<Navigate to="/profile" replace />} />
```

Старые публичные маршруты не переносить внутрь `Shell`.

- [ ] **Step 6: Наполнить хабы**

- Help: «ИИ-тренер» → `/ai`, «Поддержка» → `/support`, «Помощь и FAQ» → `/faq`.
- Profile: «Настройки профиля» → `/profile/settings`, «Уведомления», «Друзья и соревнования», «Пригласить друга», компактная ссылка на последний замер.
- «Админ» рендерить только если `isAdminUser(profile)` истинно; не рендерить disabled-заглушку.

- [ ] **Step 7: Написать Playwright-проверку**

Проверить пять точных подписей, redirect `/more`, активный root для `/nutrition`, `/programs`, `/measurements`, `/support`, `/notifications`, отсутствие Admin у обычного пользователя и touch targets.

- [ ] **Step 8: Проверить этап**

Run:

```powershell
cd frontend
npm test -- src/components/layout/navigation.test.ts
npx playwright test e2e/root-navigation.spec.ts --project=chromium
npm run lint
npm run build
```

- [ ] **Step 9: Снять локальные кадры**

Сохранить в `frontend/artifacts/unified-ui/navigation/` кадры 393 px dark/light и 1440 px. Эти runtime-артефакты не добавлять в commit.

- [ ] **Step 10: Commit**

```powershell
git add frontend/src/App.tsx frontend/src/components/layout frontend/src/components/ui/HubLinkCard.tsx frontend/src/features/help/pages frontend/src/features/profile/pages frontend/src/pages/MorePage.tsx frontend/src/utils/adminAccess.ts frontend/e2e/root-navigation.spec.ts
git commit -m "feat(navigation): add five-section app shell"
```

---

### Task 3: Пересобрать главную, питание и дневную активность

**Files:**
- Create: `frontend/src/features/home/components/HomeNutritionSummary.tsx`
- Create: `frontend/src/features/home/components/DailyActivityCards.tsx`
- Create: `frontend/src/features/home/components/DailyActivityDialog.tsx`
- Create: `frontend/src/features/home/components/DailyActivityEditor.tsx`
- Create: `frontend/src/features/home/hooks/useDailyActivity.ts`
- Modify: `frontend/src/components/HabitsCheckin.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/utils/habits.ts`
- Modify: `frontend/src/utils/habits.test.ts`
- Modify: `frontend/e2e/activation-checklist.spec.ts`
- Modify: `frontend/e2e/offline-sync-retry.spec.ts`
- Modify: `frontend/e2e/visual-regression.spec.ts`

- [ ] **Step 1: Добавить падающие pure tests для карточек активности**

Расширить `habits.test.ts` контрактом:

```ts
expect(activityCards({ sleep_hours: 7.5, water_ml: 1250, steps: 6200 })).toEqual([
  expect.objectContaining({ id: "sleep", value: "7,5 ч" }),
  expect.objectContaining({ id: "water", value: "1 250 мл" }),
  expect.objectContaining({ id: "steps", value: "6 200" }),
]);
```

Проверить `null`, нулевую воду и локальную дату.

- [ ] **Step 2: Подтвердить падение и реализовать чистое представление**

Run: `cd frontend; npm test -- src/utils/habits.test.ts`

`activityCards` не выполняет запросы и не знает о React; возвращает только текст, progress и semantic status.

- [ ] **Step 3: Извлечь состояние из HabitsCheckin**

`useDailyActivity` переиспользует текущие API, Dexie cache, retry и optimistic/offline sync. Не создавать вторую очередь. `HabitsCheckin` временно становится совместимой оболочкой над новым `DailyActivityEditor`.

- [ ] **Step 4: Реализовать три карточки и доступный dialog**

Карточки сна, воды и шагов открывают один dialog. Dialog имеет `role="dialog"`, `aria-modal="true"`, заголовок, focus trap/restore, Escape и Telegram BackButton. Внутри остаются:

- выбор предыдущего/следующего дня;
- сон;
- шаги;
- активные минуты;
- вода `+250`, `+500`, точный ввод и reset;
- сохранение выбранного локального дня.

- [ ] **Step 5: Добавить насыщенный nutrition summary на Home**

Переиспользовать уже загруженные калории/БЖУ из `HomePage`; переход ведёт на `/nutrition`. Не дублировать запрос `daily nutrition`.

- [ ] **Step 6: E2E сначала должен зафиксировать новое поведение**

В Playwright проверить: карточки видны отдельно; editor открывается с каждой; активные минуты доступны внутри; смена даты не меняет сегодняшний cache; offline save восстанавливается после reconnect.

- [ ] **Step 7: Проверить этап**

Run:

```powershell
cd frontend
npm test -- src/utils/habits.test.ts src/utils/energyTargets.test.ts
npx playwright test e2e/activation-checklist.spec.ts e2e/offline-sync-retry.spec.ts --project=chromium
npm run lint
npm run build
```

- [ ] **Step 8: Снять 320/393/1440 dark/light кадры главной и проверить отсутствие горизонтального scroll**

- [ ] **Step 9: Commit**

```powershell
git add frontend/src/features/home frontend/src/components/HabitsCheckin.tsx frontend/src/pages/HomePage.tsx frontend/src/utils/habits.ts frontend/src/utils/habits.test.ts frontend/e2e/activation-checklist.spec.ts frontend/e2e/offline-sync-retry.spec.ts frontend/e2e/visual-regression.spec.ts
git commit -m "feat(home): add nutrition and daily activity modules"
```

---

### Task 4: Перестроить базу упражнений и медиакарточку

**Files:**
- Create: `frontend/src/utils/muscleGroups.ts`
- Create: `frontend/src/utils/muscleGroups.test.ts`
- Create: `frontend/src/utils/exerciseMediaPresentation.ts`
- Create: `frontend/src/utils/exerciseMediaPresentation.test.ts`
- Create: `frontend/src/features/workout/components/MuscleGroupIcon.tsx`
- Create: `frontend/src/features/workout/components/ExerciseMediaTabs.tsx`
- Create: `frontend/src/features/workout/components/ExerciseHubCards.tsx`
- Modify: `frontend/src/pages/TrainHubPage.tsx`
- Modify: `frontend/src/features/workout/pages/WorkoutCatalogPage.tsx`
- Modify: `frontend/src/features/workout/components/MuscleGroupFilter.tsx`
- Modify: `frontend/src/features/workout/components/ExerciseThumbnail.tsx`
- Modify: `frontend/src/features/workout/components/ExerciseCard.tsx`
- Modify: `frontend/src/features/workout/components/ExerciseDetailModal.tsx`
- Modify: `frontend/src/features/workout/components/ExerciseMediaPlayer.tsx`
- Modify: `frontend/src/utils/exerciseMedia.test.ts`
- Modify: `frontend/e2e/workout-recovery.spec.ts`
- Modify: `frontend/e2e/exercise-explorer.spec.ts`

- [ ] **Step 1: Написать падающие тесты нормализации мышц и media priority**

```ts
expect(normalizeMuscleGroup("грудь")).toBe("chest");
expect(normalizeMuscleGroup("ягодицы")).toBe("glutes");
expect(resolveExercisePreview({ thumbnail_url: "/thumb.png", animation_url: "/move.gif" }))
  .toEqual({ kind: "image", src: "/thumb.png" });
expect(resolveExercisePreview({ thumbnail_url: null, animation_url: "/move.gif" }))
  .toEqual({ kind: "animation-frame", src: "/move.gif" });
```

Fallback без медиа должен возвращать `kind: "anatomy"` с нормализованной группой, а не первую букву.

- [ ] **Step 2: Подтвердить падение и реализовать utilities**

Run: `cd frontend; npm test -- src/utils/muscleGroups.test.ts src/utils/exerciseMediaPresentation.test.ts`

- [ ] **Step 3: Создать локальные SVG-анатомические иконки**

`MuscleGroupIcon` принимает `group`, `side` и `className`. Поддержать ноги, спину, ягодицы, плечи, грудь, бицепс, трицепс, пресс, кардио, кор и мобильность. Не использовать буквы как fallback; неизвестная группа получает нейтральный силуэт.

- [ ] **Step 4: Обновить корневой экран Упражнений**

Точные названия: «Программы тренировок» и «База упражнений». Удалить standalone «Недавние» и связанное локальное состояние из `TrainHubPage`; история остаётся доступной в контексте поиска/прогресса, если нужна существующему API.

- [ ] **Step 5: Обновить карточки каталога**

Каждая карточка использует `ExerciseThumbnail` с приоритетом thumbnail → первый кадр GIF → anatomy. Изображение получает фиксированное соотношение сторон и `object-fit`, текст не прыгает после загрузки.

- [ ] **Step 6: Разделить детальное медиа на вкладки**

```ts
type ExerciseMediaTab = "photo" | "animation" | "video";
```

- Фото показывает `thumbnail_url` или анатомический fallback.
- Анимация показывает существующий GIF и credit.
- Видео использует существующий `video_url`, нативные controls/звук только по действию пользователя; если URL нет — «Видео пока нет».

Не включать autoplay со звуком. Сохранить YouTube no-cookie и Gym Visual attribution.

- [ ] **Step 7: E2E**

Проверить отсутствие буквенных плиток, уникальные превью двух разных упражнений, вкладки media, состояние «Видео пока нет», focus management modal и прежний запуск тренировки.

- [ ] **Step 8: Проверить этап**

Run:

```powershell
cd frontend
npm test -- src/utils/muscleGroups.test.ts src/utils/exerciseMediaPresentation.test.ts src/utils/exerciseMedia.test.ts
npx playwright test e2e/workout-recovery.spec.ts e2e/exercise-explorer.spec.ts --project=chromium
npm run lint
npm run build
npm run check:bundle
```

- [ ] **Step 9: Commit**

```powershell
git add frontend/src/pages/TrainHubPage.tsx frontend/src/features/workout frontend/src/utils/muscleGroups* frontend/src/utils/exerciseMedia* frontend/e2e/workout-recovery.spec.ts frontend/e2e/exercise-explorer.spec.ts
git commit -m "feat(exercises): redesign catalog and media cards"
```

---

### Task 5: Улучшить карточки программ тренировок

**Files:**
- Create: `frontend/src/utils/programMuscles.ts`
- Create: `frontend/src/utils/programMuscles.test.ts`
- Create: `frontend/src/features/workout/components/ProgramMuscleMap.tsx`
- Create: `frontend/src/features/workout/components/ProgramOverviewCard.tsx`
- Modify: `frontend/src/features/workout/pages/ProgramsPage.tsx`
- Modify: `frontend/src/pages/TrainHubPage.tsx`
- Modify: `frontend/e2e/cycle-training.spec.ts`
- Modify: `frontend/e2e/workout-schedule.spec.ts`

- [ ] **Step 1: Написать падающий тест извлечения мышечных групп программы**

```ts
expect(programMuscles(program, exerciseById)).toEqual([
  { group: "legs", exerciseCount: 4 },
  { group: "glutes", exerciseCount: 2 },
]);
```

Дедуплицировать упражнения между днями, игнорировать неизвестные id и сортировать по количеству упражнений, затем по стабильному порядку групп.

- [ ] **Step 2: Подтвердить падение и реализовать utility**

Run: `cd frontend; npm test -- src/utils/programMuscles.test.ts`

- [ ] **Step 3: Извлечь компактную карточку программы**

`ProgramOverviewCard` показывает цель, уровень, длительность, дни в неделю, оборудование, совместимость и `ProgramMuscleMap`. Использовать существующие `programDuration`, `programCompatibility` и каталог упражнений; не копировать их формулы.

- [ ] **Step 4: Сохранить текущие сценарии**

Запуск, preview дня, ограничения профиля, выбор даты и расписание работают как раньше. В огромный `ProgramsPage.tsx` добавлять только композицию извлечённых компонентов.

- [ ] **Step 5: Проверить этап**

Run:

```powershell
cd frontend
npm test -- src/utils/programMuscles.test.ts src/utils/programDuration.test.ts src/utils/programCompatibility.test.ts src/utils/programRecommend.test.ts
npx playwright test e2e/cycle-training.spec.ts e2e/workout-schedule.spec.ts --project=chromium
npm run lint
npm run build
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/utils/programMuscles* frontend/src/features/workout/components/Program* frontend/src/features/workout/pages/ProgramsPage.tsx frontend/src/pages/TrainHubPage.tsx frontend/e2e/cycle-training.spec.ts frontend/e2e/workout-schedule.spec.ts
git commit -m "feat(programs): show training focus and muscle groups"
```

---

### Task 6: Провести доказательный аудит аналитики дневника

**Files:**
- Modify: `backend/tests/test_progress_dashboard.py`
- Modify if tests prove defect: `backend/app/services/progress_dashboard.py`
- Modify if contract defect exists: `backend/app/schemas/workout.py`
- Modify if route defect exists: `backend/app/routers/workouts.py`
- Modify: `frontend/src/utils/personalDashboard.test.ts`
- Modify if tests prove defect: `frontend/src/utils/personalDashboard.ts`
- Modify: `frontend/src/utils/weeklyOverview.test.ts`
- Modify if tests prove defect: `frontend/src/utils/weeklyOverview.ts`
- Modify: `frontend/src/utils/wellnessChart.test.ts`
- Modify if tests prove defect: `frontend/src/utils/wellnessChart.ts`
- Modify: `frontend/src/features/progress/pages/PersonalDashboardCard.tsx`

- [ ] **Step 1: Зафиксировать дефекты тестами до исправления**

Добавить backend cases:

- завершённые и незавершённые sets не смешиваются;
- отменённые workouts не входят в adherence/load;
- все запросы ограничены `user_id`;
- границы недель/месяцев включают нужный локальный день один раз;
- пустой предыдущий период не превращает delta в ложные 100%;
- объём и muscle distribution используют один и тот же набор завершённых sets.

Добавить frontend cases: Basic ids и Advanced ids не пересекаются полностью; missing/null series даёт empty state, а не нулевую «динамику».

- [ ] **Step 2: Запустить тесты и записать конкретные падения**

Run:

```powershell
cd backend
python -m pytest tests/test_progress_dashboard.py -q
cd ..\frontend
npm test -- src/utils/personalDashboard.test.ts src/utils/weeklyOverview.test.ts src/utils/wellnessChart.test.ts
```

Expected: хотя бы тест различия Basic/Advanced должен падать на текущем одинаковом представлении; backend менять только для реально упавших расчётов.

- [ ] **Step 3: Для каждого падения применить systematic debugging**

Проследить путь `API response → frontend normalization → rendered section`. Исправлять первопричину в service или pure utility, не маскировать её в JSX. Не менять response schema без отдельного contract test.

- [ ] **Step 4: Определить явные режимы**

```ts
export const BASIC_DIARY_SECTIONS = ["adherence", "calendar", "wellness", "measurements"] as const;
export const ADVANCED_DIARY_SECTIONS = ["training-load", "muscle-balance", "strength", "nutrition", "recovery"] as const;
```

`PersonalDashboardCard` управляет периодом и режимом, но не рендерит одну и ту же коллекцию в обеих вкладках.

- [ ] **Step 5: Проверить исправления и regression-набор**

Run:

```powershell
cd backend
python -m pytest tests/test_progress_dashboard.py tests/test_strength_trends.py tests/test_exercise_progress.py tests/test_daily_metrics.py tests/test_nutrition_kbju.py tests/test_personal_regularity.py -q
cd ..\frontend
npm test -- src/utils/personalDashboard.test.ts src/utils/weeklyOverview.test.ts src/utils/wellnessChart.test.ts src/utils/progress.test.ts src/utils/strengthProgress.test.ts
```

- [ ] **Step 6: Commit только доказанные изменения**

```powershell
git add backend/app/services/progress_dashboard.py backend/app/schemas/workout.py backend/app/routers/workouts.py backend/tests/test_progress_dashboard.py frontend/src/utils/personalDashboard* frontend/src/utils/weeklyOverview* frontend/src/utils/wellnessChart* frontend/src/features/progress/pages/PersonalDashboardCard.tsx
git commit -m "fix(progress): correct diary analytics"
```

Если backend-файлы не менялись, не добавлять их в commit.

---

### Task 7: Собрать полноценный раздел «Дневник»

**Files:**
- Create: `frontend/src/features/progress/pages/DiaryBasicView.tsx`
- Create: `frontend/src/features/progress/pages/DiaryAdvancedView.tsx`
- Create: `frontend/src/features/progress/components/DiaryModeTabs.tsx`
- Modify: `frontend/src/features/progress/pages/ProgressPage.tsx`
- Modify: `frontend/src/features/progress/pages/BodyMeasurementsSummary.tsx`
- Modify: `frontend/src/features/measurements/pages/MeasurementsPage.tsx`
- Modify: `frontend/e2e/personal-dashboard.spec.ts`
- Modify: `frontend/e2e/body-measurements.spec.ts`
- Modify: `frontend/e2e/strength-trends.spec.ts`
- Create: `frontend/e2e/diary.spec.ts`

- [ ] **Step 1: Написать E2E, который сначала падает**

Проверить точный title «Дневник», вкладки «Основное»/«Расширенно», разные наборы headings и переход из блока замеров на `/measurements` с сохранением активного root «Дневник».

- [ ] **Step 2: Подтвердить падение**

Run: `cd frontend; npx playwright test e2e/diary.spec.ts --project=chromium`

- [ ] **Step 3: Извлечь два представления из ProgressPage**

`DiaryBasicView` композирует adherence, calendar/history, weekly sleep/steps/activity и `BodyMeasurementsSummary`.

`DiaryAdvancedView` композирует training load, muscle balance, strength trends, nutrition adherence и recovery correlation. Компоненты не запрашивают один endpoint повторно: данные загружаются на уровне `ProgressPage` и передаются props.

- [ ] **Step 4: Встроить замеры в дневник**

Показывать последний вес/обхваты и явный переход в полный датированный журнал. Полный CRUD и offline queue остаются в существующем `MeasurementsPage`.

- [ ] **Step 5: Проверить empty/loading/error states**

Каждый модуль использует `PageSkeleton` или `StatusNotice`; отсутствие данных не изображается как нулевой результат.

- [ ] **Step 6: Проверить этап**

Run:

```powershell
cd frontend
npx playwright test e2e/diary.spec.ts e2e/personal-dashboard.spec.ts e2e/body-measurements.spec.ts e2e/strength-trends.spec.ts --project=chromium
npm run lint
npm run build
npm run check:bundle
```

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/progress frontend/src/features/measurements/pages/MeasurementsPage.tsx frontend/e2e/diary.spec.ts frontend/e2e/personal-dashboard.spec.ts frontend/e2e/body-measurements.spec.ts frontend/e2e/strength-trends.spec.ts
git commit -m "feat(diary): separate basic and advanced insights"
```

---

### Task 8: Перевести ежедневные и профильные формы на единую систему

**Files:**
- Modify: `frontend/src/features/nutrition/pages/DailyLog.tsx`
- Modify: `frontend/src/features/nutrition/components/MealNutritionSummary.tsx`
- Modify: `frontend/src/features/nutrition/components/BarcodeScannerModal.tsx`
- Modify: `frontend/src/features/nutrition/components/NutritionLabelCameraModal.tsx`
- Modify: `frontend/src/features/onboarding/pages/OnboardingPage.tsx`
- Modify: `frontend/src/features/onboarding/components/ActivationChecklistCard.tsx`
- Modify: `frontend/src/features/profile/pages/ProfilePage.tsx`
- Modify: `frontend/src/features/profile/components/CycleTrainingSettings.tsx`
- Modify: `frontend/src/features/profile/components/LinkEmailCard.tsx`
- Modify: `frontend/src/features/profile/components/ServiceMessageConsentCard.tsx`
- Modify: `frontend/src/features/profile/components/WorkoutReminderSettings.tsx`
- Modify: `frontend/src/features/notifications/pages/NotificationSettingsPage.tsx`
- Modify: `frontend/src/features/notifications/components/NotificationDeliveryCard.tsx`
- Modify: `frontend/src/features/notifications/components/NotificationCategories.tsx`
- Modify: `frontend/src/features/theme/ThemeSelector.tsx`
- Modify: `frontend/e2e/nutrition-label.spec.ts`
- Modify: `frontend/e2e/onboarding.spec.ts`
- Modify: `frontend/e2e/notification-settings.spec.ts`
- Modify: `frontend/e2e/theme.spec.ts`

- [ ] **Step 1: Добавить визуальные assertions до правок**

В существующих E2E проверять semantic classes `app-card`, `app-field`, `app-button` на главных модулях, отсутствие зелёного brand-action и доступные названия dialog.

- [ ] **Step 2: Подтвердить падение целевых E2E**

Run: `cd frontend; npx playwright test e2e/nutrition-label.spec.ts e2e/onboarding.spec.ts e2e/notification-settings.spec.ts e2e/theme.spec.ts --project=chromium`

- [ ] **Step 3: Перевести Nutrition и Onboarding**

Заменять повторяющиеся наборы classes на примитивы, не изменяя barcode/photo/manual flow, OCR contract, onboarding draft и checklist storage.

- [ ] **Step 4: Перевести Profile settings и Notifications**

`ProfilePage` остаётся по `/profile/settings`; новые блоки выносить, если изменение добавляет более 80 строк. Сохранить schedule, quiet hours, browser/Telegram delivery и cycle privacy.

- [ ] **Step 5: Проверить этап**

Run:

```powershell
cd frontend
npx playwright test e2e/nutrition-label.spec.ts e2e/onboarding.spec.ts e2e/onboarding-equipment.spec.ts e2e/notification-settings.spec.ts e2e/theme.spec.ts --project=chromium
npm run lint
npm run build
npm run check:bundle
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/nutrition frontend/src/features/onboarding frontend/src/features/profile frontend/src/features/notifications frontend/src/features/theme frontend/e2e/nutrition-label.spec.ts frontend/e2e/onboarding*.spec.ts frontend/e2e/notification-settings.spec.ts frontend/e2e/theme.spec.ts
git commit -m "feat(ui): unify daily and profile forms"
```

---

### Task 9: Перевести тренировку, помощь и социальные модули

**Files:**
- Modify: `frontend/src/features/workout/pages/ActiveWorkout.tsx`
- Modify: `frontend/src/features/workout/components/AddSetModal.tsx`
- Modify: `frontend/src/features/workout/components/PreWorkoutReadinessDialog.tsx`
- Modify: `frontend/src/features/workout/components/RestTimer.tsx`
- Modify: `frontend/src/features/workout/components/WarmupPanel.tsx`
- Modify: `frontend/src/features/workout/components/PlannedWorkoutEditor.tsx`
- Modify: `frontend/src/features/ai-chat/pages/Chat.tsx`
- Modify: `frontend/src/features/support/pages/SupportPage.tsx`
- Modify: `frontend/src/features/support/pages/SupportTicketPage.tsx`
- Modify: `frontend/src/features/help/HelpFaqPage.tsx`
- Modify: `frontend/src/pages/HelpPage.tsx`
- Modify: `frontend/src/pages/KnowledgeBasePage.tsx`
- Modify: `frontend/src/features/social/pages/SocialPage.tsx`
- Modify: `frontend/src/features/social/components/CompetitionBuilder.tsx`
- Modify: `frontend/src/features/social/components/CompetitionCard.tsx`
- Modify: `frontend/src/features/social/components/GlobalSeasonCard.tsx`
- Modify: `frontend/src/features/invites/pages/InvitePage.tsx`
- Modify: `frontend/e2e/workout-recovery.spec.ts`
- Modify: `frontend/e2e/auto-advance.spec.ts`
- Modify: `frontend/e2e/support.spec.ts`
- Modify: `frontend/e2e/faq.spec.ts`
- Modify: `frontend/e2e/invites.spec.ts`
- Modify: `frontend/e2e/regularity.spec.ts`

- [ ] **Step 1: Сначала расширить E2E assertions**

Проверить semantic surfaces и buttons в active workout, timer, AI, support, FAQ, invite и competitions; dialog сохраняют role/name/Escape/focus.

- [ ] **Step 2: Подтвердить падение**

Run: `cd frontend; npx playwright test e2e/workout-recovery.spec.ts e2e/support.spec.ts e2e/faq.spec.ts e2e/invites.spec.ts e2e/regularity.spec.ts --project=chromium`

- [ ] **Step 3: Перевести Active Workout без изменения session state**

Не менять `workoutSession`, auto-advance, таймеры, Telegram MainButton и recovery из IndexedDB. Визуальные элементы переводить небольшими группами: session header, exercise card, set rows, timer/dialogs.

- [ ] **Step 4: Перевести Help/AI/Support**

Help hub остаётся владельцем root highlight; публичные FAQ/Knowledge сохраняют standalone shell. Ответ ИИ по-прежнему не вставляется через `dangerouslySetInnerHTML`.

- [ ] **Step 5: Перевести Social/Invite**

Сохранить consent/privacy, invite deep link, manual code, competition boundaries и global cohort threshold.

- [ ] **Step 6: Проверить этап**

Run:

```powershell
cd frontend
npx playwright test e2e/workout-recovery.spec.ts e2e/auto-advance.spec.ts e2e/support.spec.ts e2e/faq.spec.ts e2e/invites.spec.ts e2e/regularity.spec.ts --project=chromium
npm run lint
npm run build
npm run check:bundle
```

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/workout frontend/src/features/ai-chat frontend/src/features/support frontend/src/features/help frontend/src/features/social frontend/src/features/invites frontend/src/pages/HelpPage.tsx frontend/src/pages/KnowledgeBasePage.tsx frontend/e2e
git commit -m "feat(ui): unify workout help and social modules"
```

---

### Task 10: Перевести admin, auth и глобальные состояния

**Files:**
- Create: `frontend/scripts/check-visual-system.mjs`
- Modify: `frontend/package.json`
- Modify: `frontend/src/pages/AdminPage.tsx`
- Modify: `frontend/src/features/admin-audit/**`
- Modify: `frontend/src/features/admin-broadcasts/**`
- Modify: `frontend/src/features/admin-exercises/**`
- Modify: `frontend/src/features/admin-filters/**`
- Modify: `frontend/src/features/admin-programs/**`
- Modify: `frontend/src/features/admin-support/**`
- Modify: `frontend/src/features/admin-system/**`
- Modify: `frontend/src/features/admin-user/**`
- Modify: `frontend/src/components/EmailLoginForm.tsx`
- Modify: `frontend/src/components/TelegramBrowserLogin.tsx`
- Modify: `frontend/src/components/OfflineBanner.tsx`
- Modify: `frontend/src/components/ui/ToastHost.tsx`
- Modify: `frontend/src/components/ui/CollapsibleFilterPanel.tsx`
- Modify: `frontend/src/components/ui/TimeSlotsEditor.tsx`
- Modify: `frontend/e2e/admin-*.spec.ts`
- Modify: `frontend/e2e/browser-session.spec.ts`
- Modify: `frontend/e2e/telegram-browser-login.spec.ts`

- [ ] **Step 1: Создать падающую статическую проверку визуальной системы**

`check-visual-system.mjs` сканирует runtime TSX/CSS и запрещает новые прямые brand-цвета и прежние signal/lime classes вне короткого документированного allowlist для success states.

```js
const forbidden = [/text-lime-/g, /bg-lime-/g, /app-signal(?!-success)/g];
```

Добавить script `"check:visual": "node ./scripts/check-visual-system.mjs"`.

- [ ] **Step 2: Запустить проверку и сохранить список legacy-мест**

Run: `cd frontend; npm run check:visual`

Expected: FAIL со списком ещё не переведённых production-файлов.

- [ ] **Step 3: Перевести админские surfaces без изменения permissions/actions**

Сохранить подтверждения опасных действий, audit append-only semantics, broadcast preview/progress, media preflight и user export allowlist. Admin link виден только администратору и остаётся внутри root «Профиль».

- [ ] **Step 4: Перевести auth и глобальные состояния**

Login, offline banner, toast, filters и time slots используют семантические variants; error/warning/success визуально различимы и не используют brand gradient как статус.

- [ ] **Step 5: Проверить этап**

Run:

```powershell
cd frontend
npm run check:visual
npx playwright test e2e/admin-audit.spec.ts e2e/admin-broadcasts.spec.ts e2e/admin-exercises.spec.ts e2e/admin-programs.spec.ts e2e/admin-system.spec.ts e2e/admin-user.spec.ts e2e/browser-session.spec.ts e2e/telegram-browser-login.spec.ts --project=chromium
npm run lint
npm run build
npm run check:bundle
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/scripts/check-visual-system.mjs frontend/package.json frontend/src/pages/AdminPage.tsx frontend/src/features/admin-* frontend/src/components frontend/e2e/admin-*.spec.ts frontend/e2e/browser-session.spec.ts frontend/e2e/telegram-browser-login.spec.ts
git commit -m "feat(ui): finish unified visual migration"
```

---

### Task 11: Полная проверка, документация и локальная приёмка

**Files:**
- Modify: `frontend/e2e/accessibility.spec.ts`
- Modify: `frontend/e2e/iphone-layout.spec.ts`
- Modify: `frontend/e2e/visual-regression.spec.ts`
- Modify: `frontend/e2e/__screenshots__/**`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/ADMIN_GUIDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Обновить visual matrix**

Зафиксировать ключевые экраны:

- root navigation, Home, Exercises, exercise detail, Programs, Diary Basic/Advanced, Help hub, Profile hub;
- 320 px и 393 px dark/light;
- 1440 px desktop dark/light;
- iPhone safe-area и low-height viewport.

- [ ] **Step 2: Запустить unit/backend проверки**

Run:

```powershell
cd backend
python -m pytest -q
cd ..\frontend
npm test
```

Expected: полный зелёный набор.

- [ ] **Step 3: Запустить frontend quality gates**

Run:

```powershell
cd frontend
npm run lint
npm run build
npm run check:bundle
npm run check:visual
npx playwright test --project=chromium
npx playwright test e2e/critical-path.spec.ts e2e/iphone-layout.spec.ts e2e/accessibility.spec.ts --project=iphone-webkit
```

- [ ] **Step 4: Ручная локальная проверка**

Запустить `dev-local.cmd`, сообщить текущий commit hash и адреса. Проверить:

- `http://127.0.0.1:5173` на рабочем компьютере;
- `http://<LAN-IP>:5173` на телефоне в одной Wi-Fi сети;
- console/network без неожиданных ошибок;
- все пять root tabs и дочерние маршруты;
- обе темы и offline/reconnect.

Сохранить screenshots в `frontend/artifacts/unified-ui/final/`; не коммитить runtime-артефакты.

- [ ] **Step 5: Обновить документацию**

`USER_GUIDE` описывает новую карту разделов и расположение функций. `ADMIN_GUIDE` указывает путь через «Профиль». `AGENTS.md` обновляет фактическую route map и компоненты.

- [ ] **Step 6: Commit**

```powershell
git add frontend/e2e/accessibility.spec.ts frontend/e2e/iphone-layout.spec.ts frontend/e2e/visual-regression.spec.ts frontend/e2e/__screenshots__ docs/USER_GUIDE.md docs/ADMIN_GUIDE.md AGENTS.md
git commit -m "docs: finalize unified app experience"
```

- [ ] **Step 7: Получить локальное подтверждение владельца перед production**

Не переходить к Task 12, пока владелец не подтвердит текущий локальный commit.

---

### Task 12: Опубликовать подтверждённый commit в production

**Files:**
- No source changes expected.
- Operational guide: `docs/TIMEWEB_DOMAIN_CUTOVER.md`

- [ ] **Step 1: Применить verification-before-completion**

Проверить чистоту source diff, зафиксированный hash и результаты Task 11. Пользовательские runtime-артефакты не включать в push.

- [ ] **Step 2: Push production branch**

Run: `git push origin timeweb-production-20260825`

- [ ] **Step 3: Выполнить production backup и update строго по runbook**

На VPS в `/opt/fitness/source`: backup, `git pull --ff-only`, rebuild, migrations и `docker compose up -d` командами из раздела «Обновление приложения».

- [ ] **Step 4: Проверить production**

- Compose services healthy.
- `https://api.filfitclub.ru/health` отвечает success.
- `https://app.filfitclub.ru` отдаёт новый build.
- Telegram Mini App открывает подтверждённую навигацию.
- Critical path: login, home, exercise catalog, active workout recovery, nutrition, diary, help, profile.

- [ ] **Step 5: Зафиксировать deploy hash и результат smoke**

При ошибке использовать rollback из runbook; не исправлять production вручную вне Git.
