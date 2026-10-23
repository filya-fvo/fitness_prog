import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/telegram/browser/config", route => route.fulfill({
    json: { enabled: false, client_id: null },
  }));
});

test("public Android download needs no login and uses the canonical publisher URL", async ({ page }) => {
  const protectedRequests: string[] = [];
  page.on("request", request => {
    if (/\/users\/me|\/auth\//.test(request.url())) protectedRequests.push(request.url());
  });
  await page.goto("/download");
  await expect(page).toHaveURL(/\/download$/);
  await expect(page.getByRole("heading", { name: "FilFit для Android" })).toBeVisible();
  const apk = page.getByRole("link", { name: "Скачать APK" });
  await expect(apk).toHaveAttribute("href", "https://app.filfitclub.ru/android/latest.apk");
  await expect(page.getByText(/Установите поверх/)).toBeVisible();
  await expect(page.getByText(/Удалять приложение не нужно/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Google Play|RuStore|App Store/ })).toHaveCount(0);
  expect(protectedRequests).toEqual([]);
  for (const width of [320, 393, 1440]) for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width, height: 568 });
    await page.emulateMedia({ colorScheme: theme });
    // Initialize each system theme on load, outside the previous theme's transition.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(apk).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`download-${width}-${theme}.png`), fullPage: true });
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations.filter(item => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  }
  await page.getByRole("link", { name: "Настройка уведомлений Android" }).click();
  await expect(page.locator("#faq-notifications")).toHaveAttribute("open", "");
});

test("login and public FAQ expose the Android download without signing in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Скачать для Android", exact: true }).click();
  await expect(page).toHaveURL(/\/download$/);
  await page.goto("/faq");
  await page.getByRole("link", { name: "Скачать для Android", exact: true }).click();
  await expect(page).toHaveURL(/\/download$/);
});

test("FAQ search finds practical Android exact access and battery instructions", async ({ page }) => {
  await page.goto("/faq");
  const search = page.getByRole("searchbox", { name: "Поиск ответа" });
  const article = page.locator("#faq-notifications");
  for (const query of ["Android", "батарея", "точные напоминания", "автозапуск", "Samsung", "POCO", "Pixel"]) {
    await search.fill(query);
    await expect(article).toBeVisible();
  }
  await article.locator("summary").click();
  await expect(article).toContainText("Разрешить точные напоминания");
  await expect(article).toContainText("включите доступ для FilFit и вернитесь");
  await expect(article).toContainText("Проверить уведомление");
  await expect(article).toContainText("не проверяет доставку по расписанию");
  await expect(article).toContainText("принудительной остановки");
  await expect(article).toContainText("отзыва точного доступа");
  await expect(article).toContainText("не гарантируется");
  await page.setViewportSize({ width: 393, height: 852 });
  await article.evaluate(element => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: test.info().outputPath("android-notifications-expanded-393.png") });
});
