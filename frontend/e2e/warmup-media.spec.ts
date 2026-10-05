import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("warmup previews open full technique without changing workout progress", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/e2e/fixtures/warmup-media.html");
  const step = page.getByRole("listitem").filter({ hasText: "Кошка-корова" });
  await expect(step.locator("img")).toBeVisible();
  const technique = step.getByRole("button", { name: /Техника/ });
  await technique.click();
  const dialog = page.getByRole("dialog", { name: "Кошка-корова" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Фото: Кошка-корова" })).toHaveAttribute("src", /exercise-images/);
  await expect(dialog.getByRole("heading", { name: "Как выполнять" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Добавить|Закрепить/ })).toHaveCount(0);
  await expect(dialog.getByText("Дневник", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("warmup-technique-393.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(technique).toBeFocused();
  await expect(step.getByRole("button", { name: "Готово" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Разминка идёт");
  const imageOnly = page.getByRole("listitem").filter({ hasText: "Наклоны к носкам" });
  await expect(imageOnly.locator("img")).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(async (value) => {
      const { setThemePreference } = await import("/src/theme/theme.ts");
      setThemePreference(value as "light" | "dark");
    }, theme);
    await expect(step.getByRole("button", { name: "Пропуск" })).toHaveCSS("color", theme === "dark" ? "rgb(246, 248, 255)" : "rgb(29, 27, 34)");
    for (const width of [320, 393, 1440]) {
      await page.setViewportSize({ width, height: 568 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      if (theme === "dark" && width === 320) await page.screenshot({ path: testInfo.outputPath("warmup-320-dark.png"), fullPage: true });
    }
    const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    expect(violations).toEqual([]);
  }
});

test("loading the warmup catalog reveals cards and preserves completed steps", async ({ page }) => {
  await page.goto("/e2e/fixtures/warmup-media.html?delayed=1");
  const step = page.getByRole("listitem").filter({ hasText: "Кошка-корова" });
  await expect(step.getByText("Карточка упражнения пока недоступна.")).toBeVisible();
  await step.getByRole("button", { name: "Готово" }).click();
  await page.getByRole("button", { name: "Загрузить каталог" }).click();
  await expect(step.getByRole("button", { name: /Техника/ })).toBeVisible();
  await expect(step.locator("img")).toBeVisible();
  await expect(step.getByRole("button", { name: "Готово" })).toHaveCount(0);
  await expect(step.getByText("✓", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Разминка идёт");
});
