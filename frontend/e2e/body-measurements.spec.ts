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
