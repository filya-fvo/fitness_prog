import { expect, test, type Page } from "@playwright/test";

async function populatedScreens(page: Page, theme: string) {
  await page.clock.install({ time: new Date("2026-10-02T10:00:00+03:00") });
  await page.addInitScript((preference) => {
    localStorage.setItem("fitness_jwt", "design-e2e");
    localStorage.setItem("fitness_theme_preference", preference);
  }, theme);
  let advanced = false;
  await page.route("**/users/me", async (route) => {
    if (route.request().method() === "PUT") {
      advanced = route.request().postDataJSON().goals?.advanced_analytics_enabled === true;
    }
    await route.fulfill({ json: {
      id: "81818181-8181-4181-8181-818181818181", telegram_id: null,
      username: "design-qa", auth_email: null, anthropometry: {},
      goals: { onboarding_completed: true, primary_goal: "lose_fat", level: "advanced", advanced_analytics_enabled: advanced },
      subscription: { tier: "plus", active: true, sources: ["qa"], valid_until: null },
      subscription_status: "plus", stars_balance: 0, onboarding_completed: true,
    } });
  });
  const fixtures: Record<string, unknown> = {
    "workouts/history**": { items: [], total: 0 },
    "exercises?**": { items: [], total: 0, page: 1, page_size: 200 },
    "workouts/regularity**": {
      period_start: "2026-09-05", period_end: "2026-10-02", has_schedule: true,
      completed: 6, planned: 8, rescheduled_completed: 0, cancelled: 0, missed: 2, completion_pct: 75,
    },
    "workouts/dashboard**": {
      period_start: "2026-09-05", period_end: "2026-10-02", period_days: 28,
      previous_period_start: "2026-08-08", previous_period_end: "2026-09-04",
      current: { completed_workouts: 6, active_days: 6, completed_sets: 124, planned_sets: 127, volume_kg: 103700, average_rpe: 6.7, rpe_workouts: 6 },
      previous: { completed_workouts: 11, active_days: 11, completed_sets: 226, planned_sets: 230, volume_kg: 176174.8, average_rpe: 7, rpe_workouts: 11 },
      weeks: [{ week_start: "2026-09-28", week_end: "2026-10-04", completed_workouts: 2, completed_sets: 30, planned_sets: 32, volume_kg: 25200 }],
      muscle_groups: [{ muscle_group: "ноги", completed_sets: 53, exercises: 12, volume_kg: 60000 }, { muscle_group: "спина", completed_sets: 27, exercises: 4, volume_kg: 25000 }],
      lifetime_completed_workouts: 6, lifetime_completed_sets: 124,
    },
    "metrics/range**": { start: "2026-09-02", end: "2026-10-02", days: [
      { date: "2026-09-29", sleep_minutes: 424, active_minutes: 164, sources: {} },
      { date: "2026-10-01", sleep_minutes: 425, active_minutes: null, sources: {} },
    ] },
    "nutrition/range**": { start: "2026-09-02", end: "2026-10-02", daily_target_calories: 1938, days: [
      { date: "2026-09-29", calories: 2210, target_calories: 1938, has_logs: true },
      { date: "2026-10-01", calories: 1953, target_calories: 1938, has_logs: true },
      { date: "2026-10-02", calories: 571, target_calories: 1938, has_logs: true },
    ] },
    "exercises/strength-trends": { period_start: "2026-08-08", period_end: "2026-10-02", period_days: 56, next_workout: null, best_improvements: [], pinned: [] },
    "measurements/analytics**": { months: 3, start: "2026-07-02", end: "2026-10-02", primary_goal: "lose_fat", items: [
      ["weight_kg", 106.9, 108, 90, "Значение стало ближе к заданной цели"],
      ["chest_cm", 116, 116, null, "Без изменения за выбранный период"],
      ["waist_cm", 94, 99, null, "Изменение показано без оценки результата"],
      ["hips_cm", 111, 113.5, null, "Изменение показано без оценки результата"],
    ].map(([field, latest, base, target, interpretation]) => ({
      field, points: 7, baseline_value: base, baseline_date: "2026-08-24", latest_value: latest, latest_date: "2026-09-29",
      delta: Number((Number(latest) - Number(base)).toFixed(1)), percent_change: 0, target_value: target, target_gap: target ? 16.9 : null, interpretation,
    })) },
    "measurements/range**": { start: "2025-10-02", end: "2026-10-02", items: [
      { date: "2026-08-24", weight_kg: 108, waist_cm: 99, chest_cm: 116, sources: {} },
      { date: "2026-09-11", weight_kg: 107.8, waist_cm: 96, chest_cm: 116, sources: {} },
      { date: "2026-09-29", weight_kg: 106.9, neck_cm: 41, shoulders_cm: 138, waist_cm: 94, chest_cm: 116, sources: {} },
    ] },
    "ai/history**": { session_id: null, messages: [] },
    "ai/chat": { session_id: "11111111-1111-4111-8111-111111111111", reply: "Начните с лёгкого движения и разминки суставов.", source: "rule" },
  };
  for (const [endpoint, json] of Object.entries(fixtures)) {
    await page.route(`**/${endpoint}`, (route) => route.fulfill({ json }));
  }
  await page.route("**/measurements/daily**", (route) => route.fulfill({ json: {
    date: new URL(route.request().url()).searchParams.get("date"), sources: {},
  } }));
}

