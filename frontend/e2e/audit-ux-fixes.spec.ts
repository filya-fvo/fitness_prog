import { acceptedLegalStatus } from "./legal-fixture";
import { expect, test, type Page } from "@playwright/test";

const programId = "33333333-3333-4333-8333-333333333333";
const settings = {
  timezone: "Europe/Moscow", delivery_channel: "telegram", catch_up: true,
  quiet_hours: { enabled: false, start_time: "22:00", end_time: "08:00" },
  measurements: { enabled: true, time: "10:00", interval_days: 14, weekday: 0 },
  workouts: { enabled: true, time: "18:30", days: [0, 2, 4], remind_before_minutes: 60 },
  supplements: { enabled: true },
  water: { enabled: false, daily_ml: 2500, interval_minutes: 120, start_time: "09:00", end_time: "21:00" },
  calories: { enabled: true, times: ["14:00", "20:00"] },
  service_messages: { email_enabled: false },
};

async function setup(page: Page, active = false) {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "isolated-audit-regression"));
  await page.route("**/users/me", route => route.fulfill({ json: {
legal_status: acceptedLegalStatus("11111111-1111-4111-8111-111111111111"),
    id: "11111111-1111-4111-8111-111111111111", telegram_id: 123456,
    username: "audit-fixture", auth_email: null, anthropometry: { sex: "male" },
    goals: { onboarding_completed: true, ...(active ? { active_program_id: programId } : {}) },
    subscription_status: "free", stars_balance: 0, onboarding_completed: true,
  } }));
  await page.route("**/notifications/push/config", route => route.fulfill({ json: {
    enabled: false, public_key: "", subscriptions: 0,
  } }));
  await page.route("**/supplements/stack", route => route.fulfill({ json: { items: [], catalog: [] } }));
  await page.route("**/programs/mine", route => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route(/\/programs(?:\?.*)?$/, route => route.request().isNavigationRequest()
    ? route.continue()
    : route.fulfill({ json: { items: [{
      id: programId, name: "Зал · Сила и база", description: "План тренировок",
      target_level: "beginner", duration_weeks: 8, structure: { schedule: [] },
      workout_type: "strength", level: "beginner", is_template: true, publication_status: "published",
    }], total: 1 } }));
  await page.route(/\/exercises(?:\?.*)?$/, route => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 200 } }));
  await page.route("**/workouts/history", route => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route("**/workouts/illness", route => route.fulfill({ json: { active: false } }));
  await page.route("**/workouts/schedule/overview**", route => route.fulfill({ json: { current: null, next: null } }));
  await page.route("**/metrics/daily**", route => route.fulfill({ json: { date: "2026-10-03", sources: {} } }));
  await page.route("**/notifications/water**", route => route.fulfill({ json: {
    date: "2026-10-03", ml: 1500, daily_target_ml: 2500,
  } }));
}

test("notification load can recover without leaving the page", async ({ page }) => {
  await setup(page);
  let failing = true;
  await page.route("**/notifications/settings", route => route.fulfill(failing
    ? { status: 503, json: { detail: "Временно недоступно" } }
    : { json: { settings, defaults: settings, last_delivery: null, timezone_configured: true } }));
  await page.goto("/notifications");
  await expect(page.getByRole("alert")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(page.getByRole("region", { name: "Куда присылать" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Ваш часовой пояс")).toHaveValue("Europe/Moscow");
});

test("settings load while browser push waits for a service worker", async ({ page }) => {
  await setup(page);
  await page.route("**/notifications/push/config", route => route.fulfill({ json: {
    enabled: true, public_key: "audit-dummy-public-key", subscriptions: 0,
  } }));
  await page.route("**/notifications/settings", route => route.fulfill({ json: {
    settings, defaults: settings, last_delivery: null, timezone_configured: true,
  } }));
  await page.goto("/notifications");
  await expect(page.getByRole("region", { name: "Куда присылать" })).toBeVisible();
  await expect(page.getByLabel("Ваш часовой пояс")).toHaveValue("Europe/Moscow");
});

async function mockBrowserPush(page: Page) {
  await page.addInitScript(() => {
    class FakeNotification {
      static permission = "granted";
      static async requestPermission() { return "granted"; }
    }
    const subscription = {
      endpoint: "https://example.invalid/isolated-audit-push",
      options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "fixture", auth: "fixture" } }; },
      async unsubscribe() { return true; },
    };
    Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
    Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {
      ready: Promise.resolve({ pushManager: {
        async getSubscription() { return subscription; },
        async subscribe() { return subscription; },
      } }),
      addEventListener() {}, removeEventListener() {},
    } });
  });
}

