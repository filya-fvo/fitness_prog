import { acceptedLegalStatus } from "./legal-fixture";
import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const product = { id: PRODUCT_ID, name_ru: "Тестовый йогурт", calories: 80,
  proteins: 5, fats: 2, carbs: 10, category: "custom", source: "manual" };
type Entry = { product_id: string; quantity_grams: number; meal_type: string; date: string };
type SavedEntry = Entry & {
  id: string; user_id: string; product: typeof product;
  calculated_kbj: { calories: number; proteins: number; fats: number; carbs: number };
};

function saveEntry(entries: SavedEntry[], entry: Entry): SavedEntry {
  const saved = { ...entry,
    id: `44444444-4444-4444-8444-${String(entries.length + 1).padStart(12, "0")}`,
    user_id: USER_ID, product,
    calculated_kbj: { calories: 80 * entry.quantity_grams / 100,
      proteins: 5 * entry.quantity_grams / 100, fats: 2 * entry.quantity_grams / 100,
      carbs: 10 * entry.quantity_grams / 100 },
  };
  entries.push(saved);
  return saved;
}

function dailySnapshot(entries: SavedEntry[], date: string) {
  const logs = entries.filter((entry) => entry.date === date);
  return { date,
    totals: logs.reduce((sum, log) => ({
      calories: sum.calories + log.calculated_kbj.calories,
      proteins: sum.proteins + log.calculated_kbj.proteins,
      fats: sum.fats + log.calculated_kbj.fats,
      carbs: sum.carbs + log.calculated_kbj.carbs,
    }), { calories: 0, proteins: 0, fats: 0, carbs: 0 }),
    meals: { breakfast: logs.filter((entry) => entry.meal_type === "breakfast"),
      lunch: logs.filter((entry) => entry.meal_type === "lunch"),
      dinner: logs.filter((entry) => entry.meal_type === "dinner"),
      snack: logs.filter((entry) => entry.meal_type === "snack") },
    targets: { complete: false },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function holdFirstSavedRead(entries: SavedEntry[]) {
  const gate = deferred();
  let started = false;
  return {
    started: () => started,
    release: gate.resolve,
    read: async (route: Route, snapshot: ReturnType<typeof dailySnapshot>) => {
      if (entries.length !== 1 || started) return route.fulfill({ json: snapshot });
      started = true;
      await gate.promise;
      return route.fulfill({ headers: { "x-e2e-daily": "delayed-after-save" }, json: snapshot });
    },
  };
}

async function finishDelayedRead(page: Page, release: () => void) {
  const response = page.waitForResponse((value) => value.headers()["x-e2e-daily"] === "delayed-after-save");
  release();
  await (await response).finished();
  // Let the delivered fetch and React updates paint before inspecting retained rows.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function setup(page: Page, entries: SavedEntry[],
  readDaily?: (route: Route, snapshot: ReturnType<typeof dailySnapshot>) => Promise<void>) {
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
    const snapshot = dailySnapshot(entries, date);
    return readDaily ? readDaily(route, snapshot) : route.fulfill({ json: snapshot });
  });
  await page.goto("/nutrition");
  await page.getByRole("button", { name: "+ Добавить продукт", exact: true }).click();
}

async function choose(page: Page, grams: string) {
  const dialog = page.getByRole("dialog", { name: "Добавить продукт", exact: true });
  await dialog.getByLabel("Поиск продукта", { exact: true }).fill("йогурт");
  await dialog.getByRole("button", { name: /^Тестовый йогурт\s*80 ккал\/100г$/ }).click();
  await dialog.getByLabel("Граммы", { exact: true }).fill(grams);
  return dialog;
}

