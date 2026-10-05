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

test("canceling one set discards its changes without changing the day", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html");
  const trigger = page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания" });
  await trigger.click();
  const set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await set.getByRole("combobox", { name: "Кг: выбрать значение", exact: true }).selectOption("260");
  await set.getByRole("combobox", { name: "Повторения: выбрать значение" }).selectOption("12");
  await set.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(trigger).toContainText("200 кг × 14");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(set.getByRole("combobox", { name: "Кг: выбрать значение", exact: true })).toHaveValue("200");
});

test("individual timed and cardio changes preserve metadata and appear in the day", async ({ page }, testInfo) => {
  await page.goto("/e2e/fixtures/workout-edit.html");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  const writes: Record<string, unknown>[] = [];
  await page.route(`**/workouts/${before.id}/sets`, async route => {
    const payload = route.request().postDataJSON();
    writes.push(payload);
    const original = before.sets.find((row: { exercise_id: string }) => row.exercise_id === payload.exercise_id);
    await route.fulfill({ json: { ...original, ...payload } });
  });
  await page.getByRole("button", { name: "Изменить подход 1: Планка" }).click();
  const set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await expect(set.getByLabel("Отдых после подхода")).toHaveCount(0);
  await set.getByRole("combobox", { name: "Минуты: выбрать значение" }).selectOption("1");
  await set.getByRole("combobox", { name: "Секунды: выбрать значение" }).selectOption("0");
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(set).toHaveCount(0);
  await page.getByRole("button", { name: "Изменить подход 1: Беговая дорожка" }).click();
  await expect(set.getByLabel("Скорость", { exact: true })).toHaveValue("4");
  await set.getByLabel("Скорость", { exact: true }).fill("5.5");
  await set.getByRole("checkbox", { name: "Подход выполнен" }).check();
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(set).toHaveCount(0);
  const stored = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  expect(stored.status).toBe("completed");
  expect(writes).toHaveLength(2);
  expect(stored.sets.find((row: { exercise_id: string }) => row.exercise_id === before.sets[2].exercise_id)).toMatchObject({
    rest_time_sec: 105, is_completed: true, reps: null, weight: null, duration_sec: 300,
    machine_params: { speed: 5.5, incline: 2, custom_setting: "keep" },
  });
  expect(stored.sets.find((row: { exercise_id: string }) => row.exercise_id === before.sets[1].exercise_id)).toMatchObject({ duration_sec: 60, rest_time_sec: 0, weight: null, reps: null });
  expect(stored.sets.find((row: { id: string }) => row.id === before.sets[0].id)).toEqual(before.sets[0]);
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(v => v.impact === "serious" || v.impact === "critical");
  expect(violations).toEqual([]);
  await page.getByRole("dialog").screenshot({ path: testInfo.outputPath("individual-set-day.png") });
});

test("failed single-set save keeps the draft and permits retry", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  let attempts = 0;
  await page.route(`**/workouts/${before.id}/sets`, async route => {
    attempts++;
    await route.fulfill(attempts === 1 ? { status: 503, json: { detail: "Сохранение временно недоступно" } }
      : { json: { ...before.sets[0], ...route.request().postDataJSON() } });
  });
  const trigger = page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания" });
  await trigger.click();
  const set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await set.getByLabel("Примечание (по желанию)").fill("Сохранить этот черновик");
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(set.getByRole("alert")).toBeVisible();
  await expect(set.getByLabel("Примечание (по желанию)")).toHaveValue("Сохранить этот черновик");
  await expect(set.getByRole("button", { name: "Применить", exact: true })).toBeEnabled();
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(set).toHaveCount(0);
  await expect(trigger).toContainText("Сохранить этот черновик");
});

test("note-only history edit preserves original precision, null metrics and saved weight semantics", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?legacy=1");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  let received: Record<string, unknown> | null = null;
  await page.route(`**/workouts/${before.id}/sets`, async route => {
    received = route.request().postDataJSON();
    await route.fulfill({ json: { ...before.sets[0], ...received } });
  });
  await page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания" }).click();
  const set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await expect(set.getByText("Рабочий вес, кг", { exact: true })).toBeVisible();
  await expect(set.getByText("Вес одной гантели, кг", { exact: true })).toHaveCount(0);
  await set.getByLabel("Примечание (по желанию)").fill("Только новая заметка");
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => received).toMatchObject({ weight: 12.25, reps: null, rest_time_sec: null, weight_mode: "total", note: "Только новая заметка" });
});

test("adding an extra historical set keeps the copied total-weight convention", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?legacy=1");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  let received: Record<string, unknown> | null = null;
  await page.route(`**/workouts/${before.id}/sets`, async route => {
    received = route.request().postDataJSON();
    await route.fulfill({ json: { ...before.sets[0], id: "99999999-9999-4999-8999-999999999999", ...received } });
  });
  await page.getByRole("button", { name: "Добавить подход: Гакк-приседания" }).click();
  const set = page.getByRole("dialog", { name: "Добавить подход", exact: true });
  await expect(set.getByText("Рабочий вес, кг", { exact: true })).toBeVisible();
  await expect(set.getByText("12,25 кг", { exact: true })).toBeVisible();
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => received).toMatchObject({ weight: 12.25, weight_mode: "total", set_number: 4, is_completed: true });
  await expect(page.getByRole("button", { name: "Изменить подход 4: Гакк-приседания" })).toContainText("12.25 кг");
});
