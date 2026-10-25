import { expect, test, type Page } from "@playwright/test";
import { installTimingApi } from "./fixtures/workout-execution-api";

async function openWorkout(page: Page, rest = "0") {
  await installTimingApi(page, false, false);
  const writes: Record<string, unknown>[] = [];
  await page.route("**/workouts/*/sets", async route => {
    const body = route.request().postDataJSON();
    writes.push(body);
    await route.fulfill({ json: { id: "66666666-6666-4666-8666-666666666666",
      workout_id: "11111111-1111-4111-8111-111111111111", ...body } });
  });
  await page.addInitScript(() => {
    localStorage.setItem("fitness_workout_simple_mode", "0");
    // No sound, haptics or browser notification can leave this synthetic fixture.
    Object.defineProperty(window, "Notification", { configurable: true, value: class { static permission = "denied"; static requestPermission = async () => "denied"; } });
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => false });
    HTMLMediaElement.prototype.play = async () => {};
    Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
  });
  await page.goto(`/e2e/fixtures/workout-zero-rest.html?rest=${rest}`);
  await expect(page.getByRole("heading", { name: "Отжимания", exact: true })).toBeVisible();
  return { writes };
}

test("V1 explicit zero displays and opens as zero, saves zero and reloads without a rest timer", async ({ page }) => {
  const api = await openWorkout(page);
  await expect(page.getByLabel("Отдых в секундах", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Править", exact: true }).first().click();
  await expect(page.getByLabel("Отдых после подхода", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => api.writes).toMatchObject([{ rest_time_sec: 0, is_completed: true }]);
  await expect(page.getByRole("button", { name: /Открыть таймер/ })).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { db } = (window as unknown as { restFixture: { db: typeof import("../src/db/schema").db } }).restFixture;
    const session = await db.sessions.get("11111111-1111-4111-8111-111111111111");
    return { draft: session?.drafts[0].restTimeSec, saved: session?.workout.sets[0].rest_time_sec };
  })).toEqual({ draft: 0, saved: 0 });
  await page.reload();
  await expect(page.getByLabel("Отдых в секундах", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Править", exact: true }).first().click();
  await expect(page.getByLabel("Отдых после подхода", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByRole("button", { name: /Открыть таймер/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Полный", exact: true }).click();
  await expect(page.getByText("Без отдыха · таймер не запускается", { exact: true })).toBeVisible();
});

test("V1 runtime rest permits clearing and typing bounded integers; invalid input blocks completion", async ({ page }) => {
  const api = await openWorkout(page, "60");
  const input = page.getByLabel("Отдых в секундах", { exact: true });
  await expect(page.getByRole("button", { name: "Готово", exact: true }).first()).toBeEnabled();
  for (const invalid of ["", "-1", "601", "1.5", "abc"]) {
    await input.fill(invalid);
    await expect(input).toHaveValue(invalid);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await input.blur();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toContainText("от 0 до 600");
    await expect(input).toHaveAttribute("aria-describedby", (await page.getByRole("alert").getAttribute("id"))!);
    await expect(page.getByRole("button", { name: "Готово", exact: true }).first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Править", exact: true }).first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Таймер отдыха", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Как прошлый", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Добавить +", exact: true })).toBeDisabled();
    expect(api.writes).toHaveLength(0);
  }
  await input.fill("600");
  await expect(input).toHaveValue("600");
  await input.fill("");
  await input.pressSequentially("120");
  await expect(input).toHaveValue("120");
  await input.fill("0");
  await input.blur();
  await page.getByRole("button", { name: "Готово", exact: true }).first().click();
  await expect.poll(() => api.writes).toMatchObject([{ rest_time_sec: 0 }]);
  await expect(page.getByRole("button", { name: /Открыть таймер/ })).toHaveCount(0);
});

for (const context of ["Другая тренировка", "Другой владелец"]) test(`V1 invalid rest is isolated after ${context}`, async ({ page }) => {
  await openWorkout(page, "60");
  const input = page.getByLabel("Отдых в секундах", { exact: true });
  await input.fill("abc");
  await input.blur();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: context, exact: true }).click();
  await expect(input).toHaveValue("60");
  await expect(page.getByRole("button", { name: "Готово", exact: true }).first()).toBeEnabled();
  await page.getByRole("button", { name: "Исходная тренировка", exact: true }).click();
  await expect(input).toHaveValue("abc");
  await expect(page.getByRole("button", { name: "Готово", exact: true }).first()).toBeDisabled();
});

test("V1 zero completion and correction preserve another running rest deadline", async ({ page }) => {
  const api = await openWorkout(page, "60");
  await page.getByRole("button", { name: "Таймер отдыха", exact: true }).click();
  const deadline = await page.evaluate(() => (window as unknown as { restFixture: { store: { getState(): { restEndsAtMs: number | null } } } }).restFixture.store.getState().restEndsAtMs);
  expect(deadline).not.toBeNull();
  await page.getByLabel("Отдых в секундах", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Готово", exact: true }).first().click();
  await expect.poll(() => api.writes.length).toBe(1);
  await page.getByRole("button", { name: "Править", exact: true }).first().click();
  await expect(page.getByLabel("Отдых после подхода", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => api.writes.length).toBe(2);
  expect(api.writes.map(row => row.rest_time_sec)).toEqual([0, 0]);
  expect(await page.evaluate(() => (window as unknown as { restFixture: { store: { getState(): { restEndsAtMs: number | null } } } }).restFixture.store.getState().restEndsAtMs)).toBe(deadline);
});

for (const width of [320, 393]) test(`V1 rest control remains usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 740 });
  await openWorkout(page, "60");
  const input = page.getByLabel("Отдых в секундах", { exact: true });
  expect(await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  for (const name of ["Уменьшить отдых на 15 секунд", "Уменьшить отдых на 30 секунд", "Увеличить отдых на 15 секунд", "Увеличить отдых на 30 секунд"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Без отдыха", exact: true }).click();
  await expect(input).toHaveValue("0");
  await page.getByRole("button", { name: "Увеличить отдых на 15 секунд", exact: true }).click();
  await expect(input).toHaveValue("15");
  await page.getByRole("button", { name: "Уменьшить отдых на 30 секунд", exact: true }).click();
  await expect(input).toHaveValue("0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("V1 editing a completed zero-rest set preserves zero while the next set has sixty seconds", async ({ page }) => {
  const api = await openWorkout(page, "60");
  await page.getByRole("button", { name: "Править", exact: true }).first().click();
  await page.getByLabel("Отдых после подхода", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect.poll(() => api.writes).toMatchObject([{ rest_time_sec: 0 }]);
  await expect(page.getByLabel("Отдых в секундах", { exact: true })).toHaveValue("60");
  await expect(page.getByRole("button", { name: /Открыть таймер/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Править", exact: true }).first().click();
  await expect(page.getByLabel("Отдых после подхода", { exact: true })).toHaveValue("0");
});

for (const rest of ["60", "90", "missing", "null"]) test(`V1 ${rest} retains positive rest or the sixty-second fallback`, async ({ page }) => {
  const api = await openWorkout(page, rest);
  const expected = rest === "90" ? 90 : 60;
  await expect(page.getByLabel("Отдых в секундах", { exact: true })).toHaveValue(String(expected));
  await page.getByRole("button", { name: "Готово", exact: true }).first().click();
  await expect.poll(() => api.writes).toMatchObject([{ rest_time_sec: expected }]);
  await expect(page.getByRole("button", { name: /Открыть таймер/ })).toBeVisible();
});
