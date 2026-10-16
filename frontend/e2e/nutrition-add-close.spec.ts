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
      expect(route.request().headers()["cache-control"]).toBe("no-cache");
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

test("offline reopen reads the durable diary and reconciles local deletion without forcing the network", async ({ page }) => {
  const entries: SavedEntry[] = [];
  const [date] = await fixtureDates(page);
  for (const quantity of [100, 137]) saveEntry(entries, { product_id: PRODUCT_ID, quantity_grams: quantity, meal_type: "breakfast", date });
  await page.addInitScript(() => {
    // Routing disables WebKit's HTTP cache and adds its own no-cache header.
    // Preserve Axios's explicit policy separately, as the native adapter sees it.
    const policies = new WeakMap<XMLHttpRequest, string>();
    const setHeader = XMLHttpRequest.prototype.setRequestHeader;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
      if (name.toLowerCase() === "cache-control") policies.set(this, value);
      return setHeader.call(this, name, value);
    };
    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      setHeader.call(this, "X-E2E-Diary-Read-Policy", policies.get(this) ?? "default");
      return send.call(this, body);
    };
  });
  const policies: Array<string | undefined> = [];
  await page.route("**/nutrition/log/*", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    const id = route.request().url().split("/").at(-1);
    const index = entries.findIndex((entry) => entry.id === id);
    expect(index).toBeGreaterThanOrEqual(0);
    entries.splice(index, 1);
    await route.fulfill({ status: 204 });
  });
  // Model the native adapter boundary: explicit fresh reads reject offline;
  // ordinary reads return its durable projection. The React page stays real.
  await setup(page, entries, async (route, snapshot) => {
    // Browser authentication bootstraps online; the native protected bootstrap
    // is covered separately. Switch offline at the diary adapter boundary.
    await page.evaluate(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
    const policy = route.request().headers()["x-e2e-diary-read-policy"];
    policies.push(policy);
    if (policy === "no-cache") return route.abort("internetdisconnected");
    return route.fulfill({ json: snapshot });
  });
  await page.getByRole("dialog", { name: "Добавить продукт", exact: true }).press("Escape");
  await page.reload();
  for (const quantity of [100, 137]) {
    await expect(page.getByText(`Тестовый йогурт · ${quantity}г`, { exact: true })).toHaveCount(1);
  }
  await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "190");
  for (const [name, value] of [["Белки", "12"], ["Жиры", "5"], ["Углеводы", "24"]]) {
    await expect(page.getByRole("progressbar", { name, exact: true })).toHaveAttribute("aria-valuenow", value);
  }
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Удалить", exact: true }).first().click();
  await expect(page.getByText("Тестовый йогурт · 100г", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Тестовый йогурт · 137г", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "110");
  await expect.poll(() => policies.length).toBeGreaterThanOrEqual(3);
  expect(policies).not.toContain("no-cache");
  await expect(page.getByText("Нет сети. Проверьте подключение или продолжите офлайн.", { exact: true })).toHaveCount(0);
});

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

async function fixtureDates(page: Page) {
  return page.evaluate(() => [0, -1].map((offset) => {
    const date = new Date(); date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }));
}

test("late deletion cannot subtract nutrition from another selected day", async ({ page }) => {
  const entries: SavedEntry[] = [];
  const dates = await fixtureDates(page);
  const removed = saveEntry(entries, { product_id: PRODUCT_ID, quantity_grams: 100, meal_type: "breakfast", date: dates[0] });
  saveEntry(entries, { product_id: PRODUCT_ID, quantity_grams: 200, meal_type: "breakfast", date: dates[1] });
  const gate = deferred();
  let deleteStarted = false;
  await page.route(`**/nutrition/log/${removed.id}`, async (route) => {
    expect(route.request().method()).toBe("DELETE");
    deleteStarted = true;
    await gate.promise;
    entries.splice(entries.indexOf(removed), 1);
    await route.fulfill({ status: 204 });
  });
  await setup(page, entries);
  await page.getByRole("dialog", { name: "Добавить продукт", exact: true }).press("Escape");
  page.on("dialog", (dialog) => dialog.accept());
  try {
    await page.getByRole("button", { name: "Удалить", exact: true }).click();
    await expect.poll(() => deleteStarted).toBe(true);
    await page.getByRole("button", { name: "Предыдущий день", exact: true }).click();
    const calories = page.getByRole("meter", { name: "Калории за день" });
    await expect(calories).toHaveAttribute("aria-valuenow", "160");
    const deleted = page.waitForResponse((response) => response.url().endsWith(`/nutrition/log/${removed.id}`));
    gate.resolve();
    await (await deleted).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByText("Тестовый йогурт · 200г", { exact: true })).toBeVisible();
    await expect(calories).toHaveAttribute("aria-valuenow", "160");
    for (const [name, value] of [["Белки", "10"], ["Жиры", "4"], ["Углеводы", "20"]]) {
      await expect(page.getByRole("progressbar", { name, exact: true })).toHaveAttribute("aria-valuenow", value);
    }
  } finally { gate.resolve(); }
});

