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

test("numeric proposal keeps blank pauses and pending membership through reload", async ({ page }) => {
  const writes = await open(page);
  await page.getByRole("button", { name: "Создать суперсет", exact: true }).click();
  for (const name of names.slice(0, 2)) await page.getByRole("checkbox", { name, exact: true }).check();
  const transition = page.getByLabel("Переход между упражнениями, с", { exact: true });
  await transition.fill("");
  await expect(transition).toHaveValue("");
  await transition.blur();
  await expect(transition).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Создать связку", exact: true })).toBeDisabled();
  await page.reload();
  await expect(transition).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: names[0], exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: /^День 2/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0);
  await transition.fill("0");
  await page.getByLabel("Отдых после раунда, с", { exact: true }).fill("");
  await expect(page.getByRole("button", { name: "Создать связку", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Отменить настройку связки", exact: true }).click();
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeEnabled();
});

for (const count of [1, 2]) test(`recovery opens a pending proposal on another retained day with ${count} visible days`, async ({ page }) => {
  await open(page);
  await page.evaluate(({ owner, ids, count }) => {
    const key = `fitness_form_draft:v1:${owner}:personal-program`;
    const draft = JSON.parse(localStorage.getItem(key)!);
    draft.dayCount = count; draft.activeDay = 0; draft.step = "setup";
    draft.days[1].groupProposal = { id: "77777777-7777-4777-8777-777777777777", kind: "superset", exercise_ids: ids.slice(0, 2), isNew: true, rounds: "", transition_sec: "0", round_rest_sec: "90" };
    localStorage.setItem(key, JSON.stringify(draft));
  }, { owner, ids, count });
  await page.reload();
  await expect(page.getByLabel("Название дня")).toHaveValue("День 2");
  await expect(page.getByLabel("Раунды", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Отменить настройку связки", exact: true }).click();
  await expect(page.getByRole("button", { name: /^День 1/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeEnabled();
});

test("method raw pause and comma weight stay repairable through day switch and reload", async ({ page }) => {
  const writes = await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  await row.locator("summary").click();
  await row.getByLabel(`Способ выполнения ${names[0]}`, { exact: true }).selectOption("cluster");
  const pause = row.getByLabel(`Пауза после части 1 ${names[0]}`, { exact: true });
  await pause.fill("");
  await expect(pause).toHaveValue("");
  await row.getByLabel(`Рабочий вес ${names[0]}`, { exact: true }).fill("12,50");
  await expect(row.getByLabel(`Рабочий вес ${names[0]}`, { exact: true })).toHaveValue("12,50");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^День 2/ }).click();
  await page.getByRole("button", { name: /^День 1/ }).click();
  await page.reload();
  await row.locator("summary").click();
  await expect(pause).toHaveValue("");
  await expect(pause).toBeEnabled();
  await expect(row.getByLabel(`Рабочий вес ${names[0]}`, { exact: true })).toHaveValue("12,50");
  expect(writes).toHaveLength(0);
  await pause.fill("0");
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[0].set_methods![0].parts.map(part => part.target_weight)).toEqual([12.5, 12.5, 12.5]);
});

test("method fields retain invalid text, show blur errors and repair without stale submissions", async ({ page }) => {
  const writes = await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  await row.locator("summary").click();
  await row.getByLabel(`Способ выполнения ${names[0]}`, { exact: true }).selectOption("cluster");
  const cases = [
    { label: `Повторы части 1 ${names[0]}`, bad: ["", "-", "-1", "1.5", "100001", "1,"], good: "4" },
    { label: `Пауза после части 1 ${names[0]}`, bad: ["", "-1", "601", "1.5", "1,"], good: "0" },
    { label: `Рабочий вес ${names[0]}`, bad: ["-", "-1", "0", "10001", "12,", "12.", "1e1", "0xc", " 12 "], good: "" },
  ];
  for (const { label, bad, good } of cases) {
    const field = row.getByLabel(label, { exact: true });
    for (const value of bad) {
      await field.fill(value); await field.blur();
      await expect(field).toHaveValue(value);
      await expect(field).toHaveAttribute("aria-invalid", "true");
      const errorId = await field.getAttribute("aria-describedby");
      expect(errorId).toBeTruthy();
      await expect(page.locator(`[id="${errorId}"]`)).toBeVisible();
      await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
      expect(writes).toHaveLength(0);
    }
    await field.fill(good);
    await expect(field).toHaveAttribute("aria-invalid", "false");
  }
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[0].set_methods![0].parts.map(part => part.target_weight)).toEqual([null, null, null]);
});

test("last all and specific method edits isolate buffers and prune only removed parts and slots", async ({ page }) => {
  const writes = await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  await row.locator("summary").click();
  const selection = row.getByLabel(`Для подходов ${names[0]}`, { exact: true });
  const kind = row.getByLabel(`Способ выполнения ${names[0]}`, { exact: true });
  const reps = row.getByLabel(`Повторы части 1 ${names[0]}`, { exact: true });
  await selection.selectOption("all"); await kind.selectOption("cluster");
  await selection.selectOption("1"); await reps.fill("");
  await selection.selectOption("last"); await reps.fill("-");
  await page.getByRole("button", { name: `Опустить ${names[0]}`, exact: true }).click();
  await selection.selectOption("all");
  await expect(reps).toHaveAttribute("placeholder", "Разные значения");
  await row.getByLabel(`Пауза после части 1 ${names[0]}`, { exact: true }).fill("0");
  await selection.selectOption("1"); await expect(reps).toHaveValue("");
  await selection.selectOption("last"); await expect(reps).toHaveValue("-"); await reps.fill("7");
  await selection.selectOption("1"); await reps.fill("5");
  await row.getByRole("button", { name: "Добавить часть", exact: true }).click();
  await row.getByLabel(`Повторы части 4 ${names[0]}`, { exact: true }).fill("-");
  await row.getByLabel(`Пауза после части 3 ${names[0]}`, { exact: true }).fill("");
  await row.getByRole("button", { name: "Убрать последнюю часть", exact: true }).click();
  await expect(row.getByLabel(`Пауза после части 3 ${names[0]}`, { exact: true })).toHaveCount(0);
  await selection.selectOption("last"); await reps.fill("-");
  await row.getByLabel("Подходы", { exact: true }).fill("2");
  await page.reload(); await row.locator("summary").click();
  await selection.selectOption("1"); await expect(reps).toHaveValue("5");
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  const methods = writes[0].days[0].exercises.find(item => item.exercise_id === ids[0])!.set_methods!;
  expect(methods.map(method => method.set_number)).toEqual([1, 2]);
  expect(methods.map(method => method.parts[0].target_reps)).toEqual([5, 4]);
  expect(methods[0].parts.map(part => part.pause_after_sec)).toEqual([0, 20, 0]);
});

for (const context of ["personal", "preparation"] as const) test(`numbered method selection follows removed approaches in ${context}`, async ({ page }) => {
  if (context === "personal") await open(page);
  else {
    await installMethodApi(page);
    await page.goto("/e2e/fixtures/workout-composer.html");
    await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  }
  const name = context === "personal" ? names[0] : "Сгибания со штангой";
  const row = page.getByRole("region", { name, exact: true });
  await row.locator("summary").click();
  const selection = row.getByLabel(`Для подходов ${name}`, { exact: true });
  const kind = row.getByLabel(`Способ выполнения ${name}`, { exact: true });
  const reps = row.getByLabel(`Повторы части 1 ${name}`, { exact: true });
  const weight = row.getByLabel(`Рабочий вес ${name}`, { exact: true });
  const count = row.getByLabel("Подходы", { exact: true });
  await selection.selectOption("all"); await kind.selectOption("cluster");
  await selection.selectOption("1"); await reps.fill("");
  await selection.selectOption("2"); await weight.fill("12,50");
  await selection.selectOption("3"); await reps.fill("-");
  if (context === "personal") {
    await count.fill(""); await count.fill("3");
    await expect(selection).toHaveValue("3"); await expect(reps).toHaveValue("-");
    await count.fill("");
  }
  await count.fill("2");
  await expect(selection).toHaveValue("2");
  await expect(selection.locator("option:checked")).toHaveText("Подход 2");
  await expect(weight).toHaveValue("12,50");
  await reps.fill("7");
  await count.fill("3");
  await expect(selection).toHaveValue("2");
  await expect(reps).toHaveValue("7");
  await selection.selectOption("1"); await expect(reps).toHaveValue(""); await reps.fill("5");
  await selection.selectOption("3"); await expect(kind).toHaveValue("standard");
  await selection.selectOption("last"); await count.fill("2");
  await expect(selection).toHaveValue("last"); await expect(reps).toHaveValue("7");
  await selection.selectOption("all"); await count.fill("3");
  await expect(selection).toHaveValue("all"); await expect(kind).toHaveValue("mixed");
  await count.fill("2"); await expect(selection).toHaveValue("all");
  await expect(reps).toHaveAttribute("placeholder", "Разные значения");
  await selection.selectOption("1"); await expect(reps).toHaveValue("5");
  await selection.selectOption("2"); await expect(reps).toHaveValue("7");
  await expect(weight).toHaveValue("12,50");
});

test("blank existing group proposal preserves applied rounds and methods until explicit apply", async ({ page }) => {
  const writes = await open(page);
  const row = page.getByRole("region", { name: names[0], exact: true });
  await row.locator("summary").click();
  await row.getByLabel(`Для подходов ${names[0]}`, { exact: true }).selectOption("all");
  await row.getByLabel(`Способ выполнения ${names[0]}`, { exact: true }).selectOption("cluster");
  await page.getByRole("button", { name: "Создать суперсет", exact: true }).click();
  for (const name of names.slice(0, 2)) await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByRole("button", { name: "Создать связку", exact: true }).click();
  await page.getByRole("button", { name: "Изменить связку", exact: true }).click();
  const rounds = page.getByLabel("Раунды", { exact: true });
  for (const value of ["", "-1", "1.5", "9", "1,"]) {
    await rounds.fill(value); await rounds.blur();
    await expect(rounds).toHaveValue(value);
    await expect(page.getByRole("button", { name: "Сохранить связку", exact: true })).toBeDisabled();
  }
  await rounds.fill("2");
  await page.getByLabel("Отдых после раунда, с", { exact: true }).fill("");
  await page.reload();
  await expect(page.getByText("Суперсет · 3 раунда", { exact: true })).toBeVisible();
  const stored = await page.evaluate(owner => JSON.parse(localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`)!).days[0], owner);
  expect(stored.exercises[0].set_methods).toHaveLength(3);
  expect(stored.groups[0].rounds).toBe(3);
  expect(writes).toHaveLength(0);
  await page.getByLabel("Отдых после раунда, с", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Сохранить связку", exact: true }).click();
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[0].set_methods).toHaveLength(2);
  expect(writes[0].days[0].groups![0]).toMatchObject({ rounds: 2, round_rest_sec: 0 });
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
  await expect(page.getByRole("region", { name: "Настройка связки", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Отменить настройку связки", exact: true }).click();
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
