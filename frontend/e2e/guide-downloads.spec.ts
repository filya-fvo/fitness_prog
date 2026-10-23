import { acceptedLegalStatus } from "./legal-fixture";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
const body = "# Полная инструкция\n\nСуперсет и трисет: выберите упражнения.\n";
for (const width of [320, 393, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`public guide downloads at ${width}px ${theme}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 820 });
    await page.emulateMedia({ colorScheme: theme });
    await context.route("**/guides/user", route => route.fulfill({ contentType: "text/markdown; charset=utf-8", headers: { "Content-Disposition": 'attachment; filename="Fitness_Mini_App_Instrukciya.md"' }, body }));
    await page.goto("/help");
    await expect(page.getByRole("button", { name: "Скачать инструкцию администратора" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Скачать инструкцию пользователя" })).toBeVisible();
    const saved = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать инструкцию пользователя" }).click();
    const download = await saved;
    expect(download.suggestedFilename()).toBe("Fitness_Mini_App_Instrukciya.md");
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("utf8")).toBe(body);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test("administrator guide uses authorization and retries after a download error", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "guide-admin-token"));
  let attempts = 0;
  await page.route("**/guides/admin", route => {
    expect(route.request().headers().authorization).toBe("Bearer guide-admin-token");
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 503, json: { detail: "Попробуйте позже" } }) : route.fulfill({ contentType: "text/markdown", body });
  });
  await page.goto("/e2e/fixtures/guide-downloads.html?admin");
  const button = page.getByRole("button", { name: "Скачать инструкцию администратора" });
  await button.click();
  await expect(page.getByRole("alert")).toContainText("Не удалось скачать");
  await expect(button).toBeEnabled();
  const saved = page.waitForEvent("download");
  await button.click();
  expect((await saved).suggestedFilename()).toBe("Fitness_Mini_App_Admin_Instrukciya.md");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("late administrator file is discarded after logout", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route("**/guides/admin", async route => { requested = true; await held; await route.fulfill({ contentType: "text/markdown", body }); });
  await page.goto("/e2e/fixtures/guide-downloads.html?admin");
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.getByRole("button", { name: "Скачать инструкцию администратора" }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  release();
  await expect(page.getByRole("button", { name: "Скачать инструкцию администратора" })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(downloads).toBe(0);
});

const fullGuide = "# Полное руководство\n\n## Начало работы\n\nВаш дневник **сохранён**. [Сайт](https://app.filfitclub.ru)\n\n## Сложные подходы\n\n- Выберите упражнения\n- Сохраните связку\n\n| Способ | Отдых |\n| --- | --- |\n| Кластер | Между частями |\n\n[Небезопасная ссылка](javascript:alert(1))\n\n<script>window.guideUnsafe=true</script>\n";
test("full guide opens inside the application with contents and a download", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 820 });
  await page.route("**/guides/user", route => route.fulfill({ contentType: "text/markdown", body: fullGuide }));
  await page.goto("/help");
  await page.getByRole("link", { name: "Открыть инструкцию пользователя", exact: true }).click();
  await expect(page).toHaveURL(/\/help\/instructions\/user$/);
  await expect(page.getByRole("heading", { name: "Инструкция пользователя", exact: true })).toBeVisible();
  const contents = page.getByRole("navigation", { name: "Оглавление инструкции" });
  await expect(contents).toBeVisible();
  await contents.getByRole("link", { name: "Сложные подходы" }).click();
  await expect(page.getByRole("heading", { name: "Сложные подходы", exact: true })).toBeInViewport();
  await expect(page.getByRole("article").locator("strong")).toHaveText("сохранён");
  await expect(page.getByRole("table")).toContainText("Между частями");
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => "guideUnsafe" in window)).toBe(false);
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать инструкцию пользователя" }).click();
  expect((await saved).suggestedFilename()).toBe("Fitness_Mini_App_Instrukciya.md");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("full guide recovers after a read error", async ({ page }) => {
  let unavailable = true;
  await page.route("**/guides/user", route => unavailable ? route.fulfill({ status: 503, json: { detail: "Повторите позже" } }) : route.fulfill({ contentType: "text/markdown", body: fullGuide }));
  await page.goto("/help/instructions/user");
  await expect(page.getByRole("alert")).toContainText("Не удалось открыть инструкцию");
  unavailable = false;
  await page.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(page.getByRole("article")).toContainText("Ваш дневник");
});
test("anonymous administrator reader never requests private content", async ({ page }) => {
  let requested = false;
  await page.route("**/guides/admin", route => { requested = true; return route.fulfill({ contentType: "text/markdown", body: "Секретная инструкция" }); });
  await page.goto("/help/instructions/admin");
  await expect(page.getByText("Инструкция доступна только администратору")).toBeVisible();
  expect(requested).toBe(false);
});
test("administrator reader discards a late response and clears on logout", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "guide-admin-token"));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route("**/guides/admin", async route => { requested = true; await held; await route.fulfill({ contentType: "text/markdown", body: "# Администратор\n\nЧастное руководство администратора" }); });
  await page.goto("/e2e/fixtures/guide-downloads.html?admin");
  await page.getByRole("link", { name: "Открыть инструкцию администратора", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  release();
  await expect(page.getByText("Инструкция доступна только администратору")).toBeVisible();
  await expect(page.getByText("Частное руководство администратора")).toHaveCount(0);
});


test("administrator reader clears already displayed private content on logout", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "guide-admin-token"));
  await page.route("**/guides/admin", route => route.fulfill({ contentType: "text/markdown", body: "# Администратор\n\nЧастное руководство администратора" }));
  await page.goto("/e2e/fixtures/guide-downloads.html?admin");
  await page.getByRole("link", { name: "Открыть инструкцию администратора", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Частное руководство администратора");
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await expect(page.getByText("Инструкция доступна только администратору")).toBeVisible();
  await expect(page.getByText("Частное руководство администратора")).toHaveCount(0);
});

const canonicalGuide = readFileSync(new URL("../../docs/USER_GUIDE.md", import.meta.url), "utf8");
for (const width of [320, 393, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`full canonical guide layout at ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    await page.addInitScript(value => localStorage.setItem("fitness_theme_preference", value), theme);
    await page.route("**/guides/user", route => route.fulfill({ contentType: "text/markdown", body: canonicalGuide }));
    await page.goto("/help/instructions/user");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("article")).toContainText("Заполните короткую анкету");
    await page.getByRole("navigation", { name: "Оглавление инструкции" }).getByRole("link", { name: "Дроп-сеты, кластеры и связки при подготовке", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Дроп-сеты, кластеры и связки при подготовке", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 393 && theme === "dark") await page.screenshot({ path: `../.superpowers/sdd/2026-10-21-guides-links-telegram/reader-${page.context().browser()?.browserType().name()}.png` });
  });
}

