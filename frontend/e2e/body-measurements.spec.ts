import { expect, test } from "@playwright/test";

const userId = "42424242-4242-4424-8424-424242424242";

const profile = {
  id: userId,
  telegram_id: 42,
  username: "measurement_qa",
  auth_email: null,
  anthropometry: {},
  goals: { onboarding_completed: true },
  subscription_status: "free",
  stars_balance: 0,
  onboarding_completed: true,
};

test("measurement uses the previous filled field and supports confirmed deletion", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "measurement-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(profile),
  }));

  let deleted = false;
  let currentDate = "2026-08-28";
  await page.route(/\/measurements\/daily(?:\?.*)?$/, async (route) => {
    currentDate = new URL(route.request().url()).searchParams.get("date") ?? currentDate;
    if (route.request().method() === "DELETE") {
      deleted = true;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(deleted
        ? { date: currentDate, sources: {} }
        : { id: "11111111-1111-4111-8111-111111111111", date: currentDate, chest_cm: 98, sources: { chest_cm: "manual" } }),
    });
  });
  await page.route(/\/measurements\/range(?:\?.*)?$/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      start: "2026-08-01",
      end: currentDate,
      items: deleted ? [
        { date: "2026-08-01", chest_cm: 100, sources: {} },
        { date: "2026-08-10", waist_cm: 82, sources: {} },
      ] : [
        { date: "2026-08-01", chest_cm: 100, sources: {} },
        { date: "2026-08-10", waist_cm: 82, sources: {} },
        { date: currentDate, chest_cm: 98, sources: {} },
      ],
    }),
  }));

  await page.goto("/measurements");
  await expect(page.getByText(/01\.08 → .* · .* дн\.: -2 см/)).toBeVisible();
  await page.getByRole("button", { name: "Удалить ошибочный замер" }).click();
  await expect(page.getByText(/Удалить всю запись/)).toBeVisible();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();

  await expect.poll(() => deleted).toBe(true);
  await expect(page.getByText("новый замер")).toBeVisible();
});

test("progress measurement analytics switches bounded server periods", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "measurement-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ...profile,
      goals: {
        onboarding_completed: true,
        primary_goal: "lose_fat",
        target_weight_kg: 75,
      },
    }),
  }));
  await page.route(/\/workouts\/history(?:\?.*)?$/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));
  const requestedPeriods: string[] = [];
  await page.route(/\/measurements\/analytics(?:\?.*)?$/, (route) => {
    const months = new URL(route.request().url()).searchParams.get("months") ?? "3";
    requestedPeriods.push(months);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        months: Number(months),
        start: "2026-05-28",
        end: "2026-08-28",
        primary_goal: "lose_fat",
        items: [{
          field: "weight_kg",
          points: 2,
          baseline_value: 82,
          baseline_date: "2026-05-28",
          latest_value: 79,
          latest_date: "2026-08-28",
          delta: -3,
          percent_change: -3.7,
          target_value: 75,
          target_gap: 4,
          interpretation: "Значение стало ближе к заданной цели",
        }],
      }),
    });
  });

  await page.goto("/progress");
  await expect(page.getByText("База 28.05: 82 кг")).toBeVisible();
  await expect(page.getByText("Цель: 75 кг · разница +4 кг")).toBeVisible();
  await expect(page.getByText("Изменение показано без оценки результата")).toHaveCount(0);
  await page.getByRole("button", { name: "12 мес." }).click();
  await expect.poll(() => requestedPeriods).toContain("12");
});
