import { expect, test } from "@playwright/test";
for (const width of [320, 393, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`admin browses and filters catalog at ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(preference => localStorage.setItem("fitness_theme_preference", preference), theme);
    const catalog = Array.from({ length: 101 }, (_, index) => ({
      id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
      name_ru: index === 100 ? "Скручивания" : `Жим ${index + 1}`,
      muscle_group: index === 100 ? "abs" : "chest", equipment: index === 100 ? "bodyweight" : "barbell", difficulty: 2,
      weight_rule: "total", media_quality: "missing", created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z",
    }));
    const requested: number[] = [];
    await page.route(/\/admin\/exercises(?:\?|$)/, route => {
      const number = Number(new URL(route.request().url()).searchParams.get("page") || 1);
      requested.push(number);
      return route.fulfill({ json: { items: catalog.slice((number - 1) * 100, number * 100), total: catalog.length, page: number, page_size: 100 } });
    });
    await page.goto("/e2e/fixtures/admin-program-picker.html");
    await expect(page.getByRole("combobox", { name: "Группа мышц", exact: true })).toBeVisible();
    expect(requested).toEqual([1, 2]);
    await page.getByRole("combobox", { name: "Группа мышц", exact: true }).selectOption("abs");
    await page.getByRole("combobox", { name: "Оборудование", exact: true }).selectOption("bodyweight");
    await page.getByRole("searchbox", { name: "Поиск упражнения" }).fill("Скручивания");
    await expect(page.getByText("Найдено: 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Добавить Скручивания", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Добавлено: 1");
    await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
    await expect(page.getByText("Найдено: 100", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
