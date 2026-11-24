import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("day lists unperformed exercises and planned sets and opens one set directly", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html");
  const day = page.getByRole("dialog").first();
  const missing = day.getByRole("button", { name: "Изменить подход 2: Гакк-приседания" });
  await expect(missing).toBeVisible();
  await expect(missing).toContainText("Не выполнено");
  await expect(day.getByRole("button", { name: "Изменить подход 1: Беговая дорожка" })).toContainText("Не выполнено");
  await expect(day.getByRole("button", { name: "Изменить подход 1: Гакк-приседания" })).toContainText("Лучше прошлого");
  await expect(day.getByRole("button", { name: "Изменить подход 1: Планка" })).toContainText("Так же / ниже");
  await missing.click();
  const set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await expect(set.getByRole("listbox", { name: "Повторения", exact: true })).toBeVisible();
  await expect(set.getByRole("dialog")).toHaveCount(0);
  await expect(set.getByText(/Только таймер|Запустить таймер|Отдых после подхода/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(missing).toBeFocused();
  await expect(missing).toContainText("Не выполнено");
});

test("one saved set updates the day immediately and survives reopening", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  const writes: Record<string, unknown>[] = [];
  await page.route(`**/workouts/${before.id}/sets`, async route => {
    const payload = route.request().postDataJSON();
    writes.push(payload);
    await route.fulfill({ json: { id: "99999999-9999-4999-8999-999999999999", workout_id: before.id, ...payload } });
  });
  await page.getByRole("button", { name: "Изменить подход 2: Гакк-приседания" }).click();
  const set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await set.getByRole("combobox", { name: "Повторения: выбрать значение" }).selectOption("12");
  await set.getByRole("combobox", { name: "Кг: выбрать значение", exact: true }).selectOption("260");
  await set.getByRole("checkbox", { name: "Подход выполнен" }).check();
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(set).toHaveCount(0);
  const row = page.getByRole("button", { name: "Изменить подход 2: Гакк-приседания" });
  await expect(row).toContainText("260 кг × 12");
  await expect(row).not.toContainText("Не выполнено");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ set_number: 2, is_completed: true, weight: 260, reps: 12 });
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Открыть день" }).click();
  await expect(row).toContainText("260 кг × 12");
  const stored = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  expect(stored.sets).toHaveLength(4);
  expect(stored.sets[0]).toEqual(before.sets[0]);
  expect(stored.status).toBe("completed");
});

test("history notes can be edited without changing old zero reps or duration", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?zeroTarget");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  const writes: Array<Record<string, unknown>> = [];
  await page.route(`**/workouts/${before.id}/sets`, route => {
    const payload = route.request().postDataJSON();
    const row = before.sets.find((item: { exercise_id: string }) => item.exercise_id === payload.exercise_id);
    writes.push(payload);
    return route.fulfill({ json: { ...row, ...payload } });
  });
  const editor = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  for (const exercise of ["Гакк-приседания", "Планка"]) {
    await page.getByRole("button", { name: `Изменить подход 1: ${exercise}`, exact: true }).click();
    const addNote = editor.getByRole("button", { name: "Добавить примечание", exact: true });
    if (await addNote.isVisible()) await addNote.click();
    await editor.getByRole("textbox", { name: "Примечание (по желанию)", exact: true }).fill("Правка записи");
    await editor.getByRole("button", { name: "Применить", exact: true }).click();
    await expect(editor).toHaveCount(0);
  }
  expect(writes).toHaveLength(2);
  expect(writes[0]).toMatchObject({ reps: 0, note: "Правка записи" });
  expect(writes[1]).toMatchObject({ duration_sec: 0, note: "Правка записи" });
});

test("full day status colors remain readable in both themes and small viewports", async ({ page }, testInfo) => {
  await page.goto("/e2e/fixtures/workout-edit.html");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(async value => {
      const modulePath = "/src/theme/theme.ts";
      const { setThemePreference } = await import(/* @vite-ignore */ modulePath);
      setThemePreference(value);
    }, theme);
    for (const width of [320, 393, 1440]) {
      await page.setViewportSize({ width, height: 568 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(v => v.impact === "serious" || v.impact === "critical");
    expect(violations).toEqual([]);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.getByRole("dialog").screenshot({ path: testInfo.outputPath(`full-day-${theme}.png`) });
  }
});

test("pending note save prevents overlapping set edits and keeps both results", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  let releaseSave!: () => void;
  const gate = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route(`**/workouts/${before.id}`, async route => {
    await gate;
    await route.fulfill({ json: { ...before, ...route.request().postDataJSON() } });
  });
  await page.route(`**/workouts/${before.id}/sets`, route => route.fulfill({ json: { ...before.sets[0], ...route.request().postDataJSON() } }));
  await page.getByRole("button", { name: "Заметки и тяжесть тренировки" }).click();
  await page.getByRole("textbox", { name: "Заметки", exact: true }).fill("Сохранённая новая заметка");
  await page.getByRole("button", { name: "Сохранить заметки" }).click();
  const trigger = page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания" });
  try {
    await expect(trigger).toBeDisabled();
    await expect(page.getByRole("button", { name: "Закрыть", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally { releaseSave(); }
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const set = page.getByRole("dialog", { name: "Изменить подход", exact: true });
  await set.getByRole("combobox", { name: "Кг: выбрать значение", exact: true }).selectOption("260");
  await set.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(set).toHaveCount(0);
  const stored = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  expect(stored.ai_notes).toBe("Сохранённая новая заметка");
  expect(stored.sets.find((row: { id: string }) => row.id === before.sets[0].id).weight).toBe(260);
});
