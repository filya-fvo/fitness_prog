import { expect, test, type Page } from "@playwright/test";
import { acceptedLegalStatus } from "./legal-fixture";

const owner = "22222222-2222-4222-8222-222222222222";
const target = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const user = { id: owner, auth_email: "source@example.test", telegram_id: null, username: null,
  subscription_status: "free", onboarding_completed: true, legal_status: acceptedLegalStatus(owner) };
const linked = { ...user, telegram_id: 123456789, username: "fixture_telegram" };
const started = { request_id: requestId, bot_url: "https://t.me/fil_fit_bot?start=telegram_link_" + "x".repeat(43), expires_in_sec: 300 };
const preview = { conflicts: ["Данные тела и замеры"],
  email: { email: user.auth_email, onboarding_completed: true, counts: { workouts: 2, nutrition: 3 } },
  telegram: { username: "fixture_telegram", onboarding_completed: true, counts: { workouts: 4, nutrition: 5 } } };

async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "source-session"));
  await page.route("**/users/me", route => route.request().method() === "GET" ? route.fulfill({ json: { ...user, anthropometry: {}, goals: {}, stars_balance: 0 } }) : route.fulfill({ status: 503, json: { detail: "fixture mutation offline" } }));
  await page.route("**/auth/telegram/link/start", route => {
    expect(route.request().postDataJSON().challenge).toMatch(/^[a-f0-9]{64}$/);
    return route.fulfill({ json: started });
  });
  await page.route("**/auth/telegram/link/status", route => route.fulfill({ json: { state: "ready", display_name: "Тест (@fixture_telegram)" } }));
  await page.route("**/auth/telegram/link/cancel", route => route.fulfill({ json: { ok: true } }));
  await page.goto("/profile");
}

async function confirm(page: Page) {
  await page.getByRole("button", { name: "Подключить Telegram", exact: true }).click();
  await expect(page.getByRole("link", { name: "Открыть бота для подтверждения" })).toHaveAttribute("href", started.bot_url);
  await page.getByRole("button", { name: "Проверить подтверждение" }).click();
  await expect(page.getByText("Тест (@fixture_telegram)")).toBeVisible();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
}

test("free Telegram connects to current profile only after bot approval", async ({ page }) => {
  await setup(page);
  let completed = false;
  await page.route("**/auth/telegram/link/complete", route => {
    completed = true;
    const body = route.request().postDataJSON();
    expect(body.request_id).toBe(requestId);
    expect(body.verifier).toMatch(/^[a-f0-9]{64}$/);
    expect(body.merge_preference).toBeUndefined();
    return route.fulfill({ json: { ok: true, message: "Telegram подключён", user: linked, access_token: "linked-session" } });
  });
  expect(completed).toBe(false);
  await confirm(page);
  await expect(page.getByText("Telegram подключён", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBe("linked-session");
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("fitness_cached_user_v1")))!).id).toBe(owner);
});

test("occupied Telegram waits for explicit merge choice and adopts offline queue", async ({ page }) => {
  await setup(page);
  await page.evaluate(async owner => {
    const path = "/src/db/schema.ts";
    const { db } = await import(path);
    await db.syncQueue.put({ id: "offline-fixture", ownerUserId: owner, type: "update_profile", clientWorkoutId: "", payload: { goals: { fixture: true } }, createdAt: Date.now(), attempts: 0, lastError: null });
  }, owner);
  let choices = 0;
  await page.route("**/auth/telegram/link/complete", route => {
    const body = route.request().postDataJSON();
    if (!body.merge_preference) return route.fulfill({ json: { ok: true, message: "Найдены два аккаунта", merge_required: true, merge_preview: preview, merge_target_id: target } });
    choices++;
    expect(body.merge_preference).toBe("email");
    expect(body.merge_target_id).toBe(target);
    return route.fulfill({ json: { ok: true, message: "Telegram подключён", access_token: "merged-session", user: { ...linked, id: target, legal_status: acceptedLegalStatus(target), merged_from_user_ids: [owner] } } });
  });
  await confirm(page);
  await expect(page.getByText("Найдены два аккаунта", { exact: true })).toBeVisible();
  expect(choices).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBe("source-session");
  await page.getByRole("button", { name: "Основные данные — из этого аккаунта" }).click();
  await expect(page.getByText("Telegram подключён", { exact: true })).toBeVisible();
  const queue = await page.evaluate(async () => { const path = "/src/db/schema.ts"; const { db } = await import(path); return db.syncQueue.get("offline-fixture"); });
  expect(queue.ownerUserId).toBe(target);
  expect(queue.payload.goals.fixture).toBe(true);
});

test("link cancellation does not complete or switch account", async ({ page }) => {
  await setup(page);
  let completed = false, cancelled = false;
  await page.route("**/auth/telegram/link/complete", route => { completed = true; return route.abort(); });
  await page.route("**/auth/telegram/link/cancel", route => { cancelled = true; return route.fulfill({ json: { ok: true } }); });
  await page.getByRole("button", { name: "Подключить Telegram", exact: true }).click();
  await page.getByRole("button", { name: "Отменить подключение" }).click();
  await expect(page.getByRole("button", { name: "Подключить Telegram", exact: true })).toBeVisible();
  expect(cancelled).toBe(true); expect(completed).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBe("source-session");
});

