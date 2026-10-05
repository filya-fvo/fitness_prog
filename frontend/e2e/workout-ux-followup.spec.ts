import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [320, 393, 1440]) {
  test(`repetition and weight cards and selected wheel rows align at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 852 });
    await page.goto("/e2e/fixtures/wheel-picker.html?load=weight");
    await page.getByRole("button", { name: "Открыть подход" }).click();
    const dialog = page.getByRole("dialog", { name: "Добавить подход" });
    const reps = dialog.getByRole("listbox", { name: "Повторения", exact: true });
    const kg = dialog.getByRole("listbox", { name: "Кг", exact: true });
    const repCard = await reps.locator("xpath=../../..").boundingBox();
    const weightCard = await kg.locator("xpath=../../../..").boundingBox();
    expect(repCard).not.toBeNull(); expect(weightCard).not.toBeNull();
    expect(Math.abs(repCard!.height - weightCard!.height)).toBeLessThan(1);
    const repRow = await reps.getByRole("option", { selected: true }).boundingBox();
    const kgRow = await kg.getByRole("option", { selected: true }).boundingBox();
    expect(Math.abs(repRow!.y - kgRow!.y)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath(`aligned-set-${width}.png`) });
  });
}

test("calendar Edit opens a separate modal with the same set selectors and no live rest timer", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/e2e/fixtures/workout-edit.html");
  const day = page.getByRole("dialog").first();
  await day.getByRole("button", { name: "Изменить", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Изменить тренировку", exact: true });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Изменить подход 1: Гакк-приседания" }).click();
  const set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await expect(set.getByRole("combobox", { name: "Повторения: выбрать значение" })).toHaveValue("14");
  await expect(set.getByRole("combobox", { name: "Кг: выбрать значение", exact: true })).toHaveValue("200");
  await expect(set.getByRole("checkbox", { name: /Запустить таймер/ })).toHaveCount(0);
  await set.getByRole("combobox", { name: "Кг: выбрать значение", exact: true }).selectOption("260");
  await set.getByRole("combobox", { name: "Повторения: выбрать значение" }).selectOption("12");
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(editor.getByText("260 кг × 12", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(day.getByText("200 кг × 14", { exact: true })).toBeVisible();
  await expect(day.getByRole("button", { name: "Изменить", exact: true })).toBeFocused();
});

test("calendar saves edited, missing, timed and cardio sets while preserving metadata", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/e2e/fixtures/workout-edit.html");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  const writes: Record<string, unknown>[] = [];
  let result = structuredClone(before);
  await page.route(`**/workouts/${before.id}/sets`, async route => {
    const payload = route.request().postDataJSON();
    writes.push(payload);
    const existing = result.sets.findIndex((row: { exercise_id: string; set_number: number }) => row.exercise_id === payload.exercise_id && row.set_number === payload.set_number);
    const row = { ...(existing < 0 ? { id: "99999999-9999-4999-8999-999999999999", workout_id: before.id } : result.sets[existing]), ...payload };
    if (existing < 0) result.sets.push(row); else result.sets[existing] = row;
    await route.fulfill({ json: row });
  });
  await page.route(`**/workouts/${before.id}`, async route => {
    if (route.request().method() === "PATCH") result = { ...result, ...route.request().postDataJSON() };
    await route.fulfill({ json: result });
  });
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Изменить тренировку", exact: true });
  await editor.getByRole("button", { name: "Добавить подход: Гакк-приседания" }).click();
  let set = page.getByRole("dialog", { name: "Добавить подход", exact: true });
  await set.getByRole("combobox", { name: "Повторения: выбрать значение" }).selectOption("12");
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(editor.getByText("200 кг × 12", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Изменить подход 1: Планка" }).click();
  set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await expect(set.getByLabel("Отдых после подхода")).toHaveValue("0");
  await set.getByRole("combobox", { name: "Минуты: выбрать значение" }).selectOption("1");
  await set.getByRole("combobox", { name: "Секунды: выбрать значение" }).selectOption("0");
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await editor.getByRole("button", { name: "Изменить подход 1: Беговая дорожка" }).click();
  await expect(set.getByLabel("Отдых после подхода")).toHaveValue("105");
  await expect(set.getByLabel("Скорость", { exact: true })).toHaveValue("4");
  await set.getByLabel("Скорость", { exact: true }).fill("5.5");
  await set.getByRole("checkbox", { name: "Подход выполнен" }).check();
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 568 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(v => v.impact === "serious" || v.impact === "critical");
  expect(violations).toEqual([]);
  await page.setViewportSize({ width: 393, height: 852 });
  await editor.screenshot({ path: testInfo.outputPath("workout-editor.png") });
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const stored = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  expect(stored.status).toBe("completed");
  expect(stored.sets).toHaveLength(4);
  expect(writes).toHaveLength(3);
  expect(stored.sets.find((row: { exercise_id: string }) => row.exercise_id === before.sets[2].exercise_id)).toMatchObject({
    rest_time_sec: 105, is_completed: true, reps: null, weight: null, duration_sec: 300,
    machine_params: { speed: 5.5, incline: 2, custom_setting: "keep" },
  });
  expect(stored.sets.find((row: { exercise_id: string }) => row.exercise_id === before.sets[1].exercise_id)).toMatchObject({
    duration_sec: 60, rest_time_sec: 0, weight: null, reps: null,
  });
  expect(stored.sets[0]).toEqual(before.sets[0]);
});

test("save failure retains calendar edits and allows retry", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  await page.route(`**/workouts/${before.id}`, route => route.fulfill({ status: 503, json: { detail: "Сохранение временно недоступно" } }));
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Изменить тренировку", exact: true });
  await editor.getByRole("textbox", { name: "Заметки", exact: true }).fill("Сохранить этот черновик");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor.getByRole("alert")).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Заметки", exact: true })).toHaveValue("Сохранить этот черновик");
  await expect(editor.getByRole("button", { name: "Сохранить", exact: true })).toBeEnabled();
});

test("note-only history edit preserves original precision, null metrics and saved weight semantics", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?legacy=1");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  let received: Record<string, unknown> | null = null;
  await page.route(`**/workouts/${before.id}/sets`, async route => {
    received = route.request().postDataJSON();
    await route.fulfill({ json: { ...before.sets[0], ...received } });
  });
  await page.route(`**/workouts/${before.id}`, route => route.fulfill({ json: before }));
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания" }).click();
  const set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await expect(set.getByText("Рабочий вес, кг", { exact: true })).toBeVisible();
  await expect(set.getByText("Вес одной гантели, кг", { exact: true })).toHaveCount(0);
  await set.getByLabel("Примечание (по желанию)").fill("Только новая заметка");
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(() => received).toMatchObject({ weight: 12.25, reps: null, rest_time_sec: null,
    weight_mode: "total", note: "Только новая заметка" });
});

test("adding a historical set keeps the copied total-weight convention", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?legacy=1");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  let received: Record<string, unknown> | null = null;
  await page.route(`**/workouts/${before.id}/sets`, async route => {
    received = route.request().postDataJSON();
    await route.fulfill({ json: { ...before.sets[0], ...received } });
  });
  await page.route(`**/workouts/${before.id}`, route => route.fulfill({ json: before }));
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page.getByRole("button", { name: "Добавить подход: Гакк-приседания" }).click();
  const set = page.getByRole("dialog", { name: "Добавить подход", exact: true });
  await expect(set.getByText("Рабочий вес, кг", { exact: true })).toBeVisible();
  await expect(set.getByText("12,25 кг", { exact: true })).toBeVisible();
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(() => received).toMatchObject({ weight: 12.25, weight_mode: "total", set_number: 2 });
});
