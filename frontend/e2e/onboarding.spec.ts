import { expect, test } from "@playwright/test";

const USER_ID = "84444444-4444-4444-8444-444444444444";

test("onboarding requires explicit choices, supports unspecified sex and allows going back", async ({ page }) => {
  let savedProfile: Record<string, unknown> | null = null;

  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", async (route) => {
    if (route.request().method() === "PUT") {
      savedProfile = route.request().postDataJSON() as Record<string, unknown>;
      const body = savedProfile;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: USER_ID,
          telegram_id: null,
          username: "new-user",
          auth_email: null,
          anthropometry: body.anthropometry ?? {},
          goals: body.goals ?? {},
          subscription_status: "free",
          stars_balance: 0,
          onboarding_completed: true,
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
        telegram_id: null,
        username: "new-user",
        auth_email: null,
        anthropometry: {},
        goals: {},
        subscription_status: "free",
        stars_balance: 0,
        onboarding_completed: false,
      }),
    });
  });
  await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));

  await page.goto("/onboarding");

  const next = page.getByRole("button", { name: "Далее" });
  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "Поддержание" }).click();
  await expect(next).toBeEnabled();
  await next.click();

  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "Новичок (только начинаю)" }).click();
  await next.click();

  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "Фитнес-зал" }).click();
  await next.click();

  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "Тренажёры" }).click();
  await next.click();

  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "3 дн./нед." }).click();
  await next.click();

  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "Не указывать" }).click();
  await page.getByLabel("Цель калорий на день").fill("2100");
  await page.getByRole("textbox", { name: "Вес, кг", exact: true }).fill("70");
  await page.getByLabel("Рост, см").fill("170");
  await page.getByLabel("Возраст (если нет даты рождения)").fill("30");
  await page.getByLabel("Активность").selectOption("moderate");
  await expect(next).toBeEnabled();
  await next.click();

  const back = page.getByRole("button", { name: "Назад" });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.getByLabel("Цель калорий на день")).toHaveValue("2100");
  await page.getByLabel("Цель калорий на день").fill("2200");
  await next.click();

  await page.getByRole("button", { name: "Завершить" }).click();
  await expect.poll(() => savedProfile).not.toBeNull();

  const payload = savedProfile as {
    anthropometry?: Record<string, unknown>;
    goals?: Record<string, unknown>;
  };
  expect(payload.anthropometry?.sex).toBe("unspecified");
  expect(payload.goals?.manual_calorie_target).toBe(2200);
  expect(payload.goals?.active_program_id).toBeUndefined();
  expect(payload.goals?.primary_goal).toBe("maintain");
  expect(payload.goals?.level).toBe("beginner");
  expect(payload.goals?.activation_checklist).toMatchObject({
    version: 1,
    signals: [],
    completed_at: null,
    dismissed_at: null,
  });
});

test("onboarding never auto-assigns a program that covers only one selected limitation", async ({ page }) => {
  let savedProfile: Record<string, unknown> | null = null;
  const partialMatch = {
    id: "71111111-1111-4111-8111-111111111111",
    name: "Только щадящая нагрузка на колени",
    description: null,
    target_level: "beginner",
    duration_weeks: 4,
    structure: {
      sex: ["male"],
      location: "gym",
      equipment: ["machines"],
      limitations: ["no_knee"],
      days_per_week: 3,
      schedule: [{ name: "День 1", exercises: [] }],
    },
    workout_type: "full_body",
    level: "beginner",
    is_template: true,
    publication_status: "published",
    program_key: "partial-limit",
    version: 1,
    is_current: true,
    published_at: "2026-09-14T09:00:00Z",
  };

  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(({ userId }) => {
    localStorage.setItem("fitness_jwt", "e2e-token");
    localStorage.setItem("fitness_cached_user_v1", JSON.stringify({
      id: userId,
      telegram_id: null,
      username: "cached-multi-limit-user",
      subscription_status: "free",
      onboarding_completed: true,
    }));
  }, { userId: USER_ID });
  await page.route("**/users/me", async (route) => {
    if (route.request().method() === "PUT") {
      savedProfile = route.request().postDataJSON() as Record<string, unknown>;
    }
    const body = savedProfile as {
      anthropometry?: Record<string, unknown>;
      goals?: Record<string, unknown>;
    } | null;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
        telegram_id: null,
        username: "multi-limit-user",
        auth_email: null,
        anthropometry: body?.anthropometry ?? {},
        goals: body?.goals ?? {},
        subscription_status: "free",
        stars_balance: 0,
        onboarding_completed: true,
      }),
    });
  });
  await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [partialMatch], total: 1 }),
  }));
  await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 200 }),
  }));

  await page.goto("/onboarding");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.evaluate(() => {
    const cached = localStorage.getItem("fitness_cached_user_v1");
    return cached ? (JSON.parse(cached) as { username?: string }).username : null;
  })).toBe("multi-limit-user");
  const next = page.getByRole("button", { name: "Далее", exact: true });
  for (const choice of [
    "Поддержание",
    "Новичок (только начинаю)",
    "Фитнес-зал",
    "Тренажёры",
    "3 дн./нед.",
  ]) {
    await page.getByRole("button", { name: choice, exact: true }).click();
    await next.click();
  }
  await page.getByRole("button", { name: "Мужской", exact: true }).click();
  await page.getByRole("textbox", { name: "Вес, кг", exact: true }).fill("70");
  await page.getByLabel("Рост, см").fill("175");
  await page.getByLabel("Возраст (если нет даты рождения)").fill("30");
  await page.getByLabel("Активность").selectOption("moderate");
  await next.click();
  await page.getByRole("button", { name: "Щадящая нагрузка на колени", exact: true }).click();
  await page.getByRole("button", { name: "Щадящая нагрузка на позвоночник", exact: true }).click();
  await page.getByRole("button", { name: "Завершить", exact: true }).click();

  await expect(page).toHaveURL(/\/programs\?notice=limitations$/);
  await expect(page.getByRole("status")).toContainText(
    "Не нашли программу, которая учитывает все выбранные ограничения",
  );
  const payload = savedProfile as { goals?: Record<string, unknown> };
  expect(payload.goals?.limitations).toEqual(["no_knee", "no_spine"]);
  expect(payload.goals?.active_program_id).toBeUndefined();
  await expect(page.getByText("Только щадящая нагрузка на колени")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Посмотреть все программы" })).toBeVisible();
});
