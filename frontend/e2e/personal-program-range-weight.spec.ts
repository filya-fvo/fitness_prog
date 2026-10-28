import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { PersonalProgramInput } from "../src/api/programs";

const owner = "22222222-2222-4222-8222-222222222222";
const secondOwner = "55555555-5555-4555-8555-555555555555";
const ids = [1, 2, 3, 4, 5].map(n => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`);
const names = ["Жим гантелей", "Отжимания", "Жим штанги", "Планка", "Беговая дорожка"];
const catalog = ids.map((id, i) => ({ id, name_ru: names[i], muscle_group: i === 4 ? "Кардио" : "Грудь", equipment: i === 0 ? "гантели" : i === 2 ? "штанга" : i === 4 ? "тренажёр" : "свой вес",
  tags: [`load:${i === 1 ? "reps_only" : i >= 3 ? "timed" : "weight_reps"}`], weight_rule: i === 0 ? "per_hand" : "total", difficulty: 1, media_source: "none" }));

async function open(page: Page, typed = true) {
  const writes: PersonalProgramInput[] = [];
  await page.route(/\/exercises(?:\?|$)/, route => route.fulfill({ json: { items: catalog, total: catalog.length, page: 1, page_size: 200 } }));
  await page.route("**/programs/mine", route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ status: 500, json: { detail: "Synthetic request capture" } });
  });
  await page.addInitScript(({ owner, ids, typed }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ name: "План с целями", location: "gym", progression: "phased", durationWeeks: "8", dayCount: 2, activeDay: 0, step: "days",
      days: [1, 2].map(day => ({ name: `День ${day}`, exercises: ids.slice(0, 2).map((exercise_id, i) => ({ exercise_id, sets: "3", reps: "8-12", rest_sec: "60",
        ...(typed ? { target: i === 0 ? { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: null } : { kind: "reps_only", reps_min: 8, reps_max: 12 } } : {}) })) })) }));
  }, { owner, ids, typed });
  await page.goto("/e2e/fixtures/personal-program.html");
  await expect(page.getByLabel("Название дня")).toHaveValue("День 1");
  return writes;
}

test("typed ranges and optional weights gate the canonical request", async ({ page }) => {
  const writes = await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  const min = row.getByLabel("От", { exact: true });
  const max = row.getByLabel("До", { exact: true });
  const weight = row.getByLabel("Вес одной гантели, кг", { exact: true });
  const save = page.getByRole("button", { name: "Создать программу", exact: true });
  await expect(min).toHaveValue("8"); await expect(max).toHaveValue("12");
  await expect(weight).toHaveValue("");
  await expect(row.getByText("Укажу при выполнении", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: names[1], exact: true }).getByLabel(/вес.*кг/i)).toHaveCount(0);
  for (const invalid of ["", "0", "-1", "1.5", "100001"]) {
    await min.fill(invalid); await expect(min).toHaveValue(invalid); await expect(save).toBeDisabled();
  }
  await min.fill("8");
  for (const invalid of ["", "0", "100001", "1.5"]) {
    await max.fill(invalid); await expect(max).toHaveValue(invalid); await expect(save).toBeDisabled();
  }
  await min.fill("15"); await max.fill("10"); await min.blur();
  await expect(row.getByText(/«От».*«До»/)).toBeVisible(); await expect(save).toBeDisabled();
  await min.fill("10"); await expect(row).toContainText("3 × 10");
  await expect(save).toBeEnabled();
  await row.getByRole("button", { name: "Увеличить: До", exact: true }).click();
  await expect(max).toHaveValue("11"); await expect(row).toContainText("3 × 10–11");
  await max.fill("10");
  for (const invalid of ["12,", "12.", "-", "0", "10001", "12.345"]) {
    await weight.fill(invalid); await expect(weight).toHaveValue(invalid); await expect(save).toBeDisabled();
  }
  for (const valid of ["12,50", "12.500", ""]) {
    await weight.fill(valid); await expect(save).toBeEnabled();
    await save.click(); await expect.poll(() => writes.length).toBe(valid === "12,50" ? 1 : valid === "12.500" ? 2 : 3);
  }
  expect(writes.map(write => write.days[0].exercises[0].target)).toEqual([
    { kind: "weight_reps", reps_min: 10, reps_max: 10, target_weight: 12.5 },
    { kind: "weight_reps", reps_min: 10, reps_max: 10, target_weight: 12.5 },
    { kind: "weight_reps", reps_min: 10, reps_max: 10, target_weight: null },
  ]);
  expect(writes[0].days[0].exercises[0]).toMatchObject({ reps: "10", weight_mode: "per_hand" });
});

for (const legacy of ["", "прежний текст"]) test(`recovered repeat goals preserve hidden legacy ${JSON.stringify(legacy)} without blocking save`, async ({ page }) => {
  const writes = await open(page);
  await page.evaluate(({ owner, legacy }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    const draft = JSON.parse(localStorage.getItem(key)!);
    for (const row of draft.days[0].exercises) row.reps = legacy;
    localStorage.setItem(key, JSON.stringify(draft));
  }, { owner, legacy });
  await page.reload();
  const save = page.getByRole("button", { name: "Создать программу", exact: true });
  await expect(save).toBeEnabled();
  await expect(page.getByLabel("Повторы", { exact: true })).toHaveCount(0);
  const min = page.getByRole("region", { name: names[0], exact: true }).getByLabel("От", { exact: true });
  await min.fill(""); await expect(save).toBeDisabled(); await min.fill("8");
  await save.click(); await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises.map(row => row.reps)).toEqual(["8-12", "8-12"]);
  expect(await page.evaluate(owner => JSON.parse(localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`)!).days[0].exercises.map((row: { reps: string }) => row.reps), owner)).toEqual([legacy, legacy]);
  // Removing a typed goal leaves the same old text visible and blocking.
  await page.evaluate(({ owner }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    const draft = JSON.parse(localStorage.getItem(key)!);
    delete draft.days[0].exercises[0].target;
    delete draft.days[0].raw;
    localStorage.setItem(key, JSON.stringify(draft));
  }, { owner });
  await page.reload();
  await expect(page.getByLabel("Повторы", { exact: true })).toHaveValue(legacy);
  await expect(save).toBeDisabled();
  await page.getByLabel("Повторы", { exact: true }).fill("8-12"); await expect(save).toBeEnabled();
});