test("failed status is retryable and pending status never completes automatically", async ({ page }) => {
  await setup(page);
  let attempts = 0;
  await page.route("**/auth/telegram/link/status", route => ++attempts === 1 ? route.fulfill({ status: 503, json: { detail: "fixture unavailable" } }) : route.fulfill({ json: { state: "waiting" } }));
  await page.getByRole("button", { name: "Подключить Telegram", exact: true }).click();
  await page.getByRole("button", { name: "Проверить подтверждение" }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось");
  await page.getByRole("button", { name: "Проверить подтверждение" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Продолжить", exact: true })).toHaveCount(0);
});

test("late completion cannot replace a different saved session", async ({ page, context }) => {
  await setup(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route("**/auth/telegram/link/complete", async route => { requested = true; await held; await route.fulfill({ json: { ok: true, message: "Telegram подключён", user: linked, access_token: "stale-session" } }); });
  await confirm(page);
  await expect.poll(() => requested).toBe(true);
  const other = await context.newPage();
  await other.goto("/help");
  await other.evaluate(() => localStorage.setItem("fitness_jwt", "different-session"));
  release();
  await expect(page.getByRole("link", { name: "Открыть бота для подтверждения" })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBe("different-session");
  await expect(page.getByText("Telegram подключён", { exact: true })).toHaveCount(0);
});

for (const width of [320, 393, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`Telegram link fits ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.addInitScript(theme => localStorage.setItem("fitness_theme_preference", theme), theme);
    await setup(page);
    await page.getByRole("button", { name: "Подключить Telegram", exact: true }).click();
    await expect(page.getByRole("link", { name: "Открыть бота для подтверждения" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 393 && theme === "dark") await page.screenshot({ path: `../.superpowers/sdd/2026-10-21-guides-links-telegram/link-${page.context().browser()?.browserType().name()}.png` });
  });
}


test("confirmed merge retries local adoption without repeating consumed server request", async ({ page }) => {
  await setup(page);
  await page.evaluate(async ({ owner, target }) => {
    const path = "/src/db/schema.ts";
    const { db } = await import(path);
    await db.syncQueue.put({ id: "receipt-fixture", ownerUserId: owner, type: "update_profile", clientWorkoutId: "", payload: { goals: { fixture: true } }, createdAt: Date.now(), attempts: 0, lastError: null });
    let failed = false;
    db.syncQueue.hook("updating", (changes: { ownerUserId?: string }) => {
      if (changes.ownerUserId === target && !failed) { failed = true; throw new Error("fixture storage unavailable once"); }
    });
  }, { owner, target });
  let completeCalls = 0;
  await page.route("**/auth/telegram/link/complete", route => {
    if (!route.request().postDataJSON().merge_preference) return route.fulfill({ json: { ok: true, message: "Найдены два аккаунта", merge_required: true, merge_preview: preview, merge_target_id: target } });
    completeCalls++;
    return route.fulfill({ json: { ok: true, message: "Telegram подключён", access_token: "merged-session", user: { ...linked, id: target, legal_status: acceptedLegalStatus(target), merged_from_user_ids: [owner] } } });
  });
  await confirm(page);
  await page.getByRole("button", { name: "Основные данные — из этого аккаунта" }).click();
  await expect(page.getByRole("button", { name: "Повторить завершение" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Не удалось");
  await page.getByRole("button", { name: "Повторить завершение" }).click();
  await expect(page.getByText("Telegram подключён", { exact: true })).toBeVisible();
  expect(completeCalls).toBe(1);
  const queue = await page.evaluate(async () => { const path = "/src/db/schema.ts"; const { db } = await import(path); return db.syncQueue.get("receipt-fixture"); });
  expect(queue.ownerUserId).toBe(target);
});

test("invalid bot URL cannot be opened from link response", async ({ page }) => {
  await setup(page);
  await page.route("**/auth/telegram/link/start", route => route.fulfill({ json: { ...started, bot_url: "https://invalid.example/steal" } }));
  await page.getByRole("button", { name: "Подключить Telegram", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось");
  await expect(page.getByRole("link", { name: "Открыть бота для подтверждения" })).toHaveCount(0);
});

test("owner switch discards a late approved response", async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route("**/auth/telegram/link/complete", async route => { requested = true; await held; await route.fulfill({ json: { ok: true, message: "Telegram подключён", user: linked, access_token: "stale-session" } }); });
  await confirm(page);
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(async id => {
    const path = "/src/store/userStore.ts";
    const { useUserStore } = await import(path);
    useUserStore.getState().setUser({ ...useUserStore.getState().user, id });
  }, target);
  release();
  await expect(page.getByRole("link", { name: "Открыть бота для подтверждения" })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBe("source-session");
  await expect(page.getByText("Telegram подключён", { exact: true })).toHaveCount(0);
});


test("a changed owner in a free-link response cannot silently switch the account", async ({ page }) => {
  await setup(page);
  await page.route("**/auth/telegram/link/complete", route => route.fulfill({ json: { ok: true, message: "Telegram подключён", access_token: "unexpected-session", user: { ...linked, id: target, merged_from_user_ids: [owner] } } }));
  await confirm(page);
  await expect(page.getByRole("alert")).toContainText("Не удалось");
  expect(await page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBe("source-session");
  await expect(page.getByText("Telegram подключён", { exact: true })).toHaveCount(0);
});
