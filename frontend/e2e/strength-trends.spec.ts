import { expect, test } from "@playwright/test";

const USER_ID = "70707070-7070-4070-8070-707070707070";
const NEXT_ID = "71111111-1111-4111-8111-111111111111";
const BEST_ID = "72222222-2222-4222-8222-222222222222";
const PINNED_ID = "73333333-3333-4333-8333-333333333333";

function trendItem(id: string, name: string, change: number) {
  const points = [
    { date: "2026-07-20", weight: 60, total_weight: 60, reps: 8, estimated_1rm: 76, weight_mode: "total" },
    { date: "2026-08-10", weight: 65, total_weight: 65, reps: 8, estimated_1rm: 82.3, weight_mode: "total" },
    { date: "2026-09-07", weight: 70, total_weight: 70, reps: 8, estimated_1rm: 88.7, weight_mode: "total" },
  ];
  return {
    exercise_id: id,
    name,
    muscle_group: "грудь",
    is_pinned: id === PINNED_ID,
    points,
    latest: points[2],
    previous: points[1],
    change_percent: change,
    has_weight_mode_change: false,
  };
}

test("PLUS progress explains next, best and user-selected strength trends", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "strength-trends-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: null,
      username: "strength-trends-qa",
      auth_email: null,
      anthropometry: {},
      goals: { onboarding_completed: true },
      subscription: { tier: "plus", active: true, sources: ["qa"], valid_until: null },
      subscription_status: "plus",
      stars_balance: 0,
      onboarding_completed: true,
    }),
  }));
  await page.route("**/workouts/history", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));
  await page.route(/\/exercises(?:\?.*)?$/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 200 }),
  }));
  await page.route("**/exercises/strength-trends", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      period_start: "2026-07-16",
      period_end: "2026-09-09",
      period_days: 56,
      next_workout: {
        date: "2026-09-10",
        title: "Тренировка A · Средняя неделя",
        items: [trendItem(NEXT_ID, "Жим гантелей лёжа", 12.5)],
      },
      best_improvements: [trendItem(BEST_ID, "Тяга верхнего блока", 18.4)],
      pinned: [trendItem(PINNED_ID, "Приседание со штангой", 9.2)],
    }),
  }));

  await page.goto("/progress");
  const card = page.getByRole("region", { name: "Силовые тренды" });
  await expect(card).toBeVisible();
  await expect(page.getByText("Силовые тренды", { exact: true })).toHaveCount(1);
  await expect(card.getByText("Жим гантелей лёжа")).toBeVisible();
  await expect(card.getByText(/10 сент.*Тренировка A/)).toBeVisible();

  await card.getByRole("tab", { name: "Лучшие" }).click();
  await expect(card.getByText("Тяга верхнего блока")).toBeVisible();
  await expect(card.getByText("+18,4%")).toBeVisible();
  await expect(card.getByText(/Устойчивый рост/)).toBeVisible();

  await card.getByRole("tab", { name: "Мои" }).click();
  await expect(card.getByText("Приседание со штангой")).toBeVisible();
  await expect(card.getByText("Вы сами определяете этот список.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Открепить упражнение" })).toBeVisible();
});