test("late initial push reconciliation cannot undo successful user enable", async ({ page }) => {
  await setup(page);
  await mockBrowserPush(page);
  const push = { enabled: true, public_key: "AQID", subscriptions: 1 };
  await page.route("**/notifications/push/config", route => route.fulfill({ json: push }));
  await page.route("**/notifications/settings", route => route.fulfill({ json: {
    settings: { ...settings, delivery_channel: "browser" }, defaults: settings,
    last_delivery: null, timezone_configured: true,
  } }));
  let requests = 0;
  let releaseInitial!: () => void;
  const initialGate = new Promise<void>(resolve => { releaseInitial = resolve; });
  await page.route("**/notifications/push/subscriptions", async route => {
    if (++requests === 1) {
      await initialGate;
      await route.fulfill({ status: 503, json: { detail: "Initial reconciliation failed" } });
    } else {
      await route.fulfill({ json: push });
    }
  });
  const initialResponse = page.waitForResponse(response => response.url().endsWith("/notifications/push/subscriptions") && response.status() === 503);
  await page.goto("/notifications");
  await expect.poll(() => requests).toBe(1);
  try {
    await page.getByRole("button", { name: "Включить", exact: true }).click();
    await expect(page.getByRole("button", { name: "Отключить", exact: true })).toBeVisible();
    expect(requests).toBe(2);
  } finally {
    releaseInitial();
  }
  await (await initialResponse).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("button", { name: "Отключить", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Включить", exact: true })).toHaveCount(0);
});

test("supplement notification link opens the supplement editor", async ({ page }) => {
  await setup(page);
  await page.route("**/notifications/settings", route => route.fulfill({ json: {
    settings, defaults: settings, last_delivery: null, timezone_configured: true,
  } }));
  await page.goto("/notifications");
  const supplements = page.locator("details").filter({ hasText: "Добавки" });
  await supplements.locator("summary").click();
  await supplements.getByRole("link", { name: "Настроить добавки →" }).click();
  await expect(page).toHaveURL(/\/profile\/settings\?section=supplements$/);
  await expect(page.getByRole("button", { name: "Добавить выбранную" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Добавить свою" })).toBeVisible();
});

for (const active of [false, true]) {
  test(`home distinguishes selected program from recommendation: active=${active}`, async ({ page }) => {
    await setup(page, active);
    await page.goto("/");
    const banner = page.locator(".home-program-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(active ? "Моя программа" : "Рекомендуемая программа");
    if (!active) {
      await expect(page.getByRole("button", { name: "Начать тренировку →" })).toHaveCount(0);
      await page.getByRole("link", { name: "Выбрать рекомендуемую программу" }).click();
      await expect(page).toHaveURL(/\/programs$/);
    }
  });
}

test("home retains an active archived program absent from the current catalog", async ({ page }) => {
  await setup(page, true);
  await page.route(/\/programs(?:\?.*)?$/, route => route.request().isNavigationRequest()
    ? route.continue()
    : route.fulfill({ json: { items: [], total: 0 } }));
  await page.route(`**/programs/${programId}`, route => route.fulfill({ json: {
    id: programId, name: "Мой прежний план", structure: { schedule: [] },
    workout_type: "strength", publication_status: "archived", is_template: true,
  } }));
  await page.goto("/");
  await expect(page.locator(".home-program-banner")).toContainText("Моя программа");
  await expect(page.getByText("Мой прежний план", { exact: true })).toBeVisible();
  await expect(page.getByText("Выберите свою первую программу")).toHaveCount(0);
});

test("home does not erase the selected program when its request fails", async ({ page }) => {
  await setup(page, true);
  await page.route(/\/programs(?:\?.*)?$/, route => route.request().isNavigationRequest()
    ? route.continue()
    : route.fulfill({ json: { items: [], total: 0 } }));
  await page.route(`**/programs/${programId}`, route => route.fulfill({ status: 503, json: { detail: "Временно недоступно" } }));
  await page.goto("/");
  await expect(page.getByText("Не удалось открыть выбранную программу")).toBeVisible();
  await expect(page.getByText("Выбор сохранён.", { exact: false })).toBeVisible();
  await expect(page.getByText("Выберите свою первую программу")).toHaveCount(0);
  await expect(page.locator(".home-program-banner")).toHaveCount(0);
});

test("home distinguishes a profile load failure from an absent program choice", async ({ page }) => {
  await setup(page);
  let calls = 0;
  await page.route("**/users/me", route => route.fulfill(++calls === 1 ? { json: {
legal_status: acceptedLegalStatus("11111111-1111-4111-8111-111111111111"),
    id: "11111111-1111-4111-8111-111111111111", telegram_id: 123456,
    username: "audit-fixture", anthropometry: { sex: "male" },
    goals: { onboarding_completed: true }, subscription_status: "free",
    stars_balance: 0, onboarding_completed: true,
  } } : { status: 503, json: { detail: "Временно недоступно" } }));
  await page.goto("/");
  await expect(page.getByText("Не удалось загрузить ваш план")).toBeVisible();
  await expect(page.getByText("Выберите свою первую программу")).toHaveCount(0);
  await expect(page.locator(".home-program-banner")).toHaveCount(0);
});

test("quiet hour errors are linked to the times and focus their source", async ({ page }) => {
  await setup(page);
  let writes = 0;
  await page.route("**/notifications/settings", route => {
    if (route.request().method() !== "GET") writes++;
    return route.fulfill({ json: {
      settings: { ...settings, quiet_hours: { enabled: true, start_time: "22:00", end_time: "22:00" } },
      defaults: settings, timezone_configured: true,
    } });
  });
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Сохранить доставку и тишину" }).click();
  const end = page.getByLabel("До", { exact: true });
  await expect(end).toBeFocused();
  await expect(end).toHaveAttribute("aria-invalid", "true");
  const errorId = await end.getAttribute("aria-describedby");
  expect(errorId).toBeTruthy();
  await expect(page.locator(`[id="${errorId}"]`)).toContainText("Начало и конец тихих часов должны отличаться");
  expect(writes).toBe(0);
  await end.fill("08:00");
  await expect(end).not.toHaveAttribute("aria-invalid", "true");
});

test("empty analytics separates missing upcoming slot from historical volume", async ({ page }) => {
  await page.goto("/e2e/audit-analytics.html");
  await expect(page.getByRole("heading", { name: "Силовые тренды" })).toBeVisible();
  await expect(page.getByText(/Настройте программу и расписание/)).toHaveCount(0);
  await expect(page.getByText(/За последние 14 дней нет завершённых тренировок/)).toBeVisible();
});

test("activity percentages remain readable in light theme", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("fitness_theme_preference", "light"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/activity");
  const percentage = page.getByRole("region", { name: "Вода" }).getByText("60%", { exact: true });
  await expect(percentage).toBeVisible();
  const color = await percentage.evaluate(node => getComputedStyle(node).color);
  const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const linear = channels.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
});