test("continues adding products, then saves the last portion and closes directly", async ({ page }) => {
  const entries: SavedEntry[] = [];
  await page.route("**/nutrition/log", (route) => {
    const entry = route.request().postDataJSON() as Entry;
    return route.fulfill({ json: saveEntry(entries, entry) });
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
  const entries: SavedEntry[] = [];
  let requests = 0;
  await page.route("**/nutrition/log", (route) => {
    requests++;
    const entry = route.request().postDataJSON() as Entry;
    if (requests === 1) return route.fulfill({ status: 503, json: { detail: "unavailable" } });
    return route.fulfill({ json: saveEntry(entries, entry) });
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

test("successful save closes and shows its row while daily refresh is delayed", async ({ page }) => {
  const entries: SavedEntry[] = [];
  const delayed = holdFirstSavedRead(entries);
  await page.route("**/nutrition/log", (route) => route.fulfill({
    json: saveEntry(entries, route.request().postDataJSON() as Entry),
  }));
  await setup(page, entries, delayed.read);
  try {
    const dialog = await choose(page, "137");
    await dialog.getByRole("button", { name: "Добавить и закрыть", exact: true }).click();
    await expect.poll(delayed.started).toBe(true);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Тестовый йогурт · 137г", { exact: true })).toBeVisible();
    await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "110");
    expect(entries).toHaveLength(1);
    await finishDelayedRead(page, delayed.release);
    await expect(page.getByText("Тестовый йогурт · 137г", { exact: true })).toHaveCount(1);
  } finally { delayed.release(); }
});

test("second save finishes before an old daily refresh and both rows survive its late response", async ({ page }) => {
  const entries: SavedEntry[] = [];
  const delayed = holdFirstSavedRead(entries);
  await page.route("**/nutrition/log", (route) => route.fulfill({
    json: saveEntry(entries, route.request().postDataJSON() as Entry),
  }));
  await setup(page, entries, delayed.read);
  try {
    const dialog = await choose(page, "100");
    await dialog.getByRole("button", { name: "Добавить и продолжить", exact: true }).click();
    await expect.poll(delayed.started).toBe(true);
    await expect(dialog.getByText("Шаг 1 из 2", { exact: true })).toBeVisible();
    await choose(page, "137");
    const finish = dialog.getByRole("button", { name: "Добавить и закрыть", exact: true });
    await expect(finish).toBeEnabled();
    await finish.click();
    await expect(dialog).toHaveCount(0);
    expect(entries.map((entry) => entry.quantity_grams)).toEqual([100, 137]);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2);
    await expect(page.getByText("Тестовый йогурт · 100г", { exact: true })).toBeVisible();
    await expect(page.getByText("Тестовый йогурт · 137г", { exact: true })).toBeVisible();
    await finishDelayedRead(page, delayed.release);
    await expect(page.getByText("Тестовый йогурт · 100г", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Тестовый йогурт · 137г", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "190");
    expect(entries).toHaveLength(2);
  } finally { delayed.release(); }
});

test("daily refresh failure preserves the successful save without asking to post it again", async ({ page }) => {
  const entries: SavedEntry[] = [];
  await page.route("**/nutrition/log", (route) => route.fulfill({
    json: saveEntry(entries, route.request().postDataJSON() as Entry),
  }));
  await setup(page, entries, async (route, snapshot) => {
    if (entries.length) return route.fulfill({ status: 503, json: { detail: "unavailable" } });
    return route.fulfill({ json: snapshot });
  });
  const failedRefresh = page.waitForResponse((response) => response.url().includes("/nutrition/daily") && response.status() === 503);
  const dialog = await choose(page, "137");
  await dialog.getByRole("button", { name: "Добавить и закрыть", exact: true }).click();
  await (await failedRefresh).finished();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Тестовый йогурт · 137г", { exact: true })).toBeVisible();
  await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "110");
  await expect(page.getByRole("status").filter({ hasText: "Тестовый йогурт добавлен" })).toBeVisible();
  await page.getByRole("button", { name: "+ Добавить продукт", exact: true }).click();
  await expect(dialog.getByText("Шаг 1 из 2", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await choose(page, "100");
  await expect(dialog.getByRole("button", { name: "Добавить и закрыть", exact: true })).toBeEnabled();
  expect(entries).toHaveLength(1);
  expect(entries[0].quantity_grams).toBe(137);
});

test("repeated search remains selectable from cache while a new search response is delayed", async ({ page }) => {
  const entries: SavedEntry[] = [];
  const searchGate = deferred();
  await page.route("**/nutrition/log", (route) => route.fulfill({
    json: saveEntry(entries, route.request().postDataJSON() as Entry),
  }));
  await setup(page, entries);
  try {
    const dialog = await choose(page, "100");
    await dialog.getByRole("button", { name: "Добавить и продолжить", exact: true }).click();
    await expect(dialog.getByText("Шаг 1 из 2", { exact: true })).toBeVisible();
    await page.route(/\/nutrition\/products(?:\?|$)/, async (route) => {
      await searchGate.promise;
      await route.fulfill({ json: { items: [product], total: 1 } });
    });
    await dialog.getByLabel("Поиск продукта", { exact: true }).fill("йогурт");
    // This exact accessible name belongs to a search result, never a recent-product shortcut.
    const result = dialog.getByRole("button", { name: /^Тестовый йогурт\s*80 ккал\/100г$/ });
    await expect(result).toBeVisible();
    await result.click();
    await expect(dialog.getByLabel("Граммы", { exact: true })).toBeVisible();
    await dialog.getByLabel("Граммы", { exact: true }).fill("137");
    await expect(dialog.getByRole("button", { name: "Добавить и закрыть", exact: true })).toBeEnabled();
    expect(entries).toHaveLength(1);
  } finally { searchGate.resolve(); }
});

test("personal nutrition correction refreshes the same search before the next portion", async ({ page }) => {
  const entries: SavedEntry[] = [];
  const posted: Array<Entry & { calories_per_100?: number }> = [];
  let personalCalories = product.calories;
  await page.route("**/nutrition/log", (route) => {
    const entry = route.request().postDataJSON() as Entry & { calories_per_100?: number };
    posted.push(entry);
    if (entry.calories_per_100 != null) personalCalories = entry.calories_per_100;
    const saved = saveEntry(entries, entry);
    saved.product = { ...product, calories: personalCalories };
    saved.calculated_kbj.calories = personalCalories * entry.quantity_grams / 100;
    return route.fulfill({ json: saved });
  });
  await setup(page, entries);
  await page.route(/\/nutrition\/products(?:\?|$)/, (route) => route.fulfill({
    json: { items: [{ ...product, calories: personalCalories }], total: 1 },
  }));
  const dialog = await choose(page, "100");
  await dialog.getByRole("button", { name: "Изменить БЖУ / 100 г", exact: true }).click();
  await dialog.getByLabel("Ккал/100г", { exact: true }).fill("125");
  await dialog.getByRole("button", { name: "Добавить и продолжить", exact: true }).click();
  await expect(dialog.getByText("Шаг 1 из 2", { exact: true })).toBeVisible();
  expect(posted[0].calories_per_100).toBe(125);

  // Repeat the identical query while its original 80-kcal response would still be fresh.
  await dialog.getByLabel("Поиск продукта", { exact: true }).fill("йогурт");
  const correctedResult = dialog.getByRole("button", { name: /^Тестовый йогурт\s*125 ккал\/100г$/ });
  await expect(correctedResult).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Тестовый йогурт\s*80 ккал\/100г$/ })).toHaveCount(0);
  await correctedResult.click();
  await expect(dialog.getByText(/^На 100 г: 125 ккал/)).toBeVisible();
  await dialog.getByLabel("Граммы", { exact: true }).fill("200");
  await dialog.getByRole("button", { name: "Добавить и закрыть", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(posted).toHaveLength(2);
  expect(posted[1].calories_per_100).toBeUndefined();
  await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "375");
});

test("late saved-day refresh cannot put its row into a different selected day", async ({ page }) => {
  const entries: SavedEntry[] = [];
  const delayed = holdFirstSavedRead(entries);
  await page.route("**/nutrition/log", (route) => route.fulfill({
    json: saveEntry(entries, route.request().postDataJSON() as Entry),
  }));
  await setup(page, entries, delayed.read);
  try {
    const dialog = await choose(page, "137");
    await dialog.getByRole("button", { name: "Добавить и закрыть", exact: true }).click();
    await expect.poll(delayed.started).toBe(true);
    await expect(dialog).toHaveCount(0);
    const previousRead = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/nutrition/daily") && url.searchParams.get("date") !== entries[0].date;
    });
    await page.getByRole("button", { name: "Предыдущий день", exact: true }).click();
    await (await previousRead).finished();
    await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "0");
    await finishDelayedRead(page, delayed.release);
    await expect(page.getByText("Тестовый йогурт · 137г", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "0");
    expect(entries).toHaveLength(1);
  } finally { delayed.release(); }
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
