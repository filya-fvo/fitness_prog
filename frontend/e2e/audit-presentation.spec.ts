import { expect, test } from "@playwright/test";

test("long weekly advice starts collapsed, can expand, and resets for a new report", async ({ page }) => {
  await page.goto("/e2e/audit-presentation.html");
  const report = page.getByRole("region", { name: "ИИ: разбор недели" });
  await expect(page.getByText(/КОНЕЦ ПЕРВОГО ОТЧЁТА/)).toHaveCount(0);
  await report.getByRole("button", { name: "Подробнее", exact: true }).click();
  await expect(page.getByText(/КОНЕЦ ПЕРВОГО ОТЧЁТА/)).toBeVisible();
  await expect(report.getByRole("button", { name: "Свернуть" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Другой отчёт" }).click();
  await expect(page.getByText(/КОНЕЦ НОВОГО ОТЧЁТА/)).toHaveCount(0);
  await expect(report.getByRole("button", { name: "Подробнее", exact: true })).toHaveAttribute("aria-expanded", "false");
});

test("simple view selectors expose pressed buttons and normal keyboard navigation", async ({ page }) => {
  await page.goto("/e2e/audit-presentation.html?mode=tabs");
  const group = page.getByRole("group", { name: "Наборы силовых трендов" });
  await expect(group.getByRole("button", { name: "Следующая", exact: true })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "Лучшие", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(group.getByRole("button", { name: "Лучшие", exact: true })).toHaveAttribute("aria-pressed", "true");
  const media = page.getByRole("group", { name: "Материалы", exact: true });
  await media.getByRole("button", { name: "Анимация", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(media.getByRole("button", { name: "Анимация", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tab")).toHaveCount(0);
});

test("reduced motion keeps GIF still until explicit play and supports stopping", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/audit-*.png", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") }));
  await page.route("**/audit-motion.gif", route => route.fulfill({ contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }));
  await page.goto("/e2e/audit-presentation.html?mode=motion");
  await expect(page.getByRole("img", { name: "Присед", exact: true })).toHaveAttribute("src", /audit-still\.png/);
  await page.getByRole("button", { name: "Воспроизвести анимацию" }).click();
  await expect(page.getByRole("img", { name: "Присед", exact: true })).toHaveAttribute("src", /audit-motion\.gif/);
  await page.getByRole("button", { name: "Остановить анимацию" }).click();
  await expect(page.getByRole("img", { name: "Присед", exact: true })).toHaveAttribute("src", /audit-still\.png/);
});

test("reduced motion makes skeletons static", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e/audit-analytics.html");
  const animation = await page.evaluate(() => {
    const skeleton = document.createElement("div");
    skeleton.className = "animate-pulse";
    document.body.append(skeleton);
    return getComputedStyle(skeleton).animationName;
  });
  expect(animation).toBe("none");
});

test("reduced motion prevents smooth scrolling to the selected help article", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const calls: string[] = [];
    Reflect.set(window, "auditScrollCalls", calls);
    Element.prototype.scrollIntoView = function(options) {
      calls.push(typeof options === "object" ? options.behavior ?? "auto" : "auto");
    };
  });
  await page.goto("/e2e/audit-presentation.html?mode=faq");
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, "auditScrollCalls") as string[]).length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => Reflect.get(window, "auditScrollCalls"))).not.toContain("smooth");
});

for (const theme of ["light", "dark"] as const) {
  test(`set form and exercise diary respect the ${theme} theme`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem("fitness_theme_preference", theme), theme);
    await page.goto("/e2e/fixtures/wheel-picker.html?load=weight");
    await page.getByRole("button", { name: "Открыть подход" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Добавить подход" });
    const bodyColor = await page.evaluate(() => getComputedStyle(document.body).color);
    await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).color)).toBe(bodyColor);
    const colors = await dialog.evaluate(element => ({
      text: getComputedStyle(element).color,
      body: getComputedStyle(document.body).color,
      bg: getComputedStyle(element).backgroundColor,
    }));
    expect(colors.text).toBe(colors.body);
    if (theme === "light") expect(colors.bg).toBe("rgb(255, 255, 255)");
    const selected = dialog.getByRole("listbox", { name: "Повторения", exact: true }).getByRole("option", { selected: true });
    expect(await selected.evaluate(element => getComputedStyle(element).color)).toBe(colors.body);
    await page.goto("/e2e/audit-presentation.html?mode=progress");
    const diary = page.locator("section").filter({ has: page.getByText("Последнее выполнение", { exact: true }) });
    const diaryColors = await diary.evaluate(element => ({ text: getComputedStyle(element).color, body: getComputedStyle(document.body).color }));
    expect(diaryColors.text).toBe(diaryColors.body);
  });
}
