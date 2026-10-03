import { expect, test, type Page } from "@playwright/test";

const USER = "42424242-4242-4424-8424-424242424242";
const OTHER_USER = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN = "33333333-3333-4333-8333-333333333333";
const broadcast = { id: CAMPAIGN, actor_user_id: USER, title: "Копия", message_text: "Сохранённый текст", audience: { kind: "all_telegram" },
  status: "draft", counts: { expected: 2, pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0 },
  failure_reasons: [], tested_at: null, scheduled_at: null, scheduled_timezone: "UTC", started_at: null, completed_at: null,
  cancelled_at: null, retry_count: 0, created_at: "2026-10-03T09:00:00Z", updated_at: "2026-10-03T09:00:00Z" };

async function broadcastRoutes(page: Page, saveGate = Promise.resolve()) {
  await page.route("**/admin/broadcasts/audience-preview", (route) => route.fulfill({ json: { expected_count: 2 } }));
  await page.route(`**/admin/broadcasts/${CAMPAIGN}/copy`, (route) => route.fulfill({ json: broadcast }));
  await page.route(`**/admin/broadcasts/${CAMPAIGN}`, (route) => route.fulfill({ json: broadcast }));
  await page.route(/\/admin\/broadcasts(?:\?|$)/, async (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    if (route.request().method() !== "GET") await saveGate;
    return route.fulfill({ json: route.request().method() === "GET"
      ? { items: [broadcast], total: 1, limit: 10, offset: 0 } : broadcast });
  });
}
async function setup(page: Page) {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "draft-recovery-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({ json: {
    id: USER, telegram_id: 42, username: "Filatov_Slava", auth_email: null,
    anthropometry: { sex: "male", height_cm: 180, age: 30 },
    goals: { onboarding_completed: true, primary_goal: "maintain" },
    subscription_status: "plus", subscription: { tier: "plus", active: true, sources: ["qa"], valid_until: null },
    stars_balance: 0, onboarding_completed: true,
  } }));
  await page.route(/\/programs(?:\?|$)/, (route) => route.request().resourceType() === "document"
    ? route.continue() : route.fulfill({ json: { items: [], total: 0 } }));
  await page.route("**/programs/mine", (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 200 } }));
  await page.route("**/supplements/stack", (route) => route.fulfill({ json: { items: [], catalog: [] } }));
}

