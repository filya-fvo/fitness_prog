import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { acceptedLegalStatus } from "./legal-fixture";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const user = (id = A) => ({ id, username: id === A ? "a" : "b", subscription_status: "free", onboarding_completed: true, legal_status: acceptedLegalStatus(id) });
const notice = (message = "• Диапазоны повторов и точное время.\n• Сохранение целей и введённых результатов.") => ({ id: ID, apk_version: 27, release_key: "test-apk27", title: "Обновление FilFit", message_text: message, apk_url: "https://app.filfitclub.ru/android/latest.apk", created_at: "2026-10-29T12:00:00Z" });
const fixture = "/e2e/fixtures/release-summary.html";
async function profile(page: Page) {
  await page.route("**/version.json?*", route => route.fulfill({ json: { buildId: "development" } }));
  await page.route("**/users/me", route => route.fulfill({ json: user(route.request().headers().authorization?.includes("owner-b") ? B : A) }));
}

test("release overlay appears once, traps focus and explicitly acknowledges without changing the page", async ({ page }) => {
  await profile(page);
  let read = false, requests = 0, acknowledgements = 0;
  await page.route("**/notifications/release-notices?*", route => { requests++; return route.fulfill({ json: { next_cursor: null, items: read ? [] : [notice()] } }); });
  await page.route(`**/notifications/release-notices/${ID}/seen?*`, route => { read = true; acknowledgements++; return route.fulfill({ json: { ok: true } }); });
  await page.goto(fixture);
  const overlay = page.getByRole("dialog", { name: "Обновление FilFit" });
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Диапазоны повторов и точное время");
  const close = overlay.getByRole("button", { name: "Закрыть изменения" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(overlay.getByRole("button", { name: "Понятно", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  expect(requests).toBe(1);
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
  await expect.poll(() => acknowledgements).toBe(1);
  await expect(page.getByRole("heading", { name: "Тестовая страница" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Тестовая страница" })).toBeVisible();
  await expect(overlay).toHaveCount(0);
  expect(acknowledgements).toBe(1);
});

test("offline close survives reload and retries only its own read receipt on reconnect", async ({ page, context }) => {
  await profile(page);
  let read = false, allowAck = false, successful = 0;
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { next_cursor: null, items: read ? [] : [notice()] } }));
  await page.route(`**/notifications/release-notices/${ID}/seen?*`, route => {
    if (!allowAck) return route.abort("internetdisconnected");
    expect(route.request().headers().authorization).toBe("Bearer release-owner-a");
    read = true; successful++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(fixture);
  const overlay = page.getByRole("dialog", { name: "Обновление FilFit" });
  await expect(overlay).toBeVisible();
  // Dev fixture assets are loaded before simulating a network loss (not a cold PWA boot).
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await overlay.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(overlay).toHaveCount(0);
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Тестовая страница" })).toBeVisible();
  await expect(overlay).toHaveCount(0);
  allowAck = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => successful).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Тестовая страница" })).toBeVisible();
  await expect(overlay).toHaveCount(0);
  expect(successful).toBe(1);
});

test("late owner response cannot display or acknowledge another account's summary", async ({ page }) => {
  await profile(page);
  let releaseA!: () => void;
  const holdA = new Promise<void>(resolve => { releaseA = resolve; });
  let startedA = false;
  await page.route("**/notifications/release-notices?*", async route => {
    const ownerB = route.request().headers().authorization?.includes("owner-b");
    if (!ownerB) { startedA = true; await holdA; }
    await route.fulfill({ json: { next_cursor: null, items: [notice(ownerB ? "Только для B" : "Только для A")] } }).catch(() => {});
  });
  const tokens: string[] = [];
  await page.route(`**/notifications/release-notices/${ID}/seen?*`, route => { tokens.push(route.request().headers().authorization); return route.fulfill({ json: { ok: true } }); });
  await page.goto(fixture);
  await expect.poll(() => startedA).toBe(true);
  await page.evaluate(profile => Reflect.get(window, "switchReleaseOwner")(profile), user(B));
  await expect(page.getByRole("dialog")).toContainText("Только для B");
  releaseA();
  await expect(page.getByText("Только для A")).toHaveCount(0);
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect.poll(() => tokens).toEqual(["Bearer release-owner-b"]);
});

test("late response is deferred while editing or training and does not alter a draft", async ({ page }) => {
  await profile(page);
  let release!: () => void, started = false;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/notifications/release-notices?*", async route => { started = true; await hold; await route.fulfill({ json: { next_cursor: null, items: [notice()] } }).catch(() => {}); });
  let acks = 0;
  await page.route(`**/notifications/release-notices/${ID}/seen?*`, route => { acks++; return route.fulfill({ json: { ok: true } }); });
  await page.goto(fixture);
  await expect.poll(() => started).toBe(true);
  await page.getByRole("link", { name: "Открыть форму" }).click();
  await page.getByLabel("Заметка", { exact: true }).fill("Несохранённый черновик");
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Заметка", { exact: true })).toHaveValue("Несохранённый черновик");
  await page.getByRole("link", { name: "Открыть тренировку" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Заметка", { exact: true })).toHaveValue("Несохранённый черновик");
  expect(acks).toBe(0);
  await page.getByRole("link", { name: "На главную" }).click();
  await expect(page.getByRole("dialog", { name: "Обновление FilFit" })).toBeVisible();
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(page.getByLabel("Заметка", { exact: true })).toHaveValue("Несохранённый черновик");
});

test("summary waits for another dialog and appears after it closes", async ({ page }) => {
  await profile(page);
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { next_cursor: null, items: [notice()] } }));
  await page.route(`**/notifications/release-notices/${ID}/seen?*`, route => route.fulfill({ json: { ok: true } }));
  await page.goto(fixture + "?modal");
  await expect(page.getByRole("dialog", { name: "Другой диалог" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Обновление FilFit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть другой диалог" }).click();
  await expect(page.getByRole("dialog", { name: "Обновление FilFit" })).toBeVisible();
});

for (const theme of ["light", "dark"]) test(`long summary fits a small viewport in ${theme}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 720 });
  await page.addInitScript(theme => localStorage.setItem("fitness_theme_preference", theme), theme);
  await profile(page);
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { next_cursor: null, items: [notice("Нововведения и исправления.\n".repeat(35) + "длинноеслово".repeat(20))] } }));
  await page.route(`**/notifications/release-notices/${ID}/seen?*`, route => route.fulfill({ json: { ok: true } }));
  await page.goto(fixture);
  const overlay = page.getByRole("dialog", { name: "Обновление FilFit" });
  await expect(overlay).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = (await overlay.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
  const button = overlay.getByRole("button", { name: "Понятно", exact: true });
  const buttonBounds = (await button.boundingBox())!;
  expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(720);
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await overlay.screenshot({ path: testInfo.outputPath(`summary-${theme}.png`) });
  await button.click();
  await expect(overlay).toHaveCount(0);
});

test("unavailable or malformed summary remains silent in an authenticated shell", async ({ page }) => {
  await profile(page);
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ status: 404, json: { detail: "not found" } }));
  await page.goto(fixture);
  await expect(page.getByRole("heading", { name: "Тестовая страница" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Открыть форму" }).click();
  await page.getByLabel("Заметка", { exact: true }).fill("Сеть не мешает форме");
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { next_cursor: null, items: [{ message_text: "неполный ответ" }] } }));
  await page.getByRole("link", { name: "На главную" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Заметка", { exact: true })).toHaveValue("Сеть не мешает форме");
  await expect(page.getByText("Не удалось войти", { exact: true })).toHaveCount(0);
});

test("foreground refresh receives new summaries without polling or permission prompts", async ({ page }) => {
  await profile(page);
  let fresh = false, requests = 0;
  await page.addInitScript(() => {
    if ("Notification" in window) Notification.requestPermission = async () => { throw Error("Unexpected permission request"); };
  });
  await page.route("**/notifications/release-notices?*", route => { requests++; return route.fulfill({ json: { next_cursor: null, items: fresh ? [notice()] : [] } }); });
  await page.route(`**/notifications/release-notices/${ID}/seen?*`, route => route.fulfill({ json: { ok: true } }));
  await page.goto(fixture);
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  fresh = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("dialog", { name: "Обновление FilFit" })).toBeVisible();
  expect(requests).toBe(2);
});

test("a delayed summary does not steal focus while switching Home input fields", async ({ page }) => {
  await profile(page);
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/notifications/release-notices?*", async route => { await hold; await route.fulfill({ json: { next_cursor: null, items: [notice()] } }); });
  await page.route(`**/notifications/release-notices/${ID}/seen?*`, route => route.fulfill({ json: { ok: true } }));
  await page.goto(fixture);
  const first = page.getByLabel("Заметка", { exact: true });
  await first.fill("Продолжаю вводить");
  const received = page.waitForResponse(response => response.url().includes("/notifications/release-notices?"));
  release(); await received;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const second = page.getByLabel("Другая заметка");
  await second.focus();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(second).toBeFocused();
  await page.getByRole("button", { name: "Другой диалог" }).focus();
  await expect(page.getByRole("dialog", { name: "Обновление FilFit" })).toBeVisible();
  await expect(first).toHaveValue("Продолжаю вводить");
});

for (const status of [404, 503, 409]) test(`old read ACK ${status} cannot block a newer summary`, async ({ page }) => {
  await profile(page);
  const old = "44444444-4444-4444-8444-444444444444";
  await page.addInitScript(({ owner, old }) => localStorage.setItem(`fitness_release_reads:v1:${owner}`, JSON.stringify([old])), { owner: A, old });
  let attempts = 0, gets = 0;
  await page.route("**/notifications/release-notices?*", route => { gets++; return route.fulfill({ json: { next_cursor: null, items: [notice("Новые изменения")] } }); });
  await page.route(`**/notifications/release-notices/${old}/seen?*`, route => { attempts++; return route.fulfill({ status, json: { detail: "old receipt unavailable" } }); });
  await page.goto(fixture);
  await expect(page.getByRole("dialog", { name: "Обновление FilFit" })).toContainText("Новые изменения");
  const pending = () => page.evaluate(owner => JSON.parse(localStorage.getItem(`fitness_release_reads:v1:${owner}`) || "[]"), A);
  await expect.poll(pending).toEqual(status === 404 ? [] : [old]);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(gets).toBe(1); // An already displayed snapshot does not refresh.
  await expect.poll(() => attempts).toBe(status === 404 ? 1 : 2);
});

test("a slow old read ACK cannot delay a healthy newer summary", async ({ page }) => {
  await profile(page);
  const old = "44444444-4444-4444-8444-444444444444";
  await page.addInitScript(({ owner, old }) => localStorage.setItem(`fitness_release_reads:v1:${owner}`, JSON.stringify([old])), { owner: A, old });
  let finish!: () => void;
  const held = new Promise<void>(resolve => { finish = resolve; });
  page.on("close", () => finish());
  await page.route(`**/notifications/release-notices/${old}/seen?*`, async route => { await held; await route.fulfill({ status: 503, json: { detail: "temporarily unavailable" } }).catch(() => {}); });
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { next_cursor: null, items: [notice("Показано до завершения ACK")] } }));
  try {
    await page.goto(fixture);
    await expect(page.getByRole("dialog", { name: "Обновление FilFit" })).toContainText("Показано до завершения ACK");
    expect(await page.evaluate(owner => JSON.parse(localStorage.getItem(`fitness_release_reads:v1:${owner}`) || "[]"), A)).toEqual([old]);
  } finally { finish(); }
});

const batch = (count: number) => Array.from({ length: count }, (_, index) => {
  const number = count - index;
  return { ...notice(`Изменение ${number}`), id: `55555555-5555-4555-8555-${String(number).padStart(12, "0")}`, release_key: `batch-${number}`, title: `Выпуск ${number}`, created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, number)).toISOString() };
});

test("all unread old and new releases share one overlay and close acknowledges the displayed set", async ({ page }, testInfo) => {
  await page.addInitScript(theme => localStorage.setItem("fitness_theme_preference", theme), testInfo.project.name === "iphone-webkit" ? "dark" : "light");
  await profile(page);
  const releases = batch(26), read = new Set<string>(), acknowledgements: string[] = [];
  let gets = 0;
  await page.route("**/notifications/release-notices?*", route => {
    gets++;
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    const remaining = releases.slice(cursor ? releases.findIndex(item => item.id === cursor) + 1 : 0).filter(item => !read.has(item.id));
    const items = remaining.slice(0, 20);
    return route.fulfill({ json: { items, next_cursor: remaining.length > 20 ? items.at(-1)!.id : null } });
  });
  await page.route("**/notifications/release-notices/*/seen?*", route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
    read.add(id); acknowledgements.push(id);
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(fixture);
  const overlay = page.getByRole("dialog");
  await expect(overlay.getByRole("heading", { level: 3 })).toHaveCount(26);
  expect(await overlay.getByRole("heading", { level: 3 }).allTextContents()).toEqual(releases.map(item => item.title));
  expect(gets).toBe(2);
  await overlay.screenshot({ path: testInfo.outputPath("aggregate-unread.png") });
  await overlay.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(overlay).toHaveCount(0);
  await expect.poll(() => acknowledgements.length).toBe(26);
  expect(new Set(acknowledgements)).toEqual(new Set(releases.map(item => item.id)));
  expect(gets).toBe(2); // Closing never opens a second modal in the same entry.
});

test("an open aggregate is frozen and a later release waits for the next opening", async ({ page }) => {
  await profile(page);
  const releases = batch(3), read = new Set<string>(), acknowledgements: string[] = [];
  let includeLater = false, gets = 0;
  await page.route("**/notifications/release-notices?*", route => {
    gets++;
    return route.fulfill({ json: { items: releases.filter((item, index) => (includeLater || index > 0) && !read.has(item.id)), next_cursor: null } });
  });
  await page.route("**/notifications/release-notices/*/seen?*", route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
    read.add(id); acknowledgements.push(id); return route.fulfill({ json: { ok: true } });
  });
  await page.goto(fixture);
  await expect(page.getByRole("dialog").getByRole("heading", { level: 3 })).toHaveCount(2);
  includeLater = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("dialog").getByRole("heading", { level: 3 })).toHaveCount(2);
  expect(gets).toBe(1);
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect.poll(() => acknowledgements.length).toBe(2);
  expect(acknowledgements).not.toContain(releases[0].id);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(gets).toBe(1);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("dialog")).toContainText("Изменение 3");
  expect(acknowledgements).not.toContain(releases[0].id);
});

test("partial page failure is explicit and closing during retry never acknowledges unseen sections", async ({ page }) => {
  await profile(page);
  const releases = batch(26), read = new Set<string>();
  let failed = false, finish!: () => void, retryStarted = false;
  const held = new Promise<void>(resolve => { finish = resolve; });
  page.on("close", () => finish());
  await page.route("**/notifications/release-notices?*", async route => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    if (cursor && !failed) { failed = true; await route.fulfill({ status: 503, json: { detail: "page unavailable" } }); return; }
    if (cursor) { retryStarted = true; await held; }
    const remaining = releases.slice(cursor ? releases.findIndex(item => item.id === cursor) + 1 : 0).filter(item => !read.has(item.id));
    const items = remaining.slice(0, 20);
    await route.fulfill({ json: { items, next_cursor: remaining.length > 20 ? items.at(-1)!.id : null } }).catch(() => {});
  });
  await page.route("**/notifications/release-notices/*/seen?*", route => {
    read.add(new URL(route.request().url()).pathname.split("/").at(-2)!);
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(fixture);
  const overlay = page.getByRole("dialog");
  await expect(overlay.getByRole("heading", { level: 3 })).toHaveCount(20);
  await expect(overlay).toContainText("Не все изменения загрузились");
  await overlay.getByRole("button", { name: "Загрузить остальные изменения" }).click();
  await expect.poll(() => retryStarted).toBe(true);
  await overlay.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect.poll(() => read.size).toBe(20);
  const completed = page.waitForResponse(response => response.url().includes("cursor="));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(overlay.getByRole("heading", { level: 3 })).toHaveCount(6);
  finish(); await completed;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(overlay.getByRole("heading", { level: 3 })).toHaveCount(6);
  expect(releases.slice(20).some(item => read.has(item.id))).toBe(false);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(overlay.getByRole("heading", { level: 3 })).toHaveCount(6);
});

test("65 displayed releases closed offline retain every read ID after reload", async ({ page, context }) => {
  await profile(page);
  const releases = batch(65);
  await page.route("**/notifications/release-notices?*", route => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    const remaining = releases.slice(cursor ? releases.findIndex(item => item.id === cursor) + 1 : 0);
    const items = remaining.slice(0, 20);
    return route.fulfill({ json: { items, next_cursor: remaining.length > 20 ? items.at(-1)!.id : null } });
  });
  await page.route("**/notifications/release-notices/*/seen?*", route => route.fulfill({ status: 503, json: { detail: "offline ACK" } }));
  await page.goto(fixture);
  await expect(page.getByRole("dialog").getByRole("heading", { level: 3 })).toHaveCount(65);
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  const pending = () => page.evaluate(owner => JSON.parse(localStorage.getItem(`fitness_release_reads:v1:${owner}`) || "[]"), A);
  expect(new Set(await pending())).toEqual(new Set(releases.map(item => item.id)));
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Тестовая страница" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(new Set(await pending())).toEqual(new Set(releases.map(item => item.id)));
});

test("a later foreground can load a release while an older ACK is still pending", async ({ page }) => {
  await profile(page);
  const old = "44444444-4444-4444-8444-444444444444";
  await page.addInitScript(({ owner, old }) => localStorage.setItem(`fitness_release_reads:v1:${owner}`, JSON.stringify([old])), { owner: A, old });
  let finish!: () => void, fresh = false, gets = 0;
  const held = new Promise<void>(resolve => { finish = resolve; });
  page.on("close", () => finish());
  await page.route(`**/notifications/release-notices/${old}/seen?*`, async route => { await held; await route.fulfill({ status: 503, json: { detail: "old ACK held" } }).catch(() => {}); });
  await page.route("**/notifications/release-notices?*", route => { gets++; return route.fulfill({ json: { items: fresh ? [notice("Новый выпуск при следующем открытии")] : [], next_cursor: null } }); });
  try {
    await page.goto(fixture);
    await expect.poll(() => gets).toBe(1);
    fresh = true;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByRole("dialog")).toContainText("Новый выпуск при следующем открытии");
  } finally { finish(); }
});

test("a repeated pagination cursor stops safely with an explicit partial summary", async ({ page }) => {
  await profile(page);
  const releases = batch(26).slice(0, 20);
  let requests = 0;
  await page.route("**/notifications/release-notices?*", route => {
    requests++;
    return route.fulfill({ json: { items: releases, next_cursor: releases.at(-1)!.id } });
  });
  await page.goto(fixture);
  const overlay = page.getByRole("dialog");
  await expect(overlay.getByRole("heading", { level: 3 })).toHaveCount(20);
  await expect(overlay).toContainText("Не все изменения загрузились");
  expect(requests).toBe(2);
});

for (const mode of ["stale", "unknown"]) test(`runtime ${mode} never presents or acknowledges a future release`, async ({ page }) => {
  await profile(page);
  await page.route("**/version.json?*", route => mode === "stale" ? route.fulfill({ json: { buildId: "a-newer-runtime" } }) : route.fulfill({ status: 503, json: {} }));
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { items: [notice()], next_cursor: null } }));
  let acks = 0;
  await page.route(`**/notifications/release-notices/${ID}/seen?*`, route => { acks++; return route.fulfill({ json: { ok: true } }); });
  const loaded = page.waitForResponse(response => response.url().includes("/notifications/release-notices?"));
  await page.goto(fixture); await loaded;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(acks).toBe(0);
});

test("a late runtime check cannot present a previous owner's loaded summary", async ({ page }) => {
  await profile(page);
  let finish!: () => void, checks = 0;
  const held = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/version.json?*", async route => {
    checks++;
    if (checks === 1) await held;
    await route.fulfill({ json: { buildId: "development" } }).catch(() => {});
  });
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { items: [notice(route.request().headers().authorization?.includes("owner-b") ? "Версия для B" : "Версия для A")], next_cursor: null } }));
  try {
    await page.goto(fixture);
    await expect.poll(() => checks).toBe(1);
    await page.evaluate(profile => Reflect.get(window, "switchReleaseOwner")(profile), user(B));
    await expect(page.getByRole("dialog")).toContainText("Версия для B");
    finish();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByText("Версия для A", { exact: true })).toHaveCount(0);
  } finally { finish(); }
});
