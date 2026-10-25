import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
const OWNER = "22222222-2222-4222-8222-222222222222";
const EXERCISE = "11111111-1111-4111-8111-111111111111";
async function openBuilder(page: Page) {
  await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 200 } }));
  await page.addInitScript(({ owner, exercise }) => {
    if (!localStorage.getItem(`fitness_form_draft:v1:${owner}:personal-program`)) localStorage.setItem(`fitness_form_draft:v1:${owner}:personal-program`, JSON.stringify({
      name: "Проверка чисел", location: "gym", progression: "linear", durationWeeks: 8,
      days: [1, 2].map((day) => ({ name: `День ${day}`, exercises: [{ exercise_id: exercise, sets: 3, reps: "8-12", rest_sec: 60 }] })),
      dayCount: 2, activeDay: 0, step: "days",
    }));
  }, { owner: OWNER, exercise: EXERCISE });
  await page.goto("/e2e/fixtures/personal-program.html");
  await expect(page.getByLabel("Отдых, с", { exact: true })).toHaveValue("60");
}
test("rest can remain empty while editing", async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel("Отдых, с", { exact: true }).fill("");
  await expect(page.getByLabel("Отдых, с", { exact: true })).toHaveValue("");
});
test("explicit zero survives editing", async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel("Отдых, с", { exact: true }).fill("0");
  await expect(page.getByLabel("Отдых, с", { exact: true })).toHaveValue("0");
});

test("invalid numbers block saving; valid zero reaches the API", async ({ page }) => {
  await openBuilder(page);
  let payload: unknown;
  await page.route("**/programs/mine", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 500, json: { detail: "fixture stops after capture" } });
  });
  for (const [label, invalids, valid] of [
    ["Отдых, с", ["", "-1", "301", "1.5"], "0"],
    ["Подходы", ["", "0", "9", "2.5"], "8"],
  ] as const) {
    const input = page.getByLabel(label, { exact: true });
    for (const invalid of invalids) {
      await input.fill(invalid);
      await expect(input).toHaveValue(invalid);
      await input.blur();
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(page.locator(`[id="${await input.getAttribute("aria-describedby")}"]`)).toContainText(label);
      await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
      expect(payload).toBeUndefined();
    }
    await input.fill(valid);
  }
  await page.getByRole("button", { name: "Создать программу", exact: true }).click();
  await expect.poll(() => payload).toMatchObject({ duration_weeks: 8, days: [{ exercises: [{ sets: 8, rest_sec: 0 }] }, { exercises: [{ sets: 3, rest_sec: 60 }] }] });
});

