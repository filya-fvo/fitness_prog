import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { acceptedLegalStatus } from "./legal-fixture";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const user = (id = A) => ({ id, username: id === A ? "a" : "b", subscription_status: "free", onboarding_completed: true, legal_status: acceptedLegalStatus(id) });
const notice = (message = "• Диапазоны повторов и точное время.\n• Сохранение целей и введённых результатов.") => ({ id: ID, release_key: "test-apk27", title: "Обновление FilFit", message_text: message, apk_url: "https://app.filfitclub.ru/android/latest.apk", created_at: "2026-10-29T12:00:00Z" });
const fixture = "/e2e/fixtures/release-summary.html";
async function profile(page: Page) {
  await page.route("**/users/me", route => route.fulfill({ json: user(route.request().headers().authorization?.includes("owner-b") ? B : A) }));
}

test("release overlay appears once, traps focus and explicitly acknowledges without changing the page", async ({ page }) => {
  await profile(page);
  let read = false, requests = 0, acknowledgements = 0;
  await page.route("**/notifications/release-notices?*", route => { requests++; return route.fulfill({ json: { items: read ? [] : [notice()] } }); });
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
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { items: read ? [] : [notice()] } }));
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
    await route.fulfill({ json: { items: [notice(ownerB ? "Только для B" : "Только для A")] } }).catch(() => {});
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
  await page.route("**/notifications/release-notices?*", async route => { started = true; await hold; await route.fulfill({ json: { items: [notice()] } }).catch(() => {}); });
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
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { items: [notice()] } }));
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
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { items: [notice("Нововведения и исправления.\n".repeat(35) + "длинноеслово".repeat(20))] } }));
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
  await page.route("**/notifications/release-notices?*", route => route.fulfill({ json: { items: [{ message_text: "неполный ответ" }] } }));
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
  await page.route("**/notifications/release-notices?*", route => { requests++; return route.fulfill({ json: { items: fresh ? [notice()] : [] } }); });
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
  await page.route("**/notifications/release-notices?*", async route => { await hold; await route.fulfill({ json: { items: [notice()] } }); });
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