test("optional weight steppers clear at zero while typed zero stays invalid", async ({ page }) => {
  await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  const field = row.getByLabel("Вес одной гантели, кг", { exact: true });
  const minus = row.getByRole("button", { name: "Уменьшить: Вес одной гантели, кг", exact: true });
  await expect(minus).toBeDisabled();
  await row.getByRole("button", { name: "Увеличить: Вес одной гантели, кг", exact: true }).click();
  await expect(field).toHaveValue("0.5");
  await minus.click(); await expect(field).toHaveValue("");
  await field.fill("0.25"); await minus.click(); await expect(field).toHaveValue("");
  await field.fill("0"); await expect(field).toHaveValue("0");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
});

test("raw goal text belongs to its row, day and owner through reorder and reload", async ({ page }) => {
  const writes = await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  const weight = row.getByLabel("Вес одной гантели, кг", { exact: true });
  await row.getByLabel("От", { exact: true }).fill("0009"); await weight.fill("12,");
  await row.getByLabel("Отдых, с", { exact: true }).fill("90");
  await expect(weight).toHaveValue("12,");
  await page.getByRole("button", { name: `Опустить ${names[0]}`, exact: true }).click();
  await expect(weight).toHaveValue("12,");
  await page.getByRole("button", { name: /^День 2/ }).click(); await expect(weight).toHaveValue("");
  await page.getByRole("button", { name: /^День 1/ }).click(); await page.reload();
  await expect(weight).toHaveValue("12,"); await expect(row.getByLabel("От", { exact: true })).toHaveValue("0009");
  await page.evaluate(second => window.dispatchEvent(new CustomEvent("fixture-owner", { detail: second })), secondOwner);
  await expect(page.getByLabel("Название программы", { exact: true })).toHaveValue("");
  await page.evaluate(owner => window.dispatchEvent(new CustomEvent("fixture-owner", { detail: owner })), owner);
  await expect(weight).toHaveValue("12,");
  await weight.fill("012,50");
  await page.getByRole("button", { name: `Поднять ${names[0]}`, exact: true }).click();
  await expect(weight).toHaveValue("012,50");
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[0]).toMatchObject({ exercise_id: ids[0], reps: "9-12", weight_mode: "per_hand", target: { reps_min: 9, reps_max: 12, target_weight: 12.5 } });
  expect(writes[0].days[1].exercises[0].target).toMatchObject({ reps_min: 8, reps_max: 12, target_weight: null });
});

