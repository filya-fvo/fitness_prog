import { expect, test } from "@playwright/test";
import { acceptedLegalStatus } from "./legal-fixture";

const owner = "71717171-7171-4171-8171-717171717171";
const user = { id: owner, telegram_id: null, username: "background-qa", auth_email: null,
  anthropometry: {}, goals: { onboarding_completed: true }, onboarding_completed: true,
  subscription_status: "plus", stars_balance: 0, legal_status: acceptedLegalStatus(owner) };

test("cached diary is usable before slow server replies and stays usable offline", async ({ page, context }) => {
  await page.addInitScript((profile) => {
    localStorage.setItem("fitness_jwt", "synthetic-background-token");
    localStorage.setItem("fitness_cached_user_v1", JSON.stringify(profile));
  }, user);
  await page.route("**/users/me", route => route.fulfill({ json: user }));
  await page.goto("/help-center");
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  await page.evaluate(async (ownerUserId) => {
    // @ts-expect-error Vite serves the real module in this browser test.
    const { db } = await import("/src/db/schema.ts");
    await db.workouts.put({ id: "72727272-7272-4272-8272-727272727272", user_id: ownerUserId,
      scheduled_date: new Date().toISOString().slice(0, 10), status: "completed", sets: [],
      plan: { exercises: [] }, title: "Сохранённая тренировка", completed_at: new Date().toISOString(),
      started_at: null, rpe: null, ai_notes: null, program_id: null, duration_sec: null });
  }, owner);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let historyStarted = false;
  await page.route("**/workouts/history**", async route => {
    historyStarted = true;
    await held;
    await route.abort();
  });
  try {
    await page.getByRole("link", { name: "Дневник", exact: true }).click();
    await expect.poll(() => historyStarted).toBe(true);
    await expect(page.getByRole("heading", { name: "Календарь тренировок" })).toBeVisible();
    const day = page.getByRole("button", { name: /: тренировок 1/ });
    await expect(day).toBeVisible();
    await day.click();
    await expect(page.getByRole("dialog")).toContainText("Сохранённая тренировка");
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await context.setOffline(true);
    await page.getByRole("link", { name: "Помощь", exact: true }).click();
    await page.getByRole("link", { name: "Дневник", exact: true }).click();
    await expect(day).toBeVisible();
  } finally { release(); }
});

test("switching tabs does not restart the foreground sync cycle", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.setInterval.bind(window);
    (window as unknown as { syncStarts: number }).syncStarts = 0;
    window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
      if (args[1] === 20_000) (window as unknown as { syncStarts: number }).syncStarts++;
      return original(...args);
    }) as typeof window.setInterval;
  });
  await page.addInitScript((profile) => {
    localStorage.setItem("fitness_jwt", "synthetic-background-token");
    localStorage.setItem("fitness_cached_user_v1", JSON.stringify(profile));
  }, user);
  await page.route("**/users/me", route => route.fulfill({ json: user }));
  await page.goto("/help-center");
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { syncStarts: number }).syncStarts)).toBe(1);
  await page.getByRole("link", { name: "Упражнения", exact: true }).click();
  await expect(page).toHaveURL(/\/train$/);
  await expect(page.getByRole("heading", { name: "Упражнения", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Помощь", exact: true }).click();
  await expect(page).toHaveURL(/\/help-center$/);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => (window as unknown as { syncStarts: number }).syncStarts)).toBe(1);
});
