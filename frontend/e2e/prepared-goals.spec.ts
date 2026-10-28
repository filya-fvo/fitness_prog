import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("typed preparation goals are read-only while legacy and supported edits persist", async ({ page }) => {
  await page.goto("/e2e/fixtures/prepared-goals.html");
  const names = ["Жим гантелей", "Отжимания", "Планка", "Беговая дорожка"];
  for (const [i, name] of names.entries()) {
    const row = page.getByRole("region", { name, exact: true });
    await expect(row.getByLabel(i < 2 ? "Повторы" : "Время, с", { exact: true })).toHaveCount(0);
    await expect(row).toContainText(["12–15 повт. · 12.5 кг", "10 повт.", "90 с", "300 с"][i]);
    await expect(row).toContainText("Цель из программы не меняется при подготовке");
  }
  const weighted = page.getByRole("region", { name: names[0], exact: true });
  await expect(weighted).toContainText("Вес одной гантели, кг");
  await weighted.getByLabel("Подходы", { exact: true }).fill("4");
  await weighted.getByLabel("Отдых, с", { exact: true }).fill("75");
  await weighted.locator("summary").click();
  await weighted.getByLabel("Способ выполнения Жим гантелей", { exact: true }).selectOption("cluster");
  await page.getByRole("region", { name: "Старые повторы", exact: true }).getByLabel("Повторы", { exact: true }).fill("9-11");
  await page.getByRole("region", { name: "Старое время", exact: true }).getByLabel("Время, с", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Сохранить подготовку", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("prepared-patch")!).exercise_overrides)).toEqual([
    { exercise_id: "11111111-1111-4111-8111-000000000001", target_sets: 4, rest_sec: 75,
      set_methods: [{ set_number: 4, kind: "cluster", parts: [20, 20, 0].map(pause_after_sec => ({ target_reps: 4, target_weight: null, pause_after_sec })) }] },
    { exercise_id: "11111111-1111-4111-8111-000000000005", target_reps: "9-11" },
    { exercise_id: "11111111-1111-4111-8111-000000000006", target_reps: "120 с" },
  ]);
  await page.reload(); await expect(weighted.getByLabel("Подходы", { exact: true })).toHaveValue("4");
  await expect(weighted.getByLabel("Отдых, с", { exact: true })).toHaveValue("75");
  await expect(weighted).toContainText("12–15 повт. · 12.5 кг");
  await expect(weighted).toContainText("Кластеры · подход 4");
  await expect(page.getByLabel("Повторы", { exact: true })).toHaveValue("9-11");
  await expect(page.getByLabel("Время, с", { exact: true })).toHaveValue("120");
});

for (const theme of ["light", "dark"]) for (const width of [320, 393, 1440]) test(`preparation fits ${width} ${theme}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 852 });
  await page.addInitScript(theme => localStorage.setItem("fitness_theme_preference", theme), theme);
  await page.goto("/e2e/fixtures/prepared-goals.html");
  const row = page.getByRole("region", { name: "Жим гантелей", exact: true });
  await expect(row).toContainText("12–15 повт. · 12.5 кг");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const field of await row.locator("input").all()) {
    expect(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect((await field.boundingBox())!.width).toBeGreaterThanOrEqual(60);
  }
  expect((await new AxeBuilder({ page }).include('section[aria-label="Жим гантелей"]').withRules(["color-contrast", "label", "button-name"]).analyze()).violations).toEqual([]);
  await row.screenshot({ path: testInfo.outputPath(`prepared-${width}-${theme}.png`) });
});
