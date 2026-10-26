import { expect, test, type Page } from "@playwright/test";
import type { PersonalProgramInput } from "../src/api/programs";
import { installMethodApi } from "./fixtures/workout-method-api";
import AxeBuilder from "@axe-core/playwright";

const owner = "22222222-2222-4222-8222-222222222222";
const ids = Array.from({ length: 13 }, (_, index) => `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`);
const names = ["Жим гантелей", "Тяга гантелей", "Присед с гантелями", "Жим стоя", ...Array.from({ length: 9 }, (_, i) => `Упражнение ${i + 5}`)];
const catalog = ids.map((id, index) => ({ id, name_ru: names[index], muscle_group: "Грудь", equipment: "гантели", tags: ["load:weight_reps"], weight_rule: "per_hand", difficulty: 1, media_source: "none" }));
async function open(page: Page, count = 3) {
  const writes: PersonalProgramInput[] = [];
  await page.route(/\/exercises(?:\?|$)/, route => route.fulfill({ json: { items: catalog, total: catalog.length, page: 1, page_size: 200 } }));
  await page.route("**/programs/mine", async route => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({ status: 500, json: { detail: "Synthetic capture; no server persistence" } });
  });
  await page.addInitScript(({ owner, ids, count }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ name: "Мой составной план", location: "gym", progression: "linear", durationWeeks: "52", dayCount: 2, activeDay: 0, step: "days",
      days: [1, 2].map(day => ({ name: `День ${day}`, exercises: ids.slice(0, count).map(exercise_id => ({ exercise_id, sets: "3", reps: "8-12", rest_sec: "0" })) })) }));
  }, { owner, ids, count });
  await page.goto("/e2e/fixtures/personal-program.html");
  await expect(page.getByLabel("Название дня")).toHaveValue("День 1");
  return writes;
}

test("personal creation exposes the shared group and method controls", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: "Создать суперсет", exact: true })).toBeVisible();
  await page.getByRole("region", { name: names[0], exact: true }).locator("summary").click();
  await expect(page.getByLabel(`Способ выполнения ${names[0]}`, { exact: true })).toBeVisible();
});

for (const kind of ["superset", "triset", "circuit"] as const) test(`creates, edits and recovers ${kind} in one atomic personal payload`, async ({ page }) => {
  const writes = await open(page);
  await page.getByRole("button", { name: "Создать суперсет", exact: true }).click();
  await page.getByLabel("Вид связки", { exact: true }).selectOption(kind);
  const members = names.slice(0, kind === "superset" ? 2 : 3);
  for (const name of members) await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByLabel("Раунды", { exact: true }).fill("8");
  await page.getByLabel("Переход между упражнениями, с", { exact: true }).fill("5");
  await page.getByLabel("Отдых после раунда, с", { exact: true }).fill("75");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "1 · Основа", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^День 2/ })).toBeDisabled();
  await page.getByRole("button", { name: "Создать связку", exact: true }).click();
  await page.getByRole("button", { name: "Изменить связку", exact: true }).click();
  await page.getByLabel("Раунды", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Сохранить связку", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Изменить связку", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^День 2/ }).click();
  await expect(page.getByRole("button", { name: "Изменить связку", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^День 1/ }).click();
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].groups?.[0]).toMatchObject({ kind, rounds: 2, transition_sec: 5, round_rest_sec: 75, exercise_ids: ids.slice(0, members.length) });
  expect(writes[0].days[0].exercises.slice(0, members.length).map(row => row.sets)).toEqual(members.map(() => 2));
  expect(writes[0].duration_weeks).toBe(52);
  expect(writes[0].days[0].exercises[0].rest_sec).toBe(0);
});

