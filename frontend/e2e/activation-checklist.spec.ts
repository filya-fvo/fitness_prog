import { expect, test, type Page } from "@playwright/test";

const USER_ID = "89999999-9999-4999-8999-999999999999";

function checklistState(signals: string[] = []) {
  return {
    version: 1,
    started_at: "2026-09-07T00:00:00.000Z",
    signals,
    snoozed_until: null,
    completed_at: null,
    dismissed_at: null,
  };
}

async function mockHome(page: Page, withChecklist = true, signals: string[] = []) {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "checklist-e2e-token"));
  const profile = {
    id: USER_ID,
    telegram_id: null,
    username: "new-user",
    auth_email: null,
    anthropometry: { sex: "unspecified" },
    goals: {
      onboarding_completed: true,
      ...(withChecklist ? { activation_checklist: checklistState(signals) } : {}),
    },
    subscription_status: "free",
    stars_balance: 0,
    onboarding_completed: true,
  };
  await page.route("**/users/me", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { goals?: Record<string, unknown> };
      profile.goals = { ...profile.goals, ...(body.goals ?? {}) };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(profile) });
  });
  await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));
  await page.route("**/workouts/history", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));
  await page.route("**/workouts/schedule/overview**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ requested_date: "2026-09-07", current: null, next: null }),
  }));
  await page.route("**/workouts/regularity**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      period_start: "2026-08-11",
      period_end: "2026-09-07",
      has_schedule: false,
      completed: 0,
      planned: 0,
      rescheduled_completed: 0,
      cancelled: 0,
      missed: 0,
      completion_pct: null,
    }),
  }));
  await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 200 }),
  }));
  await page.route("**/nutrition/daily**", (route) => route.abort());
  await page.route("**/notifications/water**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ date: "2026-09-07", ml: 0, daily_target_ml: 2500 }),
  }));
  await page.route("**/metrics/daily**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ date: "2026-09-07", sources: {} }),
  }));
}

test("new user can progress and postpone the activation checklist", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await mockHome(page, true, ["plan_viewed", "schedule_saved"]);
  await page.goto("/");

  const card = page.getByRole("region", { name: "Освойте приложение" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Выполнено 2 из 6");
  await expect(card.getByRole("listitem")).toHaveCount(3);
  await expect(card.getByText("Откройте питание и помощь")).toHaveCount(0);
  if (process.platform === "win32") {
    await expect(card).toHaveScreenshot("activation-checklist-mobile.png");
  }

  await card.getByRole("button", { name: "Пропустить" }).click();
  await expect(card).toContainText("Выполнено 3 из 6");
  await expect(card.getByText("Откройте питание и помощь")).toBeVisible();

  await card.getByRole("button", { name: "Напомнить завтра" }).click();
  await expect(card).toBeHidden();
});

test("existing profile without rollout state is not interrupted", async ({ page }) => {
  await mockHome(page, false);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Главная" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Освойте приложение" })).toHaveCount(0);
});

test("new user can hide the checklist permanently", async ({ page }) => {
  await mockHome(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  const card = page.getByRole("region", { name: "Освойте приложение" });
  await card.getByRole("button", { name: "Скрыть навсегда" }).click();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(card).toHaveCount(0);
});

test("queued offline onboarding restores the checklist on Home", async ({ page }) => {
  await mockHome(page, false);
  await page.addInitScript(({ userId, state }) => {
    localStorage.setItem(
      `fitness_profile_draft_v2:${userId}`,
      JSON.stringify({ goals: { activation_checklist: state } }),
    );
  }, { userId: USER_ID, state: checklistState() });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Освойте приложение" })).toBeVisible();
});