test("personal program returns after Header back, with explicit discard", async ({ page }) => {
  await setup(page);
  await page.goto("/programs/new");
  await page.getByRole("textbox", { name: "Название программы" }).fill("Длинный черновик");
  await page.getByRole("button", { name: "Вернуться назад", exact: true }).click();
  await expect(page).not.toHaveURL(/\/programs\/new$/);
  await page.goto("/programs/new");
  await expect(page.getByRole("textbox", { name: "Название программы" })).toHaveValue("Длинный черновик");
  await page.getByRole("button", { name: "Отменить изменения", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Название программы" })).toHaveValue("");
});

test("personal program survives browser back and forward with its configured day", async ({ page }) => {
  await setup(page);
  await page.goto("/programs");
  await page.getByRole("link", { name: "+ Создать свою программу" }).click();
  await page.getByRole("textbox", { name: "Название программы" }).fill("План после жеста назад");
  await page.getByRole("button", { name: "Выбрать упражнения →" }).click();
  await page.getByRole("button", { name: /^День 3/ }).click();
  await page.getByLabel("Название дня", { exact: true }).fill("Третий день сохранён");
  await page.goBack();
  await expect(page).toHaveURL(/\/programs$/);
  await page.goForward();
  await expect(page.getByLabel("Название дня", { exact: true })).toHaveValue("Третий день сохранён");
});

test("malformed stored program draft does not replace the working form", async ({ page }) => {
  await setup(page);
  await page.addInitScript((owner) => localStorage.setItem(`fitness_form_draft:v1:${owner}:personal-program`, JSON.stringify({ days: [null], name: 42 })), USER);
  await page.goto("/programs/new");
  await expect(page.getByRole("textbox", { name: "Название программы" })).toHaveValue("");
  await page.getByRole("textbox", { name: "Название программы" }).fill("Рабочая программа");
  await page.getByRole("button", { name: "Выбрать упражнения →" }).click();
  await expect(page.getByLabel("Название дня", { exact: true })).toHaveValue("День 1");
});

test("stored program draft matching the baseline is removed without marking changes", async ({ page }) => {
  await setup(page);
  await page.addInitScript((owner) => localStorage.setItem(`fitness_form_draft:v1:${owner}:personal-program`, JSON.stringify({
    name: "", location: "gym", progression: "phased", durationWeeks: 8,
    days: [1, 2, 3].map((day) => ({ name: `День ${day}`, exercises: [] })),
    dayCount: 3, activeDay: 0, step: "setup",
  })), USER);
  await page.goto("/programs/new");
  await expect(page.getByRole("textbox", { name: "Название программы" })).toHaveValue("");
  await expect.poll(() => page.evaluate((owner) => localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`), USER)).toBeNull();
  await expect(page.getByRole("button", { name: "Отменить изменения", exact: true })).toHaveCount(0);
});

test("personal program draft is isolated by account", async ({ page }) => {
  await setup(page);
  await page.goto("/programs/new");
  await page.getByRole("textbox", { name: "Название программы" }).fill("Личный черновик");
  await page.route("**/users/me", (route) => route.fulfill({ json: {
    id: OTHER_USER, telegram_id: null, username: "other", anthropometry: {}, goals: { onboarding_completed: true },
    subscription_status: "free", stars_balance: 0, onboarding_completed: true,
  } }));
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Название программы" })).toHaveValue("");
});

test("seven-day personal program draft survives reload", async ({ page }) => {
  await setup(page);
  await page.goto("/programs/new");
  await page.getByLabel("Название программы", { exact: true }).fill("Семь тренировочных дней");
  await page.getByRole("combobox", { name: "Тренировочных дней в неделю", exact: true }).selectOption("7");
  await page.reload();
  await expect(page.getByLabel("Название программы", { exact: true })).toHaveValue("Семь тренировочных дней");
  await expect(page.getByRole("combobox", { name: "Тренировочных дней в неделю", exact: true })).toHaveValue("7");
});

for (const field of ["dayCount", "activeDay"]) {
  test(`fractional stored ${field} cannot replace the personal program form`, async ({ page }) => {
    await setup(page);
    await page.addInitScript(({ owner, fractionalField }) => localStorage.setItem(`fitness_form_draft:v1:${owner}:personal-program`, JSON.stringify({
      name: "Дробный черновик", location: "gym", progression: "phased", durationWeeks: 8,
      days: [1, 2, 3].map((day) => ({ name: `День ${day}`, exercises: [] })),
      dayCount: 3, activeDay: 0, step: "setup", [fractionalField]: 1.5,
    })), { owner: USER, fractionalField: field });
    await page.goto("/programs/new");
    await expect(page.getByRole("textbox", { name: "Название программы" })).toHaveValue("");
  });
}

test("supplement dose fields cannot change while stack saving is pending", async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entry = { id: "creatine", key: "creatine", name_ru: "Креатин", dose: "5 г", times: [], schedule: [], enabled: true, custom: false, notes: "" };
  await page.route("**/supplements/stack", async (route) => {
    if (route.request().method() === "PUT") await gate;
    return route.fulfill({ json: { items: [entry], catalog: [] } });
  });
  await page.goto("/profile/settings?section=supplements");
  await page.getByRole("button", { name: "Описание", exact: true }).click();
  await page.getByLabel("Доза", { exact: true }).fill("6 г");
  await page.getByRole("button", { name: "Сохранить дозы и время" }).click();
  try { await expect(page.getByLabel("Доза", { exact: true })).toBeDisabled(); }
  finally { release(); }
  await expect(page.getByLabel("Доза", { exact: true })).toBeEnabled();
});

test("profile fields cannot change while a slow save is pending", async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/users/me", async (route) => {
    if (route.request().method() === "PUT") await gate;
    return route.fulfill({ json: { id: USER, telegram_id: 42, username: "Filatov_Slava", anthropometry: { sex: "male", height_cm: 180, age: 30 },
      goals: { onboarding_completed: true }, subscription_status: "free", stars_balance: 0, onboarding_completed: true } });
  });
  await page.goto("/profile/settings");
  const height = page.getByLabel("Рост, см", { exact: true });
  await expect(height).toHaveValue("180");
  await height.fill("185");
  await expect(height).toHaveValue("185");
  const submitted = page.waitForRequest((request) => request.url().endsWith("/users/me") && request.method() === "PUT");
  await page.getByRole("button", { name: "Сохранить тело и калории" }).click();
  try {
    expect((await submitted).postDataJSON().anthropometry.height_cm).toBe(185);
    await expect(height).toBeDisabled();
    await expect(page.getByLabel("Возраст", { exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByLabel("Рост, см", { exact: true })).toBeEnabled();
});

test("broadcast fields cannot change while a slow save is pending", async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await broadcastRoutes(page, gate);
  await page.goto("/admin/broadcasts");
  await page.getByLabel("Заголовок", { exact: true }).fill("Новый заголовок");
  await page.getByLabel(/Текст/).fill("Новый текст");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  try {
    await expect(page.getByLabel("Заголовок", { exact: true })).toBeDisabled();
    await expect(page.getByLabel(/Текст/)).toBeDisabled();
  } finally { release(); }
  await expect(page.getByLabel("Заголовок", { exact: true })).toBeEnabled();
});

test("copied broadcast draft reopens its selected context after menu navigation", async ({ page }) => {
  await setup(page);
  await broadcastRoutes(page);
  await page.goto("/admin/broadcasts");
  await page.getByRole("button", { name: "Копировать как черновик" }).click();
  await expect(page.getByLabel("Заголовок", { exact: true })).toHaveValue("Копия");
  await page.getByLabel("Заголовок", { exact: true }).fill("Изменения в выбранной рассылке");
  await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "Профиль", exact: true }).click();
  await page.goBack();
  await expect(page.getByLabel("Заголовок", { exact: true })).toHaveValue("Изменения в выбранной рассылке");
  await page.reload();
  await expect(page.getByLabel("Заголовок", { exact: true })).toHaveValue("Изменения в выбранной рассылке");
  await expect(page).toHaveURL(new RegExp(`focus=${CAMPAIGN}`));
});

test("canceling a broadcast context switch keeps edits and does not create a copy", async ({ page }) => {
  await setup(page);
  await broadcastRoutes(page);
  let copies = 0;
  await page.route(`**/admin/broadcasts/${CAMPAIGN}/copy`, (route) => {
    copies += 1;
    return route.fulfill({ json: broadcast });
  });
  await page.goto("/admin/broadcasts");
  await page.getByLabel("Заголовок", { exact: true }).fill("Мой текущий черновик");
  await page.getByLabel(/Текст/).fill("Не терять при замене");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Копировать как черновик" }).click();
  await expect(page.getByLabel("Заголовок", { exact: true })).toHaveValue("Мой текущий черновик");
  expect(copies).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Копировать как черновик" }).click();
  await expect(page.getByLabel("Заголовок", { exact: true })).toHaveValue("Копия");
  expect(copies).toBe(1);
});

test("clean measurement background refresh replaces its baseline without creating a draft", async ({ page }) => {
  await setup(page);
  let waist = 80;
  let date = "";
  await page.route("**/measurements/daily?*", (route) => {
    date = new URL(route.request().url()).searchParams.get("date") ?? "";
    return route.fulfill({ json: { date, waist_cm: waist, note: null } });
  });
  await page.route("**/measurements/range?*", (route) => route.fulfill({ json: { start: "2025-10-03", end: "2026-10-03", items: [{ date, waist_cm: waist, note: null }] } }));
  await page.goto("/measurements");
  await expect(page.getByLabel("Талия, см", { exact: true })).toHaveValue("80");
  waist = 85;
  await page.evaluate(() => window.dispatchEvent(new Event("fitness:sync-complete")));
  await expect(page.getByLabel("Талия, см", { exact: true })).toHaveValue("85");
  await expect(page.getByRole("button", { name: "Отменить изменения", exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(({ owner, selectedDate }) => localStorage.getItem(`fitness_form_draft:v1:${owner}:measurement:${selectedDate}`), { owner: USER, selectedDate: date })).toBeNull();
});

test("profile body draft survives navigation and reload", async ({ page }) => {
  await setup(page);
  await page.goto("/profile/settings");
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("180");
  await page.getByLabel("Рост, см", { exact: true }).fill("185");
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("185");
  await page.getByRole("link", { name: "Изменить в замерах →" }).click();
  await page.goBack();
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("185");
  await page.reload();
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("185");
});

test("profile existing validation explains all invalid fields and focuses the first", async ({ page }) => {
  await setup(page);
  await page.goto("/profile/settings");
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("180");
  await expect(page.getByLabel("Возраст", { exact: true })).toHaveValue("30");
  await page.getByLabel("Рост, см", { exact: true }).fill("70");
  await page.getByLabel("Возраст", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Сохранить тело и калории" }).click();
  const height = page.getByLabel("Рост, см", { exact: true });
  await expect(height).toHaveAttribute("aria-invalid", "true");
  await expect(height).toBeFocused();
  await expect(height).toHaveAccessibleDescription("Укажите рост от 80 до 250 см");
  await expect(page.getByLabel("Возраст", { exact: true })).toHaveAccessibleDescription("Укажите возраст от 10 до 100 лет");
  await height.fill("185");
  await expect(height).toHaveAttribute("aria-invalid", "false");
  await expect(height).toHaveAccessibleDescription("");
  await expect(page.getByText("Укажите рост от 80 до 250 см", { exact: true })).toHaveCount(0);
  await expect(height).toBeFocused();
  await page.getByRole("button", { name: "Сохранить тело и калории" }).click();
  await expect(page.getByLabel("Возраст", { exact: true })).toBeFocused();
});

test("manual calorie validation identifies and focuses its field", async ({ page }) => {
  await setup(page);
  await page.goto("/profile/settings");
  await page.getByRole("button", { name: "Не указан", exact: true }).click();
  await page.getByLabel("Цель калорий на день").fill("500");
  await page.getByRole("button", { name: "Сохранить тело и калории" }).click();
  const calories = page.getByLabel("Цель калорий на день");
  await expect(calories).toBeFocused();
  await expect(calories).toHaveAttribute("aria-invalid", "true");
  await expect(calories).toHaveAccessibleDescription("Укажите от 800 до 10 000 ккал");
});

test("hidden invalid age points to the visible birth date and desired weight shows its error", async ({ page }) => {
  await setup(page);
  await page.goto("/profile/settings");
  await page.getByLabel("Возраст", { exact: true }).fill("5");
  await page.getByLabel("Дата рождения", { exact: true }).fill("2025-01-01");
  await page.getByLabel("Желаемый вес, кг (необязательно)", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Сохранить тело и калории" }).click();
  await expect(page.getByLabel("Дата рождения", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Дата рождения", { exact: true })).toHaveAccessibleDescription("Укажите возраст от 10 до 100 лет");
  await expect(page.getByLabel("Желаемый вес, кг (необязательно)", { exact: true })).toHaveAccessibleDescription("Укажите вес от 20 до 500 кг");
});

test("profile failed save preserves the draft, successful save clears it", async ({ page }) => {
  await setup(page);
  let failing = true;
  let savedHeight = 180;
  await page.route("**/users/me", (route) => {
    if (route.request().method() === "PUT") {
      if (failing) return route.fulfill({ status: 503, json: { detail: "Unavailable" } });
      savedHeight = route.request().postDataJSON().anthropometry.height_cm;
    }
    return route.fulfill({ json: { id: USER, telegram_id: 42, username: "Filatov_Slava", anthropometry: { sex: "male", height_cm: savedHeight, age: 30 },
      goals: { onboarding_completed: true }, subscription_status: "free", stars_balance: 0, onboarding_completed: true } });
  });
  await page.goto("/profile/settings");
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("180");
  await page.getByLabel("Рост, см", { exact: true }).fill("185");
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("185");
  const rejected = page.waitForResponse((response) => response.url().endsWith("/users/me") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Сохранить тело и калории" }).click();
  expect((await rejected).status()).toBe(503);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("185");
  failing = false;
  await page.getByRole("button", { name: "Сохранить тело и калории" }).click();
  await expect(page.getByText("Профиль сохранён.", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((owner) => localStorage.getItem(`fitness_form_draft:v1:${owner}:profile:body`), USER)).toBeNull();
  await page.reload();
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("185");
});

test("measurement drafts remain separate by date and survive background sync", async ({ page }) => {
  await setup(page);
  await page.route("**/measurements/daily?*", (route) => route.fulfill({ json: {
    date: new URL(route.request().url()).searchParams.get("date"), note: null,
  } }));
  await page.route("**/measurements/range?*", (route) => route.fulfill({ json: { start: "2025-10-03", end: "2026-10-03", items: [] } }));
  await page.goto("/measurements");
  const waist = page.getByLabel("Талия, см", { exact: true });
  await expect(page.getByRole("button", { name: "Сохранить замер" })).toBeEnabled();
  await waist.fill("85");
  await page.getByRole("button", { name: "Предыдущий день" }).click();
  await expect(waist).toHaveValue("");
  await waist.fill("84");
  await page.getByRole("button", { name: "Следующий день" }).click();
  await expect(waist).toHaveValue("85");
  await page.evaluate(() => window.dispatchEvent(new Event("fitness:sync-complete")));
  await expect(waist).toHaveValue("85");
  await page.reload();
  await expect(waist).toHaveValue("85");
});

test("measurement save clears recovery after the existing durable queue stores it", async ({ page }) => {
  await setup(page);
  let saved: { date: string; waist_cm?: number; note: string | null } | null = null;
  let date = "";
  await page.route("**/measurements/daily?*", (route) => {
    date = new URL(route.request().url()).searchParams.get("date") ?? "";
    if (route.request().method() === "PUT") saved = { ...route.request().postDataJSON(), date };
    return route.fulfill({ json: saved ?? { date, note: null } });
  });
  await page.route("**/measurements/range?*", (route) => route.fulfill({ json: { start: "2025-10-03", end: "2026-10-03", items: saved ? [saved] : [] } }));
  await page.goto("/measurements");
  await expect(page.getByRole("button", { name: "Сохранить замер" })).toBeEnabled();
  await page.getByLabel("Талия, см", { exact: true }).fill("85");
  await page.getByRole("button", { name: "Сохранить замер" }).click();
  await expect(page.getByRole("button", { name: "Обновить замер" })).toBeEnabled();
  await expect.poll(() => page.evaluate(({ owner, selectedDate }) => localStorage.getItem(`fitness_form_draft:v1:${owner}:measurement:${selectedDate}`), { owner: USER, selectedDate: date })).toBeNull();
  await page.reload();
  await expect(page.getByLabel("Талия, см", { exact: true })).toHaveValue("85");
});

test("broadcast replacement keeps the previous draft recoverable and save clears it", async ({ page }) => {
  await setup(page);
  await broadcastRoutes(page);
  await page.goto("/admin/broadcasts");
  await page.getByLabel("Заголовок", { exact: true }).fill("Несохранённая рассылка");
  await page.getByLabel(/Текст/).fill("Длинный текст черновика");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Копировать как черновик" }).click();
  await expect(page.getByLabel("Заголовок", { exact: true })).toHaveValue("Копия");
  await page.goto("/admin/broadcasts");
  await expect(page.getByLabel("Заголовок", { exact: true })).toHaveValue("Несохранённая рассылка");
  await expect(page.getByLabel(/Текст/)).toHaveValue("Длинный текст черновика");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByLabel("Заголовок", { exact: true })).toHaveValue("Копия");
  await expect.poll(() => page.evaluate((owner) => localStorage.getItem(`fitness_form_draft:v1:${owner}:broadcast:new`), USER)).toBeNull();
  await page.reload();
  await expect(page.getByLabel("Заголовок", { exact: true })).toHaveValue("Копия");
});

for (const [label, entry] of [["missing entry fields", {}], ["invalid nested times", { times: {} }]] as const) {
  test(`corrupt supplement recovery with ${label} preserves the working form`, async ({ page }) => {
    await setup(page);
    await page.addInitScript(({ owner, corruptEntry }) => {
      localStorage.setItem(`fitness_form_draft:v1:${owner}:profile:supplements`, JSON.stringify({
        stack: [corruptEntry], pickerKey: "", customName: "", customDose: "",
      }));
    }, { owner: USER, corruptEntry: entry });
    await page.goto("/profile/settings?section=supplements");
    await expect(page.getByLabel("Название своей добавки", { exact: true })).toBeVisible();
    await expect(page.getByText("Стек пуст — добавьте из каталога ниже.", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(owner => localStorage.getItem(`fitness_form_draft:v1:${owner}:profile:supplements`), USER)).toBeNull();
  });
}

test("saving the supplement stack preserves the unfinished custom supplement", async ({ page }) => {
  await setup(page);
  await page.route("**/supplements/intakes/today**", route => route.fulfill({ json: {
    date: "2026-10-03", timezone: "Europe/Moscow", total: 0, taken: 0, skipped: 0, pending: 0, items: [],
  } }));
  await page.goto("/profile/settings?section=supplements");
  await page.getByLabel("Название своей добавки", { exact: true }).fill("Моя незавершённая добавка");
  await page.getByLabel("Доза своей добавки", { exact: true }).fill("5 г");
  await page.getByRole("button", { name: "Сохранить дозы и время", exact: true }).click();
  await expect(page.getByText("Стек добавок сохранён", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Название своей добавки", { exact: true })).toHaveValue("Моя незавершённая добавка");
  await expect(page.getByLabel("Доза своей добавки", { exact: true })).toHaveValue("5 г");
  await page.getByRole("button", { name: "Отменить изменения", exact: true }).click();
  await expect(page.getByLabel("Название своей добавки", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Доза своей добавки", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("Название своей добавки", { exact: true })).toHaveValue("");
});

for (const action of ["add", "remove"] as const) {
  test(`supplement ${action} freezes editable fields until its pending request finishes`, async ({ page }) => {
    await setup(page);
    const entry = { id: "creatine", key: "creatine", name_ru: "Креатин", dose: "5 г", times: [], schedule: [], enabled: true, custom: false, notes: "" };
    let items = action === "remove" ? [entry] : [];
    await page.route("**/supplements/stack", route => route.fulfill({ json: { items, catalog: [] } }));
    await page.route("**/supplements/intakes/today**", route => route.fulfill({ json: {
      date: "2026-10-03", timezone: "Europe/Moscow", total: 0, taken: 0, skipped: 0, pending: 0, items: [],
    } }));
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const mutation = action === "add" ? "**/supplements/stack/custom" : "**/supplements/stack/creatine";
    await page.route(mutation, async route => {
      await gate;
      items = action === "add" ? [entry] : [];
      return route.fulfill({ json: { items, catalog: [] } });
    });
    await page.goto("/profile/settings?section=supplements");
    const name = page.getByLabel("Название своей добавки", { exact: true });
    await name.fill("Незавершённая добавка");
    await page.getByRole("button", { name: action === "add" ? "Добавить свою" : "Удалить", exact: true }).click();
    try {
      await expect(name).toBeDisabled();
      await expect(page.getByLabel("Доза своей добавки", { exact: true })).toBeDisabled();
    } finally { release(); }
    await expect(name).toBeEnabled();
    await expect(name).toHaveValue(action === "add" ? "" : "Незавершённая добавка");
    await page.reload();
    await expect(name).toHaveValue(action === "add" ? "" : "Незавершённая добавка");
  });
}

test("late save from an exited profile cannot clear edits in the reopened form", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const removed: string[] = [];
    Reflect.set(window, "auditStorageRemoved", removed);
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key: string) { removed.push(key); return remove.call(this, key); };
  });
  let savedHeight = 180;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/users/me", async route => {
    if (route.request().method() === "PUT") {
      const submittedHeight = route.request().postDataJSON().anthropometry.height_cm;
      await gate;
      savedHeight = submittedHeight;
    }
    return route.fulfill({ json: { id: USER, telegram_id: 42, username: "Filatov_Slava",
      anthropometry: { sex: "male", height_cm: savedHeight, age: 30 }, goals: { onboarding_completed: true },
      subscription_status: "free", stars_balance: 0, onboarding_completed: true } });
  });
  await page.goto("/profile/settings");
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("180");
  await page.getByLabel("Рост, см", { exact: true }).fill("185");
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("185");
  const submitted = page.waitForRequest(request => request.url().endsWith("/users/me") && request.method() === "PUT");
  await page.getByRole("button", { name: "Сохранить тело и калории", exact: true }).click();
  await submitted;
  try {
    await page.getByRole("link", { name: "Профиль", exact: true }).click();
    await page.getByRole("link", { name: /Настройки профиля/ }).click();
    await expect(page.getByLabel("Рост, см", { exact: true })).toBeEnabled();
    await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("185");
    await page.getByLabel("Рост, см", { exact: true }).fill("195");
    await expect.poll(() => page.evaluate(owner => JSON.parse(localStorage.getItem(`fitness_form_draft:v1:${owner}:profile:body`) ?? "{}").height, USER)).toBe("195");
  } finally { release(); }
  // This existing queue cleanup finishes before the exited instance clears recovery.
  await expect.poll(() => page.evaluate(owner => (Reflect.get(window, "auditStorageRemoved") as string[]).includes(`fitness_profile_draft_v2:${owner}`), USER)).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.reload();
  await expect(page.getByLabel("Рост, см", { exact: true })).toHaveValue("195");
});
