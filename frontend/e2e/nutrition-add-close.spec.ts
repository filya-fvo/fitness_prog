import { acceptedLegalStatus } from "./legal-fixture";
import { expect, test, type Page } from "@playwright/test";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const product = { id: PRODUCT_ID, name_ru: "Тестовый йогурт", calories: 80,
  proteins: 5, fats: 2, carbs: 10, category: "custom", source: "manual" };
type Entry = { product_id: string; quantity_grams: number; meal_type: string; date: string };

async function setup(page: Page, entries: Entry[]) {
  await page.setViewportSize({ width: 320, height: 667 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "nutrition-add-close-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({ json: {
legal_status: acceptedLegalStatus(USER_ID),
    id: USER_ID, telegram_id: null, username: "nutrition-user", anthropometry: {},
    goals: { onboarding_completed: true }, subscription_status: "free", stars_balance: 0,
    onboarding_completed: true,
  } }));
  await page.route("**/nutrition/categories", (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route(/\/nutrition\/products(?:\?|$)/, (route) => route.fulfill({ json: { items: [product], total: 1 } }));
  await page.route("**/nutrition/daily**", (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") ?? "2026-10-06";
    const logs = entries.map((entry, index) => ({ ...entry,
      id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
      user_id: USER_ID, product, calculated_kbj: { calories: 80 * entry.quantity_grams / 100 },
    }));
    return route.fulfill({ json: { date,
      totals: { calories: logs.reduce((sum, log) => sum + log.calculated_kbj.calories, 0), proteins: 0, fats: 0, carbs: 0 },
      meals: { breakfast: logs, lunch: [], dinner: [], snack: [] }, targets: { complete: false },
    } });
  });
  await page.goto("/nutrition");
  await page.getByRole("button", { name: "+ Добавить продукт", exact: true }).click();
}

async function choose(page: Page, grams: string) {
  const dialog = page.getByRole("dialog", { name: "Добавить продукт", exact: true });
  await dialog.getByLabel("Поиск продукта", { exact: true }).fill("йогурт");
  await dialog.getByRole("button", { name: /Тестовый йогурт/ }).first().click();
  await dialog.getByLabel("Граммы", { exact: true }).fill(grams);
  return dialog;
}

test("continues adding products, then saves the last portion and closes directly", async ({ page }) => {
  const entries: Entry[] = [];
  await page.route("**/nutrition/log", (route) => {
    const entry = route.request().postDataJSON() as Entry;
    entries.push(entry);
    return route.fulfill({ json: { ...entry, id: "55555555-5555-4555-8555-555555555555",
      user_id: USER_ID, calculated_kbj: {}, product,
    } });
  });
  await setup(page, entries);
  const dialog = await choose(page, "100");
  await dialog.getByRole("button", { name: "Добавить и продолжить", exact: true }).click();
  await expect(dialog.getByText("Шаг 1 из 2", { exact: true })).toBeVisible();
  await choose(page, "137");
  const finish = dialog.getByRole("button", { name: "Добавить и закрыть", exact: true });
  await expect(finish).toBeVisible();
  const bounds = await finish.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await finish.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Добавить продукт", exact: true })).toBeFocused();
  await expect(page.getByText("Тестовый йогурт · 137г", { exact: true })).toBeVisible();
  expect(entries.map(({ product_id, quantity_grams, meal_type }) => ({ product_id, quantity_grams, meal_type })))
    .toEqual([100, 137].map((quantity_grams) => ({ product_id: PRODUCT_ID, quantity_grams, meal_type: "breakfast" })));
});

test("validation and server failure keep the last product open for retry", async ({ page }) => {
  const entries: Entry[] = [];
  let requests = 0;
  await page.route("**/nutrition/log", (route) => {
    requests++;
    const entry = route.request().postDataJSON() as Entry;
    if (requests === 1) return route.fulfill({ status: 503, json: { detail: "unavailable" } });
    entries.push(entry);
    return route.fulfill({ json: { ...entry, id: "55555555-5555-4555-8555-555555555555",
      user_id: USER_ID, calculated_kbj: {}, product,
    } });
  });
  await setup(page, entries);
  const dialog = await choose(page, "0");
  const finish = dialog.getByRole("button", { name: "Добавить и закрыть", exact: true });
  await expect(finish).toBeVisible();
  await finish.click();
  await expect(dialog.getByText("Укажите граммы больше 0 и не более 100 000", { exact: true })).toBeVisible();
  expect(requests).toBe(0);
  await dialog.getByLabel("Граммы", { exact: true }).fill("137");
  await finish.click();
  await expect(dialog.getByText("Сервис временно недоступен. Попробуйте немного позже.", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Граммы", { exact: true })).toHaveValue("137");
  await finish.click();
  await expect(dialog).toHaveCount(0);
  expect(entries).toHaveLength(1);
  expect(requests).toBe(2);
});

test("both save actions fit mobile and desktop layouts in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Save behavior is covered separately in every browser.");
  await setup(page, []);
  const dialog = await choose(page, "137");
  for (const width of [320, 375, 393, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 667 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
      const finish = dialog.getByRole("button", { name: "Добавить и закрыть", exact: true });
      await finish.scrollIntoViewIfNeeded();
      const bounds = await finish.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
      await expect(dialog.getByRole("button", { name: "Добавить и продолжить", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`portion-${width}-${theme}.png`) });
    }
  }
});
