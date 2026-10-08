import { acceptedLegalStatus } from "./legal-fixture";
import { expect, test, type Page, type Locator } from "@playwright/test";

const USER_ID = "42424242-4242-4424-8424-424242424242";
async function installProfile(page: Page) {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "field-names-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({ json: {
legal_status: acceptedLegalStatus(USER_ID),
    id: USER_ID, telegram_id: 42, username: "Filatov_Slava", auth_email: null,
    anthropometry: {}, goals: { onboarding_completed: true }, subscription_status: "free",
    stars_balance: 0, onboarding_completed: true,
  } }));
}

async function expectKeyboardReturn(page: Page, field: Locator) {
  await field.focus();
  await page.keyboard.press("Tab");
  await expect(field).not.toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(field).toBeFocused();
}

async function typeAndCheckName(page: Page, placeholder: string, name: string, value: string) {
  await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
  const field = page.getByLabel(name, { exact: true });
  await expect(field).toHaveValue(value);
  await expectKeyboardReturn(page, field);
}

for (const field of [
  { placeholder: "Название", name: "Название своей добавки", value: "Креатин" },
  { placeholder: "Доза, напр. 5 г", name: "Доза своей добавки", value: "5 г" },
  { placeholder: null, name: "Добавить из каталога", value: "creatine" },
]) {
  test(`supplement field keeps its accessible name after input: ${field.name}`, async ({ page }) => {
    await installProfile(page);
    await page.route(/\/programs(?:\?|$)/, (route) => route.fulfill({ json: { items: [], total: 0 } }));
    await page.route("**/programs/mine", (route) => route.fulfill({ json: { items: [], total: 0 } }));
    await page.route("**/supplements/stack", (route) => route.fulfill({ json: { items: [], catalog: [{
      key: "creatine", name_ru: "Креатин", default_dose: "5 г", effects: "Поддержка силы",
    }] } }));
    await page.goto("/profile/settings?section=supplements");
    await expect(page.getByRole("button", { name: "Добавить выбранную" })).toBeVisible();
    if (field.placeholder) {
      await typeAndCheckName(page, field.placeholder, field.name, field.value);
    } else {
      await page.getByRole("button", { name: "Добавить выбранную" }).locator("..").locator("select").selectOption(field.value);
      await expect(page.getByLabel(field.name, { exact: true })).toHaveValue(field.value);
      await expectKeyboardReturn(page, page.getByLabel(field.name, { exact: true }));
    }
  });
}

test("food search remains named after typing and participates in keyboard navigation", async ({ page }) => {
  await installProfile(page);
  await page.route("**/nutrition/daily?*", (route) => route.fulfill({ json: {
    date: "2026-10-03", totals: { calories: 0, proteins: 0, fats: 0, carbs: 0 },
    meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
    targets: { complete: true, calories_target: 2000, bmr: 1700, tdee: 2500, calorie_adjustment_pct: -20,
      macros: { proteins_g: 120, fats_g: 65, carbs_g: 220 } },
  } }));
  await page.route("**/nutrition/products?*", (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.goto("/nutrition");
  await page.getByRole("button", { name: "+ Добавить продукт" }).click();
  await typeAndCheckName(page, "Поиск: яблоко, курица…", "Поиск продукта", "яблоко");
});

for (const field of [
  { fixture: "filters", placeholder: "Поиск: фамилия, @логин, почта, Telegram ID", name: "Поиск пользователя", value: "Петров" },
  { fixture: "filters", placeholder: "Название текущего набора", name: "Название набора фильтров", value: "Мои фильтры" },
  { fixture: "planned", placeholder: "Поиск среди рекомендаций", name: "Поиск замены упражнения", value: "жим" },
  { fixture: "import", placeholder: '[{"name_ru":"…","muscle_group":"…"}]', name: "JSON упражнений", value: '[{"name_ru":"Жим","muscle_group":"грудь"}]' },
  { fixture: "actions", placeholder: "Служебное сообщение пользователю", name: "Текст служебного сообщения", value: "Тестовая заметка" },
]) {
  test(`real component keeps its field name after input: ${field.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(`/e2e/fixtures/audit-fields.html?fixture=${field.fixture}`);
    if (field.fixture === "planned") await expect(page.getByRole("button", { name: "Выбрать", exact: true })).toBeVisible();
    if (field.fixture === "import") await page.getByText("Предварительная проверка импорта", { exact: true }).click();
    await typeAndCheckName(page, field.placeholder, field.name, field.value);
    if (field.name === "Поиск пользователя") {
      await page.getByLabel(field.name, { exact: true }).press("Enter");
      await expect(page.getByLabel("Применённый поиск")).toHaveText("Петров");
    }
    if (field.fixture === "planned") {
      await page.getByRole("button", { name: "Весь каталог" }).click();
      await expect(page.getByLabel(field.name, { exact: true })).toHaveValue("жим");
    }
  });
}

test("admin catalog search stays named after entering and applying a query", async ({ page }) => {
  await installProfile(page);
  await page.route("**/admin/exercises/options", (route) => route.fulfill({ json: { muscle_groups: [], equipment: [], tags: [] } }));
  await page.route(/\/admin\/exercises(?:\?|$)/, (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    return route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 20 } });
  });
  await page.goto("/admin/exercises");
  await typeAndCheckName(page, "Название или тег", "Поиск упражнения в каталоге", "жим");
  const requestPromise = page.waitForRequest((request) => request.url().includes("/admin/exercises?") && new URL(request.url()).searchParams.get("q") === "жим");
  await page.getByLabel("Поиск упражнения в каталоге", { exact: true }).press("Enter");
  await requestPromise;
});

test("admin draft name stays named after input", async ({ page }) => {
  await installProfile(page);
  await page.route(/\/programs(?:\?|$)/, (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto("/admin/programs");
  await typeAndCheckName(page, "Название программы", "Название новой программы", "Силовой план");
  await expect(page.getByRole("button", { name: "Создать черновик" })).toBeEnabled();
});

for (const layout of [
  { width: 320, height: 500, colorScheme: "dark" },
  { width: 375, height: 667, colorScheme: "light" },
  { width: 393, height: 852, colorScheme: "light" },
  { width: 1440, height: 900, colorScheme: "dark" },
] as const) {
  test(`remove exercise has a 44 by 44 target and works from the keyboard at ${layout.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.emulateMedia({ colorScheme: layout.colorScheme });
    await page.goto("/e2e/fixtures/audit-fields.html?fixture=day");
    const remove = page.getByRole("button", { name: "Удалить Жим гантелей", exact: true });
    await expect(remove).toBeVisible();
    const box = await remove.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await remove.focus();
    await expect(remove).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(remove).toHaveCount(0);
    await expect(page.getByText("Добавьте хотя бы одно упражнение.", { exact: true })).toBeVisible();
  });
}