for (const kind of ["drop", "cluster"] as const) for (const selection of ["last", "all", "2"]) test(`saves and recovers ${selection} ${kind} methods`, async ({ page }) => {
  const writes = await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  await row.locator("summary").click();
  await row.getByLabel(`Для подходов ${names[0]}`, { exact: true }).selectOption(selection);
  await row.getByLabel(`Способ выполнения ${names[0]}`, { exact: true }).selectOption(kind);
  if (kind === "cluster") await row.getByLabel(`Рабочий вес ${names[0]}`, { exact: true }).fill("12.50");
  else for (const [index, value] of ["12.50", "10.25", "8.75"].entries()) await row.getByLabel(`Вес части ${index + 1} ${names[0]}`, { exact: true }).fill(value);
  await page.reload();
  await expect(row.locator("summary")).toContainText(kind === "drop" ? "Дроп-сет" : "Кластеры");
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  const methods = writes[0].days[0].exercises[0].set_methods!;
  expect(methods.map(method => method.set_number)).toEqual(selection === "all" ? [1, 2, 3] : [selection === "last" ? 3 : 2]);
  expect(methods[0].parts.map(part => part.target_weight)).toEqual(kind === "drop" ? [12.5, 10.25, 8.75] : [12.5, 12.5, 12.5]);
});

test("pending or invalid group cannot leave its day and cancellation releases the form", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Создать суперсет", exact: true }).click();
  for (const name of names.slice(0, 2)) await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByLabel("Раунды", { exact: true }).fill("9");
  await expect(page.getByRole("button", { name: "Создать связку", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^День 2/ })).toBeDisabled();
  await page.getByRole("button", { name: "Отменить настройку связки", exact: true }).click();
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^День 2/ })).toBeEnabled();
});

