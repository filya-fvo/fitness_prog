import { expect, test, type Page } from "@playwright/test";
const catalog = Array.from({ length: 205 }, (_, index) => ({
  id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
  name_ru: index === 200 ? "Скручивания на полу" : `Упражнение ${String(index + 1).padStart(3, "0")}`,
  muscle_group: index === 200 ? "abs" : "chest", equipment: index === 200 ? "bodyweight" : "barbell",
  difficulty: index === 200 ? 2 : 1,
  description: null, technique: null, common_mistakes: null, video_url: null, animation_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none", tags: [],
}));
async function start(page: Page, failFirst = false) {
  let failed = false;
  const pages: number[] = [];
  await page.route(/\/exercises(?:\?|$)/, route => {
    if (failFirst && !failed) { failed = true; return route.fulfill({ status: 503, json: { detail: "Недоступно" } }); }
    const number = Number(new URL(route.request().url()).searchParams.get("page") || 1);
    pages.push(number);
    return route.fulfill({ json: { items: catalog.slice((number - 1) * 200, number * 200), total: catalog.length, page: number, page_size: 200 } });
  });
  await page.goto("/e2e/fixtures/personal-program.html");
  await page.getByRole("textbox", { name: "Название программы" }).fill("Мой план с прессом");
  await page.getByRole("button", { name: "Выбрать упражнения →" }).click();
  return pages;
}
for (const width of [320, 375, 393, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`browse and filter full personal catalog at ${width}px ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 820 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(preference => localStorage.setItem("fitness_theme_preference", preference), theme);
    const pages = await start(page);
    await expect(page.getByRole("combobox", { name: "Группа мышц", exact: true })).toBeVisible();
    await expect(page.getByText("Найдено: 205", { exact: true })).toBeVisible();
    expect(pages).toEqual([1, 2]);
    await expect(page.getByRole("button", { name: /^Добавить / })).toHaveCount(30);
    await page.getByRole("button", { name: /Показать ещё/ }).click();
    await expect(page.getByRole("button", { name: /^Добавить / })).toHaveCount(60);
    const filters = page.getByRole("button", { name: /^Фильтры/ });
    if (await filters.getAttribute("aria-expanded") === "false") await filters.click();
    await page.getByRole("combobox", { name: "Группа мышц", exact: true }).selectOption("abs");
    await page.getByRole("combobox", { name: "Оборудование", exact: true }).selectOption("bodyweight");
    await page.getByRole("combobox", { name: "Сложность", exact: true }).selectOption("2");
    await page.getByRole("searchbox", { name: "Добавить упражнение" }).fill("Скручивания");
    await expect(page.getByText("Найдено: 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Посмотреть Скручивания на полу", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Скручивания на полу" })).toBeVisible();
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.getByRole("button", { name: "Добавить Скручивания на полу", exact: true }).click();
    await expect(page.getByLabel("Подходы", { exact: true })).toHaveValue("3");
    await expect(page.getByRole("button", { name: "Добавить Скручивания на полу", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
    await expect(page.getByText("Найдено: 204", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Подходы", { exact: true })).toHaveValue("3");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 393) await page.screenshot({ path: testInfo.outputPath(`personal-filters-${theme}.png`) });
  });
}
test("catalog retry keeps program and day settings", async ({ page }) => {
  await start(page, true);
  await expect(page.getByRole("alert")).toContainText("упражнения");
  await page.getByRole("textbox", { name: "Название дня" }).fill("Мой день");
  await page.getByRole("button", { name: "Повторить загрузку упражнений" }).click();
  await expect(page.getByText("Найдено: 205", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Название дня" })).toHaveValue("Мой день");
});