test("new compatible rows get typed defaults while no-target legacy keeps its controls", async ({ page }) => {
  const writes = await open(page, false);
  const legacy = page.getByRole("region", { name: names[0], exact: true });
  await expect(legacy.getByLabel("Повторы", { exact: true })).toHaveValue("8-12");
  await expect(legacy.getByLabel("От", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: `Убрать ${names[1]}`, exact: true }).click();
  for (const name of names.slice(1, 4)) {
    await page.getByRole("searchbox", { name: "Добавить упражнение", exact: true }).fill(name);
    await page.getByRole("button", { name: `Добавить ${name}`, exact: true }).click();
  }
  for (const name of names.slice(1, 3)) {
    const row = page.getByRole("region", { name, exact: true });
    await expect(row.getByLabel("От", { exact: true })).toHaveValue("8"); await expect(row.getByLabel("До", { exact: true })).toHaveValue("12");
  }
  await expect(page.getByRole("region", { name: names[3], exact: true }).getByLabel("Время работы", { exact: true })).toHaveValue("45");
  await page.getByRole("region", { name: names[2], exact: true }).getByLabel("Рабочий вес, кг", { exact: true }).fill("20.25");
  await page.evaluate(({ owner, id }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    const draft = JSON.parse(localStorage.getItem(key)!);
    delete draft.days[0].exercises.find((row: { exercise_id: string }) => row.exercise_id === id).target;
    localStorage.setItem(key, JSON.stringify(draft));
  }, { owner, id: ids[3] });
  await page.reload();
  await expect(page.getByRole("region", { name: names[3], exact: true }).getByLabel("Повторы", { exact: true })).toHaveValue("8-12");
  await page.evaluate(({ owner, id }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    const draft = JSON.parse(localStorage.getItem(key)!);
    draft.days[0].exercises.find((row: { exercise_id: string }) => row.exercise_id === id).target = { kind: "timed", duration_sec: 45 };
    localStorage.setItem(key, JSON.stringify(draft));
  }, { owner, id: ids[3] });
  await page.reload();
  await expect(page.getByRole("region", { name: names[3], exact: true }).getByLabel("Время работы", { exact: true })).toHaveValue("45");
  await page.getByRole("button", { name: "Создать программу", exact: true }).click(); await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises.map(row => row.target)).toEqual([undefined, { kind: "reps_only", reps_min: 8, reps_max: 12 }, { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 20.25 }, { kind: "timed", duration_sec: 45 }]);
  expect(writes[0].days[0].exercises[2].weight_mode).toBe("total");
});