test("incomplete basic numbers stay visible through reload without enabling structural edits", async ({ page }) => {
  await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  await row.getByLabel("Подходы", { exact: true }).fill("");
  await expect(row.getByLabel("Подходы", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Создать суперсет", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await page.reload();
  await expect(row.getByLabel("Подходы", { exact: true })).toHaveValue("");
  await row.getByLabel("Подходы", { exact: true }).fill("8");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeEnabled();
});

test("reorder, compatible replacement and removal keep group membership atomic", async ({ page }) => {
  const writes = await open(page);
  await page.getByRole("button", { name: "Создать суперсет", exact: true }).click();
  for (const name of names.slice(0, 2)) await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByRole("button", { name: "Создать связку", exact: true }).click();
  await expect(page.getByRole("button", { name: `Убрать ${names[0]}`, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: `Поднять ${names[1]}`, exact: true }).click();
  await expect(page.getByRole("region", { name: "Связка Суперсет", exact: true })).toContainText(`${names[1]} → ${names[0]}`);
  await page.getByRole("region", { name: names[0], exact: true }).getByRole("button", { name: "Заменить", exact: true }).click();
  await page.getByRole("button", { name: "Весь каталог", exact: true }).click();
  await page.getByRole("searchbox", { name: "Поиск замены", exact: true }).fill(names[3]);
  await page.getByRole("button", { name: `Выбрать ${names[3]}`, exact: true }).click();
  await expect(page.getByRole("region", { name: "Связка Суперсет", exact: true })).toContainText(`${names[1]} → ${names[3]}`);
  await page.getByRole("button", { name: "Распустить связку", exact: true }).click();
  await page.getByRole("button", { name: `Убрать ${names[1]}`, exact: true }).click();
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].groups).toEqual([]);
  expect(writes[0].days[0].exercises.map(row => row.exercise_id)).toEqual([ids[3], ids[2]]);
});

test("twelve-exercise limit and eight sets are enforced without losing the last row", async ({ page }) => {
  const writes = await open(page, 11);
  await page.getByRole("searchbox", { name: "Добавить упражнение", exact: true }).fill(names[11]);
  await page.getByRole("button", { name: `Добавить ${names[11]}`, exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Добавить упражнение", exact: true })).toHaveCount(0);
  const row = page.getByRole("region", { name: names[11], exact: true });
  await row.getByLabel("Подходы", { exact: true }).fill("9");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await row.getByLabel("Подходы", { exact: true }).fill("8");
  await row.getByLabel("Отдых, с", { exact: true }).fill("300");
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises).toHaveLength(12);
  expect(writes[0].days[0].exercises[11]).toMatchObject({ sets: 8, rest_sec: 300 });
});

for (const restored of ["", "2"]) test(`restored grouped count ${restored || "blank"} remains repairable`, async ({ page }) => {
  await open(page);
  await page.evaluate(({ owner, ids, restored }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    const draft = JSON.parse(localStorage.getItem(key)!);
    draft.days[0].groups = [{ id: "33333333-3333-4333-8333-333333333333", kind: "superset", exercise_ids: ids.slice(0, 2), rounds: 3, transition_sec: 0, round_rest_sec: 90 }];
    draft.days[0].exercises[0].sets = restored;
    localStorage.setItem(key, JSON.stringify(draft));
  }, { owner, ids, restored });
  await page.reload();
  const field = page.getByRole("region", { name: names[0], exact: true }).getByLabel("Подходы", { exact: true });
  await expect(field).toHaveValue(restored);
  await expect(field).toBeEnabled();
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await field.fill("3");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeEnabled();
});

test("invalid drop topology stays editable and blocks saving until corrected", async ({ page }) => {
  await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  await row.locator("summary").click();
  await row.getByLabel(`Способ выполнения ${names[0]}`, { exact: true }).selectOption("drop");
  await row.getByLabel(`Вес части 1 ${names[0]}`, { exact: true }).fill("10");
  await row.getByLabel(`Вес части 2 ${names[0]}`, { exact: true }).fill("15");
  await expect(row.getByLabel(`Вес части 2 ${names[0]}`, { exact: true })).toHaveValue("15");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await page.reload();
  await row.locator("summary").click();
  await expect(row.getByLabel(`Вес части 2 ${names[0]}`, { exact: true })).toHaveValue("15");
  await row.getByLabel(`Вес части 2 ${names[0]}`, { exact: true }).fill("8");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeEnabled();
});

test("recovered Decimal targets, weight mode and methods survive unrelated reorder in the sole POST", async ({ page }) => {
  const writes = await open(page);
  let customizationWrites = 0;
  await page.route("**/workouts/customizations**", route => { customizationWrites++; return route.fulfill({ status: 500 }); });
  await page.evaluate(({ owner }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    const draft = JSON.parse(localStorage.getItem(key)!);
    Object.assign(draft.days[0].exercises[0], { target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: "12.50" }, weight_mode: "per_hand",
      set_methods: [{ kind: "cluster", set_number: 3, parts: [{ target_reps: 4, target_weight: "12.50", pause_after_sec: 20 }, { target_reps: 4, target_weight: "12.50", pause_after_sec: 0 }] }] });
    localStorage.setItem(key, JSON.stringify(draft));
  }, { owner });
  await page.reload();
  await page.getByRole("button", { name: `Опустить ${names[0]}`, exact: true }).click();
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[1]).toMatchObject({ exercise_id: ids[0], rest_sec: 0, weight_mode: "per_hand", target: { target_weight: 12.5 }, set_methods: [{ parts: [{ target_weight: 12.5 }, { target_weight: 12.5 }] }] });
  expect(customizationWrites).toBe(0);
});

test("owner switch drops pending editor and ignores the prior owner's accepted save response", async ({ page }) => {
  await open(page);
  let release!: () => void;
  let posted = false;
  await page.route("**/programs/mine", async route => {
    posted = true;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 201, json: { id: "44444444-4444-4444-8444-444444444444", ...route.request().postDataJSON() } });
  });
  const second = "55555555-5555-4555-8555-555555555555";
  await page.evaluate(({ owner, second }) => {
    const draft = JSON.parse(localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`)!);
    draft.name = "План второго аккаунта";
    localStorage.setItem(`fitness_form_draft:v1:${second}:personal-program`, JSON.stringify(draft));
  }, { owner, second });
  await page.getByRole("button", { name: "Создать суперсет", exact: true }).click();
  await page.evaluate(second => window.dispatchEvent(new CustomEvent("fixture-owner", { detail: second })), second);
  await expect(page.getByRole("region", { name: "Настройка связки", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeEnabled();
  await page.evaluate(owner => window.dispatchEvent(new CustomEvent("fixture-owner", { detail: owner })), owner);
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => posted).toBe(true);
  await page.evaluate(second => window.dispatchEvent(new CustomEvent("fixture-owner", { detail: second })), second);
  release();
  await expect(page.getByRole("heading", { name: "План второго аккаунта", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/personal-program.html$/);
  await expect.poll(() => page.evaluate(second => localStorage.getItem(`fitness_form_draft:v1:${second}:personal-program`), second)).toContain("План второго аккаунта");
  await expect.poll(() => page.evaluate(owner => localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`), owner)).toBeNull();
});

