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
});