for (const theme of ["light", "dark"]) for (const width of [320, 393, 1440]) test(`goal controls fit ${width} ${theme}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 852 });
  await page.addInitScript(theme => localStorage.setItem("fitness_theme_preference", theme), theme);
  await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  await row.getByRole("button", { name: "Увеличить: Вес одной гантели, кг", exact: true }).click();
  await expect(row.getByLabel("Вес одной гантели, кг", { exact: true })).toHaveValue("0.5");
  for (const label of ["От", "До", "Вес одной гантели, кг"]) {
    const field = row.getByLabel(label, { exact: true });
    expect(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    const inputBox = await field.boundingBox(); expect(inputBox!.width).toBeGreaterThanOrEqual(60);
    for (const prefix of ["Уменьшить", "Увеличить"]) {
      const box = await row.getByRole("button", { name: `${prefix}: ${label}`, exact: true }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).include(`section[aria-label="${names[0]}"]`).withRules(["color-contrast", "label", "button-name"]).analyze();
  expect(axe.violations).toEqual([]);
  await row.screenshot({ path: testInfo.outputPath(`goal-controls-${width}-${theme}.png`) });
});

async function openTimed(page: Page, legacy = "8-12") {
  await page.addInitScript(({ owner, ids, legacy }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ name: "План времени", location: "gym", progression: "phased", durationWeeks: "8", dayCount: 2, activeDay: 0, step: "days",
      days: [1, 2].map(day => ({ name: `День ${day}`, exercises: [
        { exercise_id: ids[3], sets: "3", reps: legacy, rest_sec: "0", target: { kind: "timed", duration_sec: 90 } },
        { exercise_id: ids[1], sets: "3", reps: "8-12", rest_sec: "60", target: { kind: "reps_only", reps_min: 8, reps_max: 12 } },
      ] })) }));
  }, { owner, ids, legacy });
  return open(page);
}

test("work time uses exact units, bounds, presets and decimal steps in canonical requests", async ({ page }) => {
  const writes = await openTimed(page);
  const row = page.getByRole("region", { name: names[3], exact: true });
  const time = row.getByLabel("Время работы", { exact: true });
  const save = page.getByRole("button", { name: "Создать программу", exact: true });
  await expect(time).toHaveValue("90"); await expect(time).toHaveAttribute("inputmode", "numeric");
  const unitBackground = (name: string) => row.getByRole("button", { name, exact: true }).evaluate(el => getComputedStyle(el).backgroundColor);
  expect(await unitBackground("Секунды")).not.toBe(await unitBackground("Минуты"));
  await expect(row.getByLabel("Повторы", { exact: true })).toHaveCount(0);
  for (const invalid of ["0", "86401", "1.5"]) {
    await time.fill(invalid); await expect(time).toHaveValue(invalid); await expect(save).toBeDisabled();
  }
  await time.fill("90"); await row.getByRole("button", { name: "Минуты", exact: true }).click();
  await expect(time).toHaveValue("1.5"); await expect(time).toHaveAttribute("inputmode", "decimal");
  expect(await unitBackground("Минуты")).not.toBe(await unitBackground("Секунды"));
  for (const invalid of ["0", "1440.05", "0.01", "1.001"]) {
    await time.fill(invalid); await expect(time).toHaveValue(invalid); await expect(save).toBeDisabled();
    await expect(row).toContainText("3 × —");
    await expect(page.getByLabel("Порядок и паузы", { exact: true })).toHaveCount(0);
  }
  await time.fill("1,5"); await expect(row).toContainText("3 × 1:30"); await save.click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[0]).toMatchObject({ reps: "90с", rest_sec: 0, target: { kind: "timed", duration_sec: 90 } });
  await page.getByLabel("Порядок и паузы", { exact: true }).locator("summary").click();
  await expect(page.getByRole("list", { name: "Шаги тренировки", exact: true })).toContainText("90 с работы");
  await row.getByRole("button", { name: "Секунды", exact: true }).click(); await expect(time).toHaveValue("90");
  await time.fill("1"); await row.getByRole("button", { name: "Минуты", exact: true }).click();
  await expect(time).toHaveValue("1"); await expect(row.getByRole("button", { name: "Секунды", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(row.getByText(/очистите.*новое время/i)).toBeVisible(); await expect(save).toBeEnabled();
  await time.fill(""); await row.getByRole("button", { name: "Минуты", exact: true }).click();
  await expect(time).toHaveValue(""); await expect(save).toBeDisabled();
  await time.fill("1.1"); await row.getByRole("button", { name: "Уменьшить: Время работы", exact: true }).click();
  await expect(time).toHaveValue("0.1"); await expect(row).toContainText("3 × 6 с"); await expect(save).toBeEnabled();
  await save.click(); await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].days[0].exercises[0].target).toEqual({ kind: "timed", duration_sec: 6 });
  await row.getByRole("button", { name: "Увеличить: Время работы", exact: true }).click(); await expect(time).toHaveValue("1.1");
  await row.getByRole("group", { name: "Быстрый выбор: Время работы", exact: true }).getByRole("button", { name: "2", exact: true }).click();
  await expect(time).toHaveValue("2"); await row.getByRole("button", { name: "Секунды", exact: true }).click(); await expect(time).toHaveValue("120");
  await row.getByRole("group", { name: "Быстрый выбор: Время работы", exact: true }).getByRole("button", { name: "30", exact: true }).click();
  await expect(time).toHaveValue("30"); await expect(row.getByLabel("Отдых, с", { exact: true })).toHaveValue("0");
});

for (const legacy of ["", "прежний текст"]) test(`timed goal owns save with hidden legacy ${JSON.stringify(legacy)}`, async ({ page }) => {
  const writes = await openTimed(page, legacy);
  const time = page.getByRole("region", { name: names[3], exact: true }).getByLabel("Время работы", { exact: true });
  const save = page.getByRole("button", { name: "Создать программу", exact: true });
  await expect(save).toBeEnabled(); await time.fill(""); await expect(save).toBeDisabled(); await time.fill("90");
  await save.click(); await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[0]).toMatchObject({ reps: "90с", target: { kind: "timed", duration_sec: 90 } });
  expect(await page.evaluate(owner => JSON.parse(localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`)!).days[0].exercises[0].reps, owner)).toBe(legacy);
});