test("preparation retains its twenty-set and twenty-round defaults", async ({ page }) => {
  await installMethodApi(page);
  await page.goto("/e2e/fixtures/workout-composer.html");
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  await page.getByLabel("Подходы", { exact: true }).first().fill("20");
  await expect(page.getByLabel("Подходы", { exact: true }).first()).toHaveValue("20");
  await page.getByRole("button", { name: "Создать суперсет", exact: true }).click();
  await page.getByRole("checkbox", { name: "Сгибания со штангой", exact: true }).check();
  await page.getByRole("checkbox", { name: "Разгибания на блоке", exact: true }).check();
  await page.getByLabel("Раунды", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Создать связку", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сохранить подготовку", exact: true })).toBeEnabled();
  await expect(page.getByText("Суперсет · 20 раундов", { exact: true })).toBeVisible();
});

test("late accepted save preserves a newer draft after switching back to the original owner", async ({ page }) => {
  await open(page);
  let release!: () => void;
  let posted = false;
  await page.route("**/programs/mine", async route => {
    posted = true;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 201, json: { id: "44444444-4444-4444-8444-444444444444", ...route.request().postDataJSON() } });
  });
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => posted).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture-owner", { detail: "55555555-5555-4555-8555-555555555555" })));
  await expect(page.getByLabel("Название программы", { exact: true })).toHaveValue("");
  await page.evaluate(owner => window.dispatchEvent(new CustomEvent("fixture-owner", { detail: owner })), owner);
  await page.getByLabel("Название дня", { exact: true }).fill("Более новый день");
  release();
  await expect(page.getByLabel("Название дня", { exact: true })).toHaveValue("Более новый день");
  await expect.poll(() => page.evaluate(owner => localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`), owner)).toContain("Более новый день");
  await expect(page).toHaveURL(/personal-program.html$/);
});

for (const theme of ["light", "dark"]) for (const width of [320, 393, 1440]) test(`composer fits ${width} ${theme} with accessible fields and group focus`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 320 ? 480 : 852 });
  await page.addInitScript(theme => localStorage.setItem("fitness_theme_preference", theme), theme);
  await open(page);
  await page.getByRole("button", { name: "Создать суперсет", exact: true }).click();
  await expect(page.getByLabel("Вид связки", { exact: true })).toBeFocused();
  for (const name of names.slice(0, 2)) await page.getByRole("checkbox", { name, exact: true }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const field of await page.locator('input:not([type="checkbox"]), select').all()) expect(await field.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  for (const name of ["Создать связку", "Отменить настройку связки"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const axe = await new AxeBuilder({ page }).include('section[aria-label="Настройка связки"]').withRules(["color-contrast", "label", "button-name"]).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`composer-group-${width}-${theme}.png`), fullPage: true });
  await page.getByRole("button", { name: "Создать связку", exact: true }).click();
  await page.getByRole("region", { name: names[0], exact: true }).locator("summary").click();
  await page.getByLabel(`Способ выполнения ${names[0]}`, { exact: true }).selectOption("cluster");
  await page.getByLabel(`Рабочий вес ${names[0]}`, { exact: true }).fill("12.5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`composer-method-${width}-${theme}.png`), fullPage: true });
});