for (const changed of ["removed", "replaced"] as const) {
  test(`administrator reader hides private content when token is ${changed} in another tab`, async ({ page, context }) => {
    await page.addInitScript(() => localStorage.setItem("fitness_jwt", "guide-admin-token"));
    await page.route("**/guides/admin", route => route.request().headers().authorization === "Bearer guide-admin-token"
      ? route.fulfill({ contentType: "text/markdown", body: "# Администратор\n\nЧастное руководство администратора" })
      : route.fulfill({ status: 403, json: { detail: "Нет доступа" } }));
    await page.goto("/e2e/fixtures/guide-downloads.html?admin");
    await page.getByRole("link", { name: "Открыть инструкцию администратора", exact: true }).click();
    await expect(page.getByRole("article")).toContainText("Частное руководство администратора");
    const other = await context.newPage();
    await other.goto("/help");
    await other.evaluate(value => value === "removed" ? localStorage.removeItem("fitness_jwt") : localStorage.setItem("fitness_jwt", "different-session"), changed);
    await expect(page.getByText("Частное руководство администратора")).toHaveCount(0);
    await other.close();
  });
}

test("direct administrator reader restores saved authentication through the real application", async ({ page }) => {
  const id = "22222222-2222-4222-8222-222222222222";
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "guide-admin-token"));
  await page.route("**/users/me", route => route.fulfill({ json: { id, username: "Filatov_Slava", telegram_id: 42,
    auth_email: null, subscription_status: "free", onboarding_completed: true, anthropometry: {}, goals: {}, stars_balance: 0,
    legal_status: acceptedLegalStatus(id) } }));
  await page.route("**/guides/admin", route => route.fulfill({ contentType: "text/markdown", body: "# Администратор\n\nЧастное руководство администратора" }));
  await page.goto("/help/instructions/admin");
  await expect(page.getByRole("article")).toContainText("Частное руководство администратора");
});
