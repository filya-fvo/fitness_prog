import { expect, test } from "@playwright/test";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const CORRECTION_ID = "44444444-4444-4444-8444-444444444444";

test("admin reviews a proposed food correction before changing the shared catalog", async ({ page }) => {
  let pending = true;
  let decision: string | null = null;
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "admin-e2e-token"));
  await page.route("**/users/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    id: USER_ID, username: "Filatov_Slava", telegram_id: null, auth_email: null,
    anthropometry: {}, goals: { onboarding_completed: true }, subscription_status: "free",
    stars_balance: 0, onboarding_completed: true,
  }) }));
  await page.route(/\/admin\/nutrition\/corrections(?:\?|$)/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    items: pending ? [{
      id: CORRECTION_ID, product_id: PRODUCT_ID, product_name: "Йогурт",
      user_id: USER_ID, original_kbju: { calories: 100, proteins: 5, fats: 3, carbs: 12 },
      proposed_kbju: { calories: 110, proteins: 6, fats: 3, carbs: 12 },
      status: "pending", created_at: "2026-09-28T09:00:00Z", reviewed_at: null,
    }] : [], total: pending ? 1 : 0, pending_count: pending ? 1 : 0,
  }) }));
  await page.route(/\/admin\/nutrition\/corrections\/[^/]+\/decision$/, (route) => {
    decision = (route.request().postDataJSON() as { decision: string }).decision;
    pending = false;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      id: CORRECTION_ID, product_id: PRODUCT_ID, product_name: "Йогурт",
      user_id: USER_ID, original_kbju: { calories: 100, proteins: 5, fats: 3, carbs: 12 },
      proposed_kbju: { calories: 110, proteins: 6, fats: 3, carbs: 12 },
      status: "approved", created_at: "2026-09-28T09:00:00Z", reviewed_at: "2026-09-28T10:00:00Z",
    }) });
  });

  await page.goto("/admin/nutrition");
  await expect(page.getByRole("heading", { name: "Исправления продуктов" })).toBeVisible();
  await expect(page.getByText("Йогурт")).toBeVisible();
  await expect(page.getByText("5 г → 6 г")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Одобрить" }).click();
  await expect(page.getByRole("dialog", { name: "Подтвердить исправление" })).toBeVisible();
  await page.getByRole("dialog", { name: "Подтвердить исправление" }).getByRole("button", { name: "Подтвердить" }).click();
  await expect.poll(() => decision).toBe("approve");
  await expect(page.getByText("Пока нет заявок на проверку")).toBeVisible();
});