async function contained(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

for (const width of [320, 375, 393, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`content screens at ${width}px ${theme}`, async ({ page }, testInfo) => {
      test.skip(test.info().project.use.isMobile === true && width === 1440, "Desktop layout uses the desktop browser project");
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await populatedScreens(page, theme);
      const shot = async (name: string, fullPage = false) => page.screenshot({
        path: testInfo.outputPath(`${name}-${width}-${theme}-${testInfo.project.name}.png`), fullPage,
      });

      await page.goto("/help-center");
      await expect(page.locator(".help-feature-action")).toHaveCount(3);
      await page.getByRole("button", { name: "Закрыть сообщение о PLUS" }).click();
      const actions = await page.locator(".help-feature-action").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
      expect(actions).toHaveLength(3);
      expect(Math.max(...actions) - Math.min(...actions)).toBeLessThan(1);
      await contained(page);
      await shot("help", true);

      await page.goto("/faq");
      await expect(page.locator(".faq-topic")).toHaveCount(6);
      const topicWidths = await page.getByRole("button", { name: /^(Всё|Первый запуск|Тренировки|Питание|Прогресс|Уведомления)$/ }).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
      expect(topicWidths).toHaveLength(6);
      expect(Math.max(...topicWidths) - Math.min(...topicWidths)).toBeLessThan(1);
      await page.getByRole("button", { name: "Тренировки", exact: true }).click();
      await expect(page.getByRole("button", { name: "Тренировки", exact: true })).toHaveAttribute("aria-pressed", "true");
      await contained(page);
      await shot("faq");

      await page.goto("/progress");
      await expect(page.getByRole("progressbar", { name: "Выполнение плана" })).toHaveAttribute("aria-valuenow", "75");
      const dayColors = await page.getByLabel("Тренировки на этой неделе", { exact: true }).locator("span[aria-label]").evaluateAll((dots) => dots.map((dot) => getComputedStyle(dot).backgroundColor));
      expect(dayColors).toHaveLength(7);
      for (const color of dayColors) {
        expect(color).not.toBe("transparent");
        expect(color).not.toBe("rgba(0, 0, 0, 0)");
      }
      const title = (await page.getByRole("heading", { name: "Дневник", exact: true }).boundingBox())!;
      const calendar = page.getByRole("link", { name: "Перейти к календарю тренировок" });
      const button = (await calendar.boundingBox())!;
      expect(Math.abs(title.y + title.height / 2 - button.y - button.height / 2)).toBeLessThan(1);
      expect(button.width).toBe(44);
      expect(button.x + button.width).toBeLessThanOrEqual(width - 16);
      // Check the glyph as well as its touch target: a centred button can still
      // contain a displaced SVG on a phone.
      const icon = (await calendar.locator("svg").boundingBox())!;
      expect(icon.width).toBe(20);
      expect(icon.height).toBe(20);
      expect(Math.abs(icon.x + icon.width / 2 - button.x - button.width / 2)).toBeLessThan(0.5);
      expect(Math.abs(icon.y + icon.height / 2 - button.y - button.height / 2)).toBeLessThan(0.5);
      await contained(page);
      await shot("diary");
      await calendar.click();
      await expect(page).toHaveURL(/#diary-calendar$/);
      await expect(page.getByRole("heading", { name: "Календарь тренировок" })).toBeInViewport();
      await page.getByRole("button", { name: "Расширенно" }).click();
      await expect(page.getByRole("heading", { name: "Нагрузка и восстановление", exact: true })).toBeVisible();
      await expect(page.getByText("103,7 т", { exact: true })).toBeVisible();
      const missingColors = await page.locator(".diary-missing-marker").evaluateAll((markers) => markers.map((marker) => getComputedStyle(marker).backgroundColor));
      expect(missingColors.length).toBeGreaterThan(0);
      for (const color of missingColors) {
        expect(color).not.toBe("transparent");
        expect(color).not.toBe("rgba(0, 0, 0, 0)");
      }
      await contained(page);
      await shot("diary-full", true);

      await page.goto("/measurements");
      await expect(page.getByText("новый замер", { exact: true })).toBeVisible();
      const weight = page.getByLabel("Вес, кг", { exact: false });
      await weight.fill("106,9");
      await expect(weight).toHaveValue("106,9");
      expect(await weight.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      await contained(page);
      await shot("measurements", true);

      await page.goto("/ai");
      await expect(page.getByRole("button", { name: "Почему болят колени?" })).toBeEnabled();
      const composer = page.getByRole("textbox", { name: "Сообщение тренеру" });
      const welcome = (await page.getByText(/Привет! Я локальный ИИ-тренер/).boundingBox())!;
      const form = (await page.locator(".coach-composer").boundingBox())!;
      expect(form.y).toBeGreaterThanOrEqual(welcome.y + welcome.height);
      await composer.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const composerBounds = (await composer.boundingBox())!;
      const nav = (await page.getByRole("navigation", { name: "Основная навигация" }).boundingBox())!;
      if (width < 1024) expect(composerBounds.y + composerBounds.height).toBeLessThan(nav.y);
      await contained(page);
      await shot("coach");
      await composer.fill("Как разминаться?");
      await page.getByRole("button", { name: "Отправить сообщение" }).click();
      await expect(page.getByText("Начните с лёгкого движения и разминки суставов.", { exact: false })).toBeVisible();
    });
  }
}
