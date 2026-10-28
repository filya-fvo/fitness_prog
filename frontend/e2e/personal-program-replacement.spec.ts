import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { PersonalProgramInput } from "../src/api/programs";
import type { PersonalProgramDraft } from "../src/features/workout/pages/personalProgramDraft";

const owner = "22222222-2222-4222-8222-222222222222";
const key = `fitness_form_draft:v1:${owner}:personal-program`;
const ids = [1, 2, 3, 4, 5, 6].map(n => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`);
const names = ["Жим гантелей", "Отжимания", "Удержание", "Планка", "Подтягивания", "Жим штанги"];
const catalog = ids.map((id, i) => ({ id, name_ru: names[i], muscle_group: "Грудь", equipment: i === 0 ? "гантели" : i === 5 ? "штанга" : "свой вес",
  tags: [`load:${i === 1 || i === 4 ? "reps_only" : i === 2 || i === 3 ? "timed" : "weight_reps"}`], weight_rule: i === 0 ? "per_hand" : "total", difficulty: 1, media_source: "none" }));
function draft(): PersonalProgramDraft {
  return { name: "План с заменой", location: "gym", progression: "phased", durationWeeks: "8", dayCount: 2, activeDay: 0, step: "days", days: [
    { name: "День 1", exercises: [
      { exercise_id: ids[0], sets: "03", rest_sec: "060", reps: "8-12", weight_mode: "per_hand", target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 12.5 },
        set_methods: [{ set_number: 3, kind: "cluster", parts: [{ target_reps: 4, target_weight: 12.5, pause_after_sec: 20 }, { target_reps: 4, target_weight: 12.5, pause_after_sec: 0 }] }] },
      { exercise_id: ids[1], sets: "3", rest_sec: "60", reps: "8-12", target: { kind: "reps_only", reps_min: 8, reps_max: 12 } },
      { exercise_id: ids[2], sets: "2", rest_sec: "0", reps: "45с", target: { kind: "timed", duration_sec: 45 } },
    ], groups: [{ id: "33333333-3333-4333-8333-333333333333", kind: "superset", exercise_ids: ids.slice(0, 2), rounds: 3, transition_sec: 0, round_rest_sec: 60 }],
    raw: { [`${ids[0]}/target/reps_min`]: "010", [`${ids[0]}/target/reps_max`]: "014", [`${ids[0]}/target/target_weight`]: "12,50", [`${ids[0]}/method/3/part/1/target_reps`]: "04", [`${ids[1]}/target/reps_min`]: "08", [`${ids[2]}/target/duration_sec`]: "01,500" }, timeUnits: { [ids[2]]: "minutes" } },
    { name: "День 2", exercises: [{ exercise_id: ids[0], sets: "1", rest_sec: "0", reps: "5", target: { kind: "weight_reps", reps_min: 5, reps_max: 5, target_weight: null } }], raw: { [`${ids[0]}/target/reps_min`]: "005" } },
  ] };
}
async function stored(page: Page): Promise<PersonalProgramDraft> { return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key); }
async function open(page: Page, value = draft()) {
  const writes: PersonalProgramInput[] = [];
  await page.route(/\/exercises(?:\?|$)/, route => route.fulfill({ json: { items: catalog, total: catalog.length, page: 1, page_size: 200 } }));
  await page.route("**/programs/mine", route => { writes.push(route.request().postDataJSON()); return route.fulfill({ status: 500, json: { detail: "Synthetic capture" } }); });
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key, value });
  await page.goto("/e2e/fixtures/personal-program.html");
  await expect(page.getByLabel("Название дня")).toHaveValue("День 1");
  return writes;
}
async function choose(page: Page, name: string, source = names[0]) {
  await page.getByRole("region", { name: source, exact: true }).getByRole("button", { name: "Заменить", exact: true }).click();
  await page.getByRole("button", { name: "Весь каталог", exact: true }).click();
  await page.getByRole("searchbox", { name: "Поиск замены", exact: true }).fill(name);
  await expect(page.getByRole("button", { name: `Выбрать ${name}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Выбрать ${name}`, exact: true }).click();
}
for (const targetIndex of [3, 4]) test(`explicit replacement reset to ${targetIndex === 3 ? "timed" : "reps-only"} preserves the remaining draft`, async ({ page }) => {
  const writes = await open(page);
  await choose(page, names[targetIndex]);
  const confirmation = page.getByRole("region", { name: "Сброс настроек упражнения", exact: true });
  await expect(confirmation).toContainText(/цел.*метод/i);
  await expect(confirmation).toContainText(names[targetIndex]);
  await expect(page.getByRole("region", { name: names[0], exact: true })).toBeVisible();
  const before = await stored(page);
  await confirmation.getByRole("button", { name: "Отмена", exact: true }).click();
  expect(await stored(page)).toEqual(before);
  await page.getByRole("button", { name: `Выбрать ${names[targetIndex]}`, exact: true }).click();
  await confirmation.getByRole("button", { name: "Сбросить и заменить", exact: true }).click();
  await expect(page.getByRole("region", { name: names[targetIndex], exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page)).days[0].exercises[0].exercise_id).toBe(ids[targetIndex]);
  const after = await stored(page);
  expect(after.days[0].exercises[0]).toEqual({ exercise_id: ids[targetIndex], sets: "03", rest_sec: "060", reps: targetIndex === 3 ? "45с" : "8-12", target: targetIndex === 3 ? { kind: "timed", duration_sec: 45 } : { kind: "reps_only", reps_min: 8, reps_max: 12 } });
  expect(after.days[0].exercises.slice(1)).toEqual(before.days[0].exercises.slice(1));
  expect(after.days[1]).toEqual(before.days[1]);
  expect(after.days[0].raw).toEqual({ [`${ids[1]}/target/reps_min`]: "08", [`${ids[2]}/target/duration_sec`]: "01,500" });
  expect(after.days[0].timeUnits).toEqual(before.days[0].timeUnits);
  expect(after.days[0].groups).toEqual(before.days[0].groups?.map(group => ({ ...group, exercise_ids: [ids[targetIndex], ids[1]] })));
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[0]).toEqual({ exercise_id: ids[targetIndex], sets: 3, rest_sec: 60, reps: targetIndex === 3 ? "45с" : "8-12", target: targetIndex === 3 ? { kind: "timed", duration_sec: 45 } : { kind: "reps_only", reps_min: 8, reps_max: 12 } });
  expect(writes[0].days[0].exercises[2].target).toEqual({ kind: "timed", duration_sec: 90 });
});

test("compatible replacement keeps configured range, weight, methods and raw owners", async ({ page }) => {
  const writes = await open(page);
  const before = await stored(page);
  await choose(page, names[5]);
  await expect(page.getByRole("region", { name: names[5], exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Сброс настроек упражнения", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).days[0].exercises[0].exercise_id).toBe(ids[5]);
  const after = await stored(page);
  expect(after.days[0].exercises[0]).toEqual({ ...before.days[0].exercises[0], exercise_id: ids[5] });
  expect(after.days[0].raw).toEqual(Object.fromEntries(Object.entries(before.days[0].raw!).map(([key, value]) => [key.replace(ids[0], ids[5]), value])));
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].days[0].exercises[0]).toMatchObject({ target: { kind: "weight_reps", reps_min: 10, reps_max: 14, target_weight: 12.5 }, weight_mode: "per_hand", set_methods: [{ set_number: 3, kind: "cluster", parts: [{ target_reps: 4, target_weight: 12.5, pause_after_sec: 20 }, { target_reps: 4, target_weight: 12.5, pause_after_sec: 0 }] }] });
});

test("explicit reset repairs only the source unfinished goal", async ({ page }) => {
  const value = draft(); value.days[0].raw![`${ids[0]}/target/reps_min`] = "";
  await open(page, value);
  await choose(page, names[3]);
  await page.getByRole("button", { name: "Сбросить и заменить", exact: true }).click();
  await expect(page.getByRole("region", { name: names[3], exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeEnabled();
});

for (const incompatible of [false, true]) test(`unrelated unfinished goal gives addressed repair for ${incompatible ? "reset" : "compatible"} replacement`, async ({ page }) => {
  const value = draft(); value.days[0].raw![`${ids[1]}/target/reps_min`] = "";
  const writes = await open(page, value);
  const before = await stored(page);
  await choose(page, names[incompatible ? 3 : 5]);
  if (incompatible) await page.getByRole("button", { name: "Сбросить и заменить", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Отжимания.*[Ии]справ/ })).toBeVisible();
  expect(await stored(page)).toEqual(before);
  expect(writes).toHaveLength(0);
  await expect(page.getByRole("region", { name: names[0], exact: true })).toBeVisible();
});

test("pending reset stays with its day and source and preserves intervening edits", async ({ page }) => {
  await open(page);
  await choose(page, names[3]);
  await page.getByRole("region", { name: names[2], exact: true }).getByLabel("Отдых, с", { exact: true }).fill("77");
  await page.getByRole("button", { name: "Сбросить и заменить", exact: true }).click();
  await expect.poll(async () => (await stored(page)).days[0].exercises[2].rest_sec).toBe("77");
  await choose(page, names[5], names[3]);
  await expect(page.getByRole("region", { name: "Сброс настроек упражнения", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "День 2 · 1", exact: true }).click();
  await expect(page.getByRole("region", { name: "Сброс настроек упражнения", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Сбросить и заменить", exact: true })).toHaveCount(0);
  expect((await stored(page)).days[1].exercises[0].exercise_id).toBe(ids[0]);
  await page.getByRole("button", { name: "День 1 · 3", exact: true }).click();
  await choose(page, names[5], names[3]);
  await page.getByRole("region", { name: names[1], exact: true }).getByRole("button", { name: "Заменить", exact: true }).click();
  await expect(page.getByRole("region", { name: "Сброс настроек упражнения", exact: true })).toHaveCount(0);
});

test("legacy numeric reps require confirmation before a different catalog load", async ({ page }) => {
  const value = draft();
  delete value.days[0].exercises[0].target;
  delete value.days[0].exercises[0].set_methods;
  value.days[0].exercises[0].reps = "8";
  value.days[0].raw = Object.fromEntries(Object.entries(value.days[0].raw!).filter(([key]) => !key.startsWith(`${ids[0]}/`)));
  await open(page, value);
  await choose(page, names[3]);
  const confirmation = page.getByRole("region", { name: "Сброс настроек упражнения", exact: true });
  await expect(confirmation).toBeVisible();
  await expect(page.getByRole("region", { name: names[0], exact: true }).getByLabel("Повторы", { exact: true })).toHaveValue("8");
  await confirmation.getByRole("button", { name: "Сбросить и заменить", exact: true }).click();
  await expect(page.getByRole("region", { name: names[3], exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page)).days[0].exercises[0].target).toEqual({ kind: "timed", duration_sec: 45 });
});

test("reset confirmation stays readable and keyboard reachable at narrow and desktop widths", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "chromium", "Representative desktop browser viewport check");
  await open(page);
  await choose(page, names[3]);
  const confirmation = page.getByRole("region", { name: "Сброс настроек упражнения", exact: true });
  await expect(confirmation).toBeFocused();
  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await confirmation.scrollIntoViewIfNeeded();
    await expect(confirmation.getByRole("button", { name: "Сбросить и заменить", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await confirmation.screenshot({ path: testInfo.outputPath(`reset-${width}.png`) });
  }
  const accessibility = await new AxeBuilder({ page }).include('[aria-label="Сброс настроек упражнения"]').analyze();
  expect(accessibility.violations).toEqual([]);
});
