import { expect, test } from "@playwright/test";

const USER_ID = "85555555-5555-4555-8555-555555555555";

test("onboarding does not assign missing equipment and keeps a warned manual choice", async ({ page }) => {
  let savedProfile: Record<string, unknown> | null = null;
  const incompatibleProgram = {
    id: "72222222-2222-4222-8222-222222222222",
    name: "М · Дом · Новичок · Гантели",
    description: null,
    target_level: "beginner",
    duration_weeks: 4,
    structure: {
      sex: ["male"],
      location: "home",
      equipment: ["dumbbells", "bodyweight"],
      limitations: [],
      days_per_week: 3,
      schedule: [{ name: "День 1", exercises: [] }],
    },
    workout_type: "home_express",
    level: "beginner",
    is_template: true,
    publication_status: "published",
    program_key: "home-dumbbells",
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
      username: "cached-equipment-user",
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
        username: "equipment-user",
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
    body: JSON.stringify({ items: [incompatibleProgram], total: 1 }),
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
  })).toBe("equipment-user");

  const next = page.getByRole("button", { name: "Далее", exact: true });
  for (const choice of [
    "Поддержание",
    "Новичок (только начинаю)",
    "Дом",
    "Свой вес",
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
  await page.getByRole("button", { name: "Завершить", exact: true }).click();

  await expect(page).toHaveURL(/\/programs\?notice=equipment$/);
  await expect(page.getByRole("status")).toContainText(
    "Не нашли программу, для которой достаточно выбранного инвентаря",
  );
  const payload = savedProfile as { goals?: Record<string, unknown> };
  expect(payload.goals?.equipment).toEqual(["bodyweight"]);
  expect(payload.goals?.active_program_id).toBeUndefined();
  await expect(page.getByText(incompatibleProgram.name)).toHaveCount(0);

  await page.getByRole("button", { name: "Посмотреть все программы" }).click();
  await expect(page.getByText(incompatibleProgram.name)).toBeVisible();
  await expect(page.getByText(/нужно дополнительное оборудование: Гантели/)).toBeVisible();

  const dialogMessage = new Promise<string>((resolve) => {
    page.once("dialog", async (dialog) => {
      resolve(dialog.message());
      await dialog.dismiss();
    });
  });
  await page.getByRole("button", { name: /Начать сегодня \(день \d+\)/ }).click();
  await expect(dialogMessage).resolves.toContain("дополнительное оборудование: Гантели");
});