for (const boundary of ["source read", "first write"] as const) {
  for (const transition of ["owner", "unmount"] as const) {
    test(`copy yesterday stops after ${boundary} when ${transition} changes`, async ({ page }) => {
      const entries: SavedEntry[] = [];
      const dates = await fixtureDates(page);
      for (const quantity of [100, 200]) saveEntry(entries, { product_id: PRODUCT_ID, quantity_grams: quantity, meal_type: "breakfast", date: dates[1] });
      const gate = deferred();
      let held = false;
      const writes: string[] = [];
      await page.route("**/nutrition/log", async (route) => {
        writes.push(route.request().headers().authorization ?? "");
        if (boundary === "first write" && writes.length === 1) { held = true; await gate.promise; }
        await route.fulfill({ json: saveEntry(entries, route.request().postDataJSON() as Entry) });
      });
      await setup(page, entries, async (route, snapshot) => {
        if (boundary === "source read" && snapshot.date === dates[1]) { held = true; await gate.promise; }
        await route.fulfill({ json: snapshot });
      });
      try {
        await page.getByRole("button", { name: "Как вчера", exact: true }).click();
        await expect.poll(() => held).toBe(true);
        if (transition === "owner") {
          await page.evaluate(async () => {
            const modulePath = "/src/store/userStore.ts";
            const { useUserStore } = await import(modulePath);
            localStorage.setItem("fitness_jwt", "new-owner-token");
            useUserStore.getState().setUser({ ...useUserStore.getState().user, id: "99999999-9999-4999-8999-999999999999" });
          });
        } else {
          await page.getByRole("dialog", { name: "Добавить продукт", exact: true }).press("Escape");
          await page.getByRole("link", { name: "Гид по питанию", exact: false }).click();
          await expect(page).toHaveURL(/\/knowledge/);
          await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveCount(0);
        }
        gate.resolve();
        await page.waitForTimeout(500);
        expect(writes).toHaveLength(boundary === "first write" ? 1 : 0);
        expect(writes).not.toContain("Bearer new-owner-token");
      } finally { gate.resolve(); }
    });
  }
}
for (const action of ["edit", "add override"] as const) {
  test(`successful ${action} refreshes personal nutrition search after a day switch`, async ({ page }) => {
    const entries: SavedEntry[] = [];
    const dates = await fixtureDates(page);
    const existing = saveEntry(entries, { product_id: PRODUCT_ID, quantity_grams: 100, meal_type: "breakfast", date: dates[0] });
    const gate = deferred();
    let started = false;
    let personalCalories = 80;
    await setup(page, entries);
    await page.route(/\/nutrition\/products(?:\?|$)/, (route) => route.fulfill({
      json: { items: [{ ...product, calories: personalCalories }], total: 1 },
    }));
    const addDialog = page.getByRole("dialog", { name: "Добавить продукт", exact: true });
    await addDialog.getByLabel("Поиск продукта", { exact: true }).fill("йогурт");
    await expect(addDialog.getByRole("button", { name: /^Тестовый йогурт\s*80 ккал\/100г$/ })).toBeVisible();
    const mutationUrl = action === "edit" ? `**/nutrition/log/${existing.id}` : "**/nutrition/log";
    await page.route(mutationUrl, async (route) => {
      expect(route.request().method()).toBe(action === "edit" ? "PUT" : "POST");
      expect(route.request().postDataJSON().calories_per_100).toBe(125);
      started = true;
      await gate.promise;
      personalCalories = 125;
      await route.fulfill({ json: action === "edit" ? existing : saveEntry(entries, route.request().postDataJSON() as Entry) });
    });
    if (action === "edit") {
      await addDialog.press("Escape");
      await page.getByRole("button", { name: "Изменить", exact: true }).click();
      const editDialog = page.getByRole("dialog", { name: "Изменить запись", exact: true });
      await editDialog.getByLabel("Ккал на 100 г", { exact: true }).fill("125");
      await editDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
      await expect.poll(() => started).toBe(true);
      await editDialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    } else {
      await addDialog.getByRole("button", { name: /^Тестовый йогурт\s*80 ккал\/100г$/ }).click();
      await addDialog.getByLabel("Граммы", { exact: true }).fill("100");
      await addDialog.getByRole("button", { name: "Изменить БЖУ / 100 г", exact: true }).click();
      await addDialog.getByLabel("Ккал/100г", { exact: true }).fill("125");
      await addDialog.getByRole("button", { name: "Добавить и продолжить", exact: true }).click();
      await expect.poll(() => started).toBe(true);
      await addDialog.press("Escape");
    }
    try {
      await page.getByRole("button", { name: "Предыдущий день", exact: true }).click();
      await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "0");
      const response = page.waitForResponse((value) => value.url().endsWith(action === "edit" ? `/nutrition/log/${existing.id}` : "/nutrition/log"));
      gate.resolve();
      await (await response).finished();
      await page.getByRole("button", { name: "+ Добавить продукт", exact: true }).click();
      if (action === "add override") {
        await addDialog.getByRole("button", { name: "Другой продукт", exact: true }).click();
        await addDialog.getByLabel("Поиск продукта", { exact: true }).fill("йогурт");
      }
      await expect(addDialog.getByRole("button", { name: /^Тестовый йогурт\s*125 ккал\/100г$/ })).toBeVisible();
      await expect(addDialog.getByRole("button", { name: /^Тестовый йогурт\s*80 ккал\/100г$/ })).toHaveCount(0);
      await expect(page.getByText("БЖУ сохранены для вас и будущих добавлений.", { exact: false })).toHaveCount(0);
      await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "0");
    } finally { gate.resolve(); }
  });
}