test("invalid weeks block both ways to days and remain freely editable", async ({ page }) => {
  await openBuilder(page);
  await page.getByRole("button", { name: "1 · Основа", exact: true }).click();
  const weeks = page.getByLabel("Длительность, недель", { exact: true });
  for (const invalid of ["", "0", "53", "1.5"]) {
    await weeks.fill(invalid);
    await expect(weeks).toHaveValue(invalid);
    for (const action of ["Выбрать упражнения →", "2 · Дни"]) {
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(weeks).toBeVisible();
    }
    await expect(weeks).toHaveAttribute("aria-invalid", "true");
  }
  await weeks.fill("52");
  await expect(page.getByRole("button", { name: "Увеличить: Длительность, недель", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Выбрать упражнения →", exact: true }).click();
  await expect(page.getByLabel("Отдых, с", { exact: true })).toBeVisible();
});

test("invalid string survives day switch and reload; removing field removes its error", async ({ page }) => {
  await openBuilder(page);
  const rest = page.getByLabel("Отдых, с", { exact: true });
  await rest.fill("");
  await page.getByRole("button", { name: /^День 2/ }).click();
  await expect(rest).toHaveValue("60");
  await expect(rest).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Исправить числа: День 1", exact: true }).click();
  await expect(rest).toHaveValue("");
  await page.reload();
  await expect(rest).toHaveValue("");
  await page.getByRole("button", { name: "Убрать упражнение", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const theme of ["light", "dark"]) for (const width of [320, 393, 1440]) {
  test(`numeric controls fit ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 480 : 852 });
    await page.addInitScript((preference) => localStorage.setItem("fitness_theme_preference", preference), theme);
    await openBuilder(page);
    const rest = page.getByLabel("Отдых, с", { exact: true });
    for (const preset of ["Без отдыха", "30", "60", "90", "120"]) {
      await page.getByRole("button", { name: preset, exact: true }).click();
      await expect(rest).toHaveValue(preset === "Без отдыха" ? "0" : preset);
    }
    await rest.fill("120");
    await page.getByRole("button", { name: "Уменьшить: Отдых, с", exact: true }).click();
    await expect(rest).toHaveValue("119");
    await page.getByRole("button", { name: "Увеличить: Отдых, с", exact: true }).click();
    await expect(rest).toHaveValue("120");
    await rest.fill("300");
    await expect(page.getByRole("button", { name: "Увеличить: Отдых, с", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Без отдыха", exact: true }).click();
    await expect(page.getByRole("button", { name: "Уменьшить: Отдых, с", exact: true })).toBeDisabled();
    for (const label of ["Подходы", "Отдых, с"]) {
      const input = page.getByLabel(label, { exact: true });
      expect(await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      for (const prefix of ["Уменьшить", "Увеличить"]) {
        const box = await page.getByRole("button", { name: `${prefix}: ${label}`, exact: true }).boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
    if (width === 1440) {
      const setsBox = await page.getByLabel("Подходы", { exact: true }).boundingBox();
      const restBox = await rest.boundingBox();
      expect(Math.abs(setsBox!.y - restBox!.y)).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`numbers-${width}-${theme}.png`), fullPage: true });
  });
}

test("weeks and sets drafts survive reload without borrowing another owner draft", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_form_draft:v1:other-owner:personal-program", JSON.stringify({ name: "Чужой план", durationWeeks: "52" })));
  await openBuilder(page);
  const sets = page.getByLabel("Подходы", { exact: true });
  await sets.fill("");
  await page.getByRole("button", { name: "1 · Основа", exact: true }).click();
  const weeks = page.getByLabel("Длительность, недель", { exact: true });
  await weeks.fill("");
  await page.reload();
  await expect(weeks).toHaveValue("");
  await expect(page.getByLabel("Название программы", { exact: true })).toHaveValue("Проверка чисел");
  await weeks.fill("1");
  await expect(page.getByRole("button", { name: "Уменьшить: Длительность, недель", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Выбрать упражнения →", exact: true }).click();
  await expect(sets).toHaveValue("");
  await sets.fill("1");
  await expect(page.getByRole("button", { name: "Уменьшить: Подходы", exact: true })).toBeDisabled();
  await sets.fill("8");
  await expect(page.getByRole("button", { name: "Увеличить: Подходы", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("fitness_form_draft:v1:other-owner:personal-program"))).toContain("Чужой план");
});

for (const theme of ["light", "dark"]) {
  test(`numeric errors wait for blur and have accessible contrast in ${theme}`, async ({ page }) => {
    await page.addInitScript((preference) => localStorage.setItem("fitness_theme_preference", preference), theme);
    await openBuilder(page);
    const rest = page.getByLabel("Отдых, с", { exact: true });
    await rest.fill("");
    await expect(rest).toHaveValue("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Создать программу", exact: true })).toBeDisabled();
    await rest.blur();
    const error = page.getByRole("alert");
    await expect(error).toBeVisible();
    await expect(error).toContainText("Отдых, с: введите целое число от 0 до 300.");
    await expect(rest).toHaveAttribute("aria-describedby", (await error.getAttribute("id"))!);
    const contrast = await new AxeBuilder({ page }).include('[role="alert"]').withRules(["color-contrast"]).analyze();
    expect(contrast.violations).toEqual([]);
    await rest.fill("1.5");
    await expect(error).toHaveCount(0);
    await rest.blur();
    await expect(error).toBeVisible();
    await rest.fill("120");
    await rest.blur();
    await expect(error).toHaveCount(0);
  });
}