test("work time raw unit belongs to its row, day and owner and survives invalid reloads", async ({ page }) => {
  await openTimed(page);
  const row = page.getByRole("region", { name: names[3], exact: true });
  const time = row.getByLabel("Время работы", { exact: true });
  const save = page.getByRole("button", { name: "Создать программу", exact: true });
  await time.fill("-"); await row.getByRole("button", { name: "Минуты", exact: true }).click();
  await expect(time).toHaveValue("-"); await expect(time).toHaveAttribute("inputmode", "decimal");
  await time.fill("1,"); await time.blur(); await expect(row).toContainText("3 × —"); await expect(save).toBeDisabled();
  await expect(time).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(`[id="${await time.getAttribute("aria-describedby")}"]`)).toContainText("Время работы");
  await page.reload(); await expect(time).toHaveValue("1,"); await expect(time).toHaveAttribute("inputmode", "decimal");
  await time.fill(""); await page.reload(); await expect(time).toHaveValue(""); await expect(save).toBeDisabled();
  await expect(row.getByRole("button", { name: "Минуты", exact: true })).toHaveAttribute("aria-pressed", "true");
  await time.fill("01,500"); await page.getByRole("button", { name: `Опустить ${names[3]}`, exact: true }).click();
  await expect(time).toHaveValue("01,500");
  await page.getByRole("button", { name: /^День 2/ }).click(); await expect(time).toHaveValue("90");
  await page.getByRole("button", { name: /^День 1/ }).click(); await page.reload(); await expect(time).toHaveValue("01,500");
  await page.evaluate(second => window.dispatchEvent(new CustomEvent("fixture-owner", { detail: second })), secondOwner);
  await expect(page.getByLabel("Название программы", { exact: true })).toHaveValue("");
  await page.evaluate(owner => window.dispatchEvent(new CustomEvent("fixture-owner", { detail: owner })), owner);
  await expect(time).toHaveValue("01,500"); await expect(time).toHaveAttribute("inputmode", "decimal");
  await page.getByRole("button", { name: `Убрать ${names[3]}`, exact: true }).click();
  expect(await page.evaluate(({ owner, id }) => {
    const day = JSON.parse(localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`)!).days[0];
    return { unit: day.timeUnits?.[id], raw: day.raw?.[`${id}/target/duration_sec`] };
  }, { owner, id: ids[3] })).toEqual({ unit: undefined, raw: undefined });
});

test("new cardio machine uses the catalog default with its runtime load semantics", async ({ page }) => {
  const writes = await open(page);
  await page.getByRole("searchbox", { name: "Добавить упражнение", exact: true }).fill(names[4]);
  await page.getByRole("button", { name: `Добавить ${names[4]}`, exact: true }).click();
  const row = page.getByRole("region", { name: names[4], exact: true });
  await expect(row.getByLabel("Время работы", { exact: true })).toHaveValue("300");
  await expect(row.getByLabel("Повторы", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Создать программу", exact: true }).click(); await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[2].target).toEqual({ kind: "timed", duration_sec: 300 });
  expect(writes[0].days[0].exercises[2].weight_mode).toBeUndefined();
});

for (const theme of ["light", "dark"]) for (const width of [320, 393, 1440]) test(`work time controls fit ${width} ${theme} without blur shift`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 852 });
  await page.addInitScript(theme => localStorage.setItem("fitness_theme_preference", theme), theme);
  await openTimed(page);
  const row = page.getByRole("region", { name: names[3], exact: true });
  const time = row.getByLabel("Время работы", { exact: true });
  await row.getByRole("button", { name: "Минуты", exact: true }).click(); await time.fill("1,");
  const preset = row.getByRole("group", { name: "Быстрый выбор: Время работы", exact: true }).getByRole("button", { name: "2", exact: true });
  const before = await preset.boundingBox(); await time.blur(); const after = await preset.boundingBox();
  expect(after!.y).toBe(before!.y);
  expect(await time.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  expect((await time.boundingBox())!.width).toBeGreaterThanOrEqual(60);
  for (const name of ["Минуты", "Секунды", "Уменьшить: Время работы", "Увеличить: Время работы"]) {
    const box = await row.getByRole("button", { name, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include(`section[aria-label="${names[3]}"]`).withRules(["color-contrast", "label", "button-name"]).analyze()).violations).toEqual([]);
  await row.screenshot({ path: testInfo.outputPath(`work-time-${width}-${theme}.png`) });
});

async function openLegacy(page: Page, texts = [" 08 – 12 ", "10-10", "60с", "1,5мин"]) {
  await page.addInitScript(({ owner, ids, texts }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ name: "Старый план", location: "gym", progression: "phased", durationWeeks: 8, dayCount: 1, activeDay: 0, step: "days",
      days: [{ name: "День 1", exercises: [ids[0], ids[1], ids[3], ids[4]].map((exercise_id, i) => ({ exercise_id, sets: 2, reps: texts[i], rest_sec: 0 })) }] }));
  }, { owner, ids, texts });
  return open(page);
}

test("legacy goals convert only by explicit action and keep exact fallbacks after reload", async ({ page }) => {
  const writes = await openLegacy(page);
  const legacyNames = [names[0], names[1], names[3], names[4]];
  const rows = legacyNames.map(name => page.getByRole("region", { name, exact: true }));
  const originals = [" 08 – 12 ", "10-10", "60с", "1,5мин"];
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await expect(rows[3].getByRole("button", { name: "Перенести в поля цели", exact: true })).toBeEnabled();
  for (let i = 0; i < rows.length; i++) {
    await expect(rows[i].getByLabel("Повторы", { exact: true })).toHaveValue(originals[i]);
    await expect(rows[i].getByLabel("От", { exact: true })).toHaveCount(0);
    await rows[i].getByRole("button", { name: "Перенести в поля цели", exact: true }).click();
  }
  await expect(rows[0].getByLabel("От", { exact: true })).toHaveValue("8");
  await expect(rows[0].getByLabel("До", { exact: true })).toHaveValue("12");
  await expect(rows[1].getByLabel("До", { exact: true })).toHaveValue("10");
  await expect(rows[2].getByLabel("Время работы", { exact: true })).toHaveValue("60");
  await expect(rows[3].getByLabel("Время работы", { exact: true })).toHaveValue("90");
  await page.reload();
  await expect(rows[3].getByLabel("Время работы", { exact: true })).toHaveValue("90");
  expect(await page.evaluate(owner => JSON.parse(localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`)!).days[0].exercises.map((row: { reps: string }) => row.reps), owner)).toEqual(originals);
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises).toMatchObject([
    { sets: 2, rest_sec: 0, reps: "8-12", weight_mode: "per_hand", target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: null } },
    { reps: "10", target: { kind: "reps_only", reps_min: 10, reps_max: 10 } },
    { reps: "60с", target: { kind: "timed", duration_sec: 60 } },
    { reps: "90с", target: { kind: "timed", duration_sec: 90 } },
  ]);
});

test("legacy invalid text stays repairable after reload and blocks conversion and save", async ({ page }) => {
  const writes = await openLegacy(page, ["мой старый текст", "10", "60с", "90с"]);
  const row = page.getByRole("region", { name: names[0], exact: true });
  const text = row.getByLabel("Повторы", { exact: true });
  const action = row.getByRole("button", { name: "Перенести в поля цели", exact: true });
  await expect(text).toHaveValue("мой старый текст"); await expect(text).toHaveAttribute("maxlength", "20");
  await expect(action).toBeDisabled();
  await expect(row).toContainText("Исправьте исходную запись");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await page.reload(); await expect(text).toHaveValue("мой старый текст");
  await text.fill("12-8"); await expect(action).toBeDisabled();
  await text.fill("8-12"); await expect(action).toBeEnabled();
  await expect(row.getByLabel("От", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[0].target).toBeUndefined();
  await action.click(); await expect(row.getByLabel("От", { exact: true })).toHaveValue("8");
});