test("late edit does not announce an old day correction on the new day", async ({ page }) => {
  const entries: SavedEntry[] = [];
  const dates = await fixtureDates(page);
  const edited = saveEntry(entries, { product_id: PRODUCT_ID, quantity_grams: 100, meal_type: "breakfast", date: dates[0] });
  const gate = deferred(); let started = false;
  await page.route(`**/nutrition/log/${edited.id}`, async (route) => {
    expect(route.request().method()).toBe("PUT"); started = true;
    await gate.promise;
    await route.fulfill({ json: edited });
  });
  await setup(page, entries);
  await page.getByRole("dialog", { name: "Добавить продукт", exact: true }).press("Escape");
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Изменить запись", exact: true });
  await dialog.getByLabel("Ккал на 100 г", { exact: true }).fill("125");
  try {
    await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.getByRole("button", { name: "Предыдущий день", exact: true }).click();
    await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveAttribute("aria-valuenow", "0");
    const response = page.waitForResponse((value) => value.url().endsWith(`/nutrition/log/${edited.id}`));
    gate.resolve(); await (await response).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByText("БЖУ сохранены для вас и будущих добавлений.", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Обновлено · 100 г", { exact: true })).toHaveCount(0);
  } finally { gate.resolve(); }
});

test("nutrition shortcuts switch with the account and return to their original owner", async ({ page }) => {
  const entries: SavedEntry[] = [];
  await setup(page, entries);
  await page.route("**/nutrition/log", (route) => route.fulfill({
    json: saveEntry(entries, route.request().postDataJSON() as Entry),
  }));
  const add = await choose(page, "137");
  await add.getByRole("button", { name: "☆ В избранное", exact: true }).click();
  await add.getByRole("button", { name: "Добавить и продолжить", exact: true }).click();
  await expect(add.getByRole("button", { name: "★ Тестовый йогурт", exact: true })).toBeVisible();
  await expect(add.getByRole("button", { name: "Открыть недавние · 1", exact: true })).toBeVisible();
  for (const owner of ["99999999-9999-4999-8999-999999999999", USER_ID]) {
    await page.evaluate(async ({ owner, legalStatus }) => {
      const modulePath = "/src/store/userStore.ts";
      const { useUserStore } = await import(modulePath);
      localStorage.setItem("fitness_jwt", `token-for-${owner}`);
      useUserStore.getState().setUser({ ...useUserStore.getState().user, id: owner, legal_status: legalStatus });
    }, { owner, legalStatus: acceptedLegalStatus(owner) });
    if (owner !== USER_ID) {
      await expect(add.getByRole("button", { name: "★ Тестовый йогурт", exact: true })).toHaveCount(0);
      await expect(add.getByRole("button", { name: /недавние/ })).toHaveCount(0);
    } else {
      await expect(add.getByRole("button", { name: "★ Тестовый йогурт", exact: true })).toBeVisible();
      await add.getByRole("button", { name: "Открыть недавние · 1", exact: true }).click();
      await expect(add.getByRole("button", { name: "Тестовый йогурт · 137г", exact: true })).toBeVisible();
    }
  }
});

test("an account change clears an already selected recent product and its personal portion", async ({ page }) => {
  const entries: SavedEntry[] = [];
  await setup(page, entries);
  await page.route("**/nutrition/log", (route) => route.fulfill({
    json: saveEntry(entries, route.request().postDataJSON() as Entry),
  }));
  await page.route(`**/nutrition/products/${PRODUCT_ID}`, (route) => route.fulfill({ json: product }));
  const add = await choose(page, "137");
  await add.getByRole("button", { name: "Добавить и продолжить", exact: true }).click();
  await add.getByRole("button", { name: "Открыть недавние · 1", exact: true }).click();
  await add.getByRole("button", { name: "Тестовый йогурт · 137г", exact: true }).click();
  await expect(add.getByLabel("Граммы", { exact: true })).toHaveValue("137");
  await page.evaluate(async (legalStatus) => {
    const modulePath = "/src/store/userStore.ts";
    const { useUserStore } = await import(modulePath);
    localStorage.setItem("fitness_jwt", "new-owner-token");
    useUserStore.getState().setUser({ ...useUserStore.getState().user, id: "99999999-9999-4999-8999-999999999999", legal_status: legalStatus });
  }, acceptedLegalStatus("99999999-9999-4999-8999-999999999999"));
  await expect(add.getByLabel("Граммы", { exact: true })).toHaveCount(0);
  await expect(add.getByRole("button", { name: /В избранное/ })).toHaveCount(0);
  await expect(add.getByLabel("Поиск продукта", { exact: true })).toHaveValue("");
});

test("a pending recent product selection cannot enter a different account", async ({ page }) => {
  const entries: SavedEntry[] = [];
  const gate = deferred(); let started = false;
  await setup(page, entries);
  await page.route("**/nutrition/log", (route) => route.fulfill({
    json: saveEntry(entries, route.request().postDataJSON() as Entry),
  }));
  await page.route(`**/nutrition/products/${PRODUCT_ID}`, async (route) => {
    started = true;
    await gate.promise;
    await route.fulfill({ json: { ...product, calories: 125 } });
  });
  const add = await choose(page, "137");
  await add.getByRole("button", { name: "Добавить и продолжить", exact: true }).click();
  await add.getByRole("button", { name: "Открыть недавние · 1", exact: true }).click();
  try {
    await add.getByRole("button", { name: "Тестовый йогурт · 137г", exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await page.evaluate(async (legalStatus) => {
      const modulePath = "/src/store/userStore.ts";
      const { useUserStore } = await import(modulePath);
      localStorage.setItem("fitness_jwt", "new-owner-token");
      useUserStore.getState().setUser({ ...useUserStore.getState().user, id: "99999999-9999-4999-8999-999999999999", legal_status: legalStatus });
    }, acceptedLegalStatus("99999999-9999-4999-8999-999999999999"));
    const response = page.waitForResponse((value) => value.url().endsWith(`/nutrition/products/${PRODUCT_ID}`));
    gate.resolve(); await (await response).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(add.getByLabel("Граммы", { exact: true })).toHaveCount(0);
    await expect(add.getByRole("button", { name: /В избранное/ })).toHaveCount(0);
  } finally { gate.resolve(); }
});

test("late diary save cannot unlock a custom product save on the new day", async ({ page }) => {
  const oldGate = deferred(); const newGate = deferred();
  let oldStarted = false; let newStarted = false;
  const entries: SavedEntry[] = [];
  await setup(page, entries);
  await page.route("**/nutrition/log", async (route) => {
    oldStarted = true;
    await oldGate.promise;
    await route.fulfill({ json: saveEntry(entries, route.request().postDataJSON() as Entry) });
  });
  await page.route(/\/nutrition\/products$/, async (route) => {
    newStarted = true;
    await newGate.promise;
    await route.fulfill({ json: product });
  });
  const add = await choose(page, "100");
  try {
    await add.getByRole("button", { name: "Добавить и продолжить", exact: true }).click();
    await expect.poll(() => oldStarted).toBe(true);
    await add.press("Escape");
    await page.getByRole("button", { name: "Предыдущий день", exact: true }).click();
    await page.getByRole("button", { name: "+ Добавить продукт", exact: true }).click();
    await add.getByRole("button", { name: "Другой продукт", exact: true }).click();
    await add.getByRole("button", { name: "+ Свой продукт в общий каталог", exact: true }).click();
    const custom = page.getByRole("dialog", { name: "Новый продукт", exact: true });
    await custom.getByLabel("Название", { exact: true }).fill("Новый продукт");
    for (const [name, value] of [["Ккал", "80"], ["Белки", "5"], ["Жиры", "2"], ["Углеводы", "10"]]) {
      await custom.getByLabel(name, { exact: true }).fill(value);
    }
    await custom.getByRole("button", { name: "Создать и выбрать", exact: true }).click();
    await expect.poll(() => newStarted).toBe(true);
    const oldResponse = page.waitForResponse((value) => value.request().method() === "POST" && value.url().endsWith("/nutrition/log"));
    oldGate.resolve(); await (await oldResponse).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(custom.getByRole("button", { name: "Сохраняем…", exact: true })).toBeDisabled();
    const newResponse = page.waitForResponse((value) => value.request().method() === "POST" && value.url().endsWith("/nutrition/products"));
    newGate.resolve(); await (await newResponse).finished();
    await expect(custom).toHaveCount(0);
    await expect(add.getByLabel("Граммы", { exact: true })).toBeVisible();
  } finally { oldGate.resolve(); newGate.resolve(); }
});

for (const transition of ["owner", "day", "unmount"] as const) {
  test(`late custom product response is ignored after ${transition} changes`, async ({ page }) => {
    const gate = deferred();
    let started = false;
    const created = { ...product, name_ru: "Продукт прежнего экрана" };
    await setup(page, []);
    await page.route(/\/nutrition\/products$/, async (route) => {
      expect(route.request().method()).toBe("POST");
      started = true;
      await gate.promise;
      await route.fulfill({ json: created });
    });
    await page.getByRole("button", { name: "+ Свой продукт в общий каталог", exact: true }).click();
    const custom = page.getByRole("dialog", { name: "Новый продукт", exact: true });
    await custom.getByLabel("Название", { exact: true }).fill(created.name_ru);
    for (const [name, value] of [["Ккал", "80"], ["Белки", "5"], ["Жиры", "2"], ["Углеводы", "10"]]) {
      await custom.getByLabel(name, { exact: true }).fill(value);
    }
    try {
      await custom.getByRole("button", { name: "Создать и выбрать", exact: true }).click();
      await expect.poll(() => started).toBe(true);
      if (transition === "owner") {
        await page.evaluate(async (legalStatus) => {
          const modulePath = "/src/store/userStore.ts";
          const { useUserStore } = await import(modulePath);
          localStorage.setItem("fitness_jwt", "new-owner-token");
          useUserStore.getState().setUser({ ...useUserStore.getState().user, id: "99999999-9999-4999-8999-999999999999", legal_status: legalStatus });
        }, acceptedLegalStatus("99999999-9999-4999-8999-999999999999"));
        // The old pending save must not block work in the new account.
        await expect(custom.getByRole("button", { name: "Создать и выбрать", exact: true })).toBeEnabled();
      } else {
        await custom.getByRole("button", { name: "Закрыть", exact: true }).click();
        await page.getByRole("dialog", { name: "Добавить продукт", exact: true }).press("Escape");
        if (transition === "day") {
          await page.getByRole("button", { name: "Предыдущий день", exact: true }).click();
        } else {
          await page.getByRole("link", { name: "Гид по питанию", exact: false }).click();
          await expect(page).toHaveURL(/\/knowledge/);
          await expect(page.getByRole("meter", { name: "Калории за день" })).toHaveCount(0);
        }
      }
      const response = page.waitForResponse((value) => value.request().method() === "POST" && value.url().endsWith("/nutrition/products"));
      gate.resolve();
      await (await response).finished();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      // Public routes may not render ToastHost, but stale notifications must
      // not enter the real global store and appear after returning either.
      expect(await page.evaluate(async () => {
        const modulePath = "/src/store/toastStore.ts";
        const { useToastStore } = await import(modulePath);
        return useToastStore.getState().items.map((item: { message: string }) => item.message);
      })).not.toContain("Продукт создан и выбран");
      await expect(page.getByText("Продукт создан и выбран", { exact: true })).toHaveCount(0);
      if (transition !== "unmount") {
        if (transition === "owner") await custom.getByRole("button", { name: "Закрыть", exact: true }).click();
        else await page.getByRole("button", { name: "+ Добавить продукт", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Добавить продукт", exact: true }).getByLabel("Граммы", { exact: true })).toHaveCount(0);
      }
    } finally { gate.resolve(); }
  });
}

for (const transition of ["owner", "day"] as const) {
  test(`late custom product error is ignored after ${transition} changes`, async ({ page }) => {
    const gate = deferred(); let started = false;
    await setup(page, []);
    await page.route(/\/nutrition\/products$/, async (route) => {
      started = true;
      await gate.promise;
      await route.fulfill({ status: 503, json: { detail: "Не удалось создать продукт" } });
    });
    await page.getByRole("button", { name: "+ Свой продукт в общий каталог", exact: true }).click();
    const custom = page.getByRole("dialog", { name: "Новый продукт", exact: true });
    await custom.getByLabel("Название", { exact: true }).fill("Старый черновик");
    for (const [name, value] of [["Ккал", "80"], ["Белки", "5"], ["Жиры", "2"], ["Углеводы", "10"]]) {
      await custom.getByLabel(name, { exact: true }).fill(value);
    }
    try {
      await custom.getByRole("button", { name: "Создать и выбрать", exact: true }).click();
      await expect.poll(() => started).toBe(true);
      if (transition === "owner") {
        await page.evaluate(async (legalStatus) => {
          const modulePath = "/src/store/userStore.ts";
          const { useUserStore } = await import(modulePath);
          localStorage.setItem("fitness_jwt", "new-owner-token");
          useUserStore.getState().setUser({ ...useUserStore.getState().user, id: "99999999-9999-4999-8999-999999999999", legal_status: legalStatus });
        }, acceptedLegalStatus("99999999-9999-4999-8999-999999999999"));
      } else {
        await custom.getByRole("button", { name: "Закрыть", exact: true }).click();
        await page.getByRole("dialog", { name: "Добавить продукт", exact: true }).press("Escape");
        await page.getByRole("button", { name: "Предыдущий день", exact: true }).click();
        await page.getByRole("button", { name: "+ Добавить продукт", exact: true }).click();
        await page.getByRole("button", { name: "+ Свой продукт в общий каталог", exact: true }).click();
      }
      const response = page.waitForResponse((value) => value.request().method() === "POST" && value.url().endsWith("/nutrition/products"));
      gate.resolve(); await (await response).finished();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(custom.getByRole("alert")).toHaveCount(0);
      await expect(custom.getByRole("button", { name: "Создать и выбрать", exact: true })).toBeEnabled();
    } finally { gate.resolve(); }
  });
}
