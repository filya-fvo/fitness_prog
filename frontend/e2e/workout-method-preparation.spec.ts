import { expect, test } from "@playwright/test";
import { installMethodApi, methodIds } from "./fixtures/workout-method-api";

for (const width of [320, 375, 393, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`prepares and reopens a personal biceps superset ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 393 ? 600 : 820 });
    await page.emulateMedia({ colorScheme: theme });
    const api = await installMethodApi(page);
    await page.goto("/e2e/fixtures/workout-composer.html");
    await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
    await page.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
    await page.getByLabel("Поиск упражнения", { exact: true }).fill("с гантелями");
    await page.getByRole("button", { name: "Добавить Сгибания с гантелями", exact: true }).click();
    await expect(page.getByRole("button", { name: "Объединить упражнения", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Объединить упражнения", exact: true }).click();
    await page.getByRole("checkbox", { name: "Сгибания со штангой", exact: true }).check();
    await page.getByRole("checkbox", { name: "Сгибания с гантелями", exact: true }).check();
    await page.getByLabel("Раунды", { exact: true }).fill("3");
    await page.getByLabel("Отдых после раунда, с", { exact: true }).fill("90");
    await page.getByRole("button", { name: "Создать связку", exact: true }).click();
    await expect(page.getByText("Суперсет · 3 раунда", { exact: true })).toBeVisible();
    const methodRow = page.getByRole("region", { name: "Сгибания со штангой", exact: true });
    await methodRow.locator("summary").click();
    await methodRow.getByLabel("Способ выполнения Сгибания со штангой", { exact: true }).selectOption("cluster");
    const weight = methodRow.getByLabel("Рабочий вес Сгибания со штангой", { exact: true });
    await weight.fill("100");
    expect(await weight.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width === 393) await page.screenshot({ path: `C:/fitness_prog/artifacts/workout-methods-20261019/methods-${theme}.png` });
    await page.getByRole("button", { name: "Сохранить подготовку", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(api.writes[0].groups?.[0]).toMatchObject({ kind: "superset", rounds: 3, transition_sec: 0, round_rest_sec: 90,
      exercise_ids: [methodIds.curl, methodIds.second] });
    await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
    await expect(page.getByText("Суперсет · 3 раунда", { exact: true })).toBeVisible();
    expect(await page.locator("html").evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(methodRow.locator("summary")).toContainText("Кластеры");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /Подготовить упражнения/ })).toBeFocused();
  });
}

async function openPrepared(page: import("@playwright/test").Page, failSave = false) {
  await page.setViewportSize({ width: 393, height: 600 });
  const api = await installMethodApi(page, failSave);
  await page.goto("/e2e/fixtures/workout-composer.html");
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  return api;
}

test("configures the last cluster as 100 kg, four plus four plus four, with two short pauses", async ({ page }) => {
  const api = await openPrepared(page);
  const row = page.getByRole("region", { name: "Сгибания со штангой", exact: true });
  await row.locator("summary").click();
  await row.getByLabel("Способ выполнения Сгибания со штангой", { exact: true }).selectOption("cluster");
  await row.getByLabel("Рабочий вес Сгибания со штангой", { exact: true }).fill("100");
  await expect(row.getByLabel("Повторы части 1 Сгибания со штангой", { exact: true })).toHaveValue("4");
  await page.locator('details[aria-label="Порядок и паузы"] > summary').click();
  await expect(page.getByText("20 с между частями", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Сохранить подготовку", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const method = api.writes[0].exercise_overrides.find(row => row.exercise_id === methodIds.curl)?.set_methods?.[0];
  expect(method).toMatchObject({ set_number: 3, kind: "cluster", parts: [
    { target_reps: 4, target_weight: 100, pause_after_sec: 20 },
    { target_reps: 4, target_weight: 100, pause_after_sec: 20 },
    { target_reps: 4, target_weight: 100, pause_after_sec: 0 },
  ] });
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  await row.locator("summary").click();
  await expect(row.getByLabel("Рабочий вес Сгибания со штангой", { exact: true })).toHaveValue("100");
});

test("validates descending drop weights and keeps configured steps after a failed save", async ({ page }) => {
  await openPrepared(page, true);
  const row = page.getByRole("region", { name: "Разгибания на блоке", exact: true });
  await row.locator("summary").click();
  await row.getByLabel("Способ выполнения Разгибания на блоке", { exact: true }).selectOption("drop");
  await row.getByLabel("Вес части 1 Разгибания на блоке", { exact: true }).fill("30");
  await row.getByLabel("Вес части 2 Разгибания на блоке", { exact: true }).fill("35");
  await row.getByLabel("Вес части 3 Разгибания на блоке", { exact: true }).fill("20");
  await expect(page.getByRole("button", { name: "Сохранить подготовку", exact: true })).toBeDisabled();
  await row.getByLabel("Вес части 2 Разгибания на блоке", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Сохранить подготовку", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("сохранены на устройстве");
  await expect(row.getByLabel("Вес части 2 Разгибания на блоке", { exact: true })).toHaveValue("25");
  await expect(page.getByRole("dialog")).toBeVisible();
});

for (const kind of ["triset", "circuit"] as const) test(`configures ${kind} with a timed member and one round rest`, async ({ page }) => {
  const api = await openPrepared(page);
  await page.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
  await page.getByLabel("Поиск упражнения", { exact: true }).fill("Планка");
  await page.getByRole("button", { name: "Добавить Планка", exact: true }).click();
  const timed = page.getByRole("region", { name: "Планка", exact: true });
  await expect(timed.getByLabel("Время, с", { exact: true })).toHaveValue("45");
  await timed.getByLabel("Время, с", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Объединить упражнения", exact: true }).click();
  await page.getByLabel("Вид связки", { exact: true }).selectOption(kind);
  for (const name of ["Сгибания со штангой", "Разгибания на блоке", "Планка"]) await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByLabel("Раунды", { exact: true }).fill("2");
  await page.getByLabel("Переход между упражнениями, с", { exact: true }).fill("5");
  await page.getByLabel("Отдых после раунда, с", { exact: true }).fill("75");
  await expect(page.getByRole("button", { name: "Сохранить подготовку", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Создать связку", exact: true }).click();
  await timed.locator("summary").click();
  await expect(timed.locator('option[value="drop"]')).toHaveJSProperty("disabled", true);
  await expect(timed.getByLabel("Способ выполнения Планка", { exact: true })).toHaveValue("standard");
  await page.locator('details[aria-label="Порядок и паузы"] > summary').click();
  await expect(page.getByText("75 с после раунда", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Последний шаг — без отдыха", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить подготовку", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.writes[0].groups?.[0]).toMatchObject({ kind, rounds: 2, round_rest_sec: 75 });
  expect(api.writes[0].added_exercises.find(row => row.exercise_id === methodIds.plank)?.target_reps).toBe("40 с");
});

test("applies one configured cluster consistently to all selected sets", async ({ page }) => {
  const api = await openPrepared(page);
  const row = page.getByRole("region", { name: "Сгибания со штангой", exact: true });
  await row.locator("summary").click();
  const kind = row.getByLabel("Способ выполнения Сгибания со штангой", { exact: true });
  await kind.selectOption("cluster");
  await row.getByLabel("Рабочий вес Сгибания со штангой", { exact: true }).fill("100");
  await row.getByLabel("Для подходов Сгибания со штангой", { exact: true }).selectOption("all");
  await kind.selectOption("cluster");
  await page.getByRole("button", { name: "Сохранить подготовку", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const methods = api.writes[0].exercise_overrides.find(row => row.exercise_id === methodIds.curl)?.set_methods;
  expect(methods).toHaveLength(3);
  expect(methods?.map(method => method.parts[0].target_weight)).toEqual([100, 100, 100]);
});

test("keeps links when reordering a saved group and requires dissolving before removing a member", async ({ page }) => {
  const api = await openPrepared(page);
  await page.getByRole("button", { name: "Объединить упражнения", exact: true }).click();
  for (const name of ["Сгибания со штангой", "Разгибания на блоке"]) await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByLabel("Раунды", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Создать связку", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить подготовку", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  await expect(page.getByRole("button", { name: "Убрать Сгибания со штангой", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Поднять Разгибания на блоке", exact: true }).click();
  await expect(page.getByRole("region", { name: "Связка Суперсет", exact: true })).toContainText("Разгибания на блоке → Сгибания со штангой");
  await page.getByRole("button", { name: "Распустить связку", exact: true }).click();
  await page.getByRole("button", { name: "Убрать Сгибания со штангой", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить подготовку", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.writes[1].removed_exercise_ids).toContain(methodIds.curl);
  expect(api.writes[1].groups ?? []).toEqual([]);
});
