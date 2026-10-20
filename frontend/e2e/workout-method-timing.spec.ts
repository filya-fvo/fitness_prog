import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installTimingApi } from "./fixtures/workout-execution-api";
const owner = "22222222-2222-4222-8222-222222222222";

test("slow network and double tap do not prolong cluster rest or complete the next part", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  const api = await installTimingApi(page, true);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await expect(page.getByText("Часть 1 из 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Записать часть", exact: true }).dblclick();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:20");
  await page.clock.runFor(10000);
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:10");
  api.release();
  await expect.poll(() => api.writes.length).toBe(1);
  await page.clock.runFor(10000);
  await expect(page.getByText("Отдых завершён", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0].parts.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
});

test("cluster uses exercise rest once, with no pause after final work", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clusternext");
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    await expect(page.getByText(`Часть ${ordinal} из 3`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Записать часть", exact: true }).click();
    await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText(ordinal < 3 ? "0:20" : "2:00");
    await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  }
  await expect(page.getByText("Подход 2 из 2", { exact: true })).toBeVisible();
  await page.getByLabel("Рабочий вес, кг", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Записать подход", exact: true }).click();
  await expect(page.getByText("Все шаги обработаны.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
});

test("zero-pause drop advances without recording later work", async ({ page }) => {
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=drop");
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    await expect(page.getByText(`Часть ${ordinal} из 3`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Записать часть", exact: true }).click();
    await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  }
  await expect.poll(() => api.writes.length).toBe(3);
  expect(api.writes.map(row => row.base_execution_revision)).toEqual([0, 1, 2]);
  expect(api.writes[2].parts.map(part => part.status)).toEqual(["completed", "completed", "completed"]);
});

test("compound participant switches to partner before one round pause", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    await expect(page.getByText(`Часть ${ordinal} из 3`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Записать часть", exact: true }).click();
    if (ordinal < 3) await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  await page.getByLabel("Рабочий вес, кг", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Записать подход", exact: true }).click();
  await expect(page.getByText("После круга", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("1:30");
  await page.getByRole("button", { name: "+15 с", exact: true }).click();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("1:45");
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await expect(page.getByText("Суперсет · круг 2 из 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Жим штанги лёжа", exact: true })).toBeVisible();
});

test("old correction keeps deadline; undo cancels last part only", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await page.getByRole("button", { name: "Записать часть", exact: true }).click();
  await page.clock.runFor(5000);
  await page.getByLabel("Повторы", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Сохранить исправление", exact: true }).click();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:15");
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await page.getByRole("button", { name: "Записать часть", exact: true }).click();
  await page.getByRole("button", { name: "Отменить последнее действие", exact: true }).click();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Записать часть", exact: true })).toBeEnabled();
  await expect.poll(() => api.writes.length).toBe(4);
  expect(api.writes.at(-1)!.parts.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
});

test("skip remainder preserves completed parts and requires manual switch", async ({ page }) => {
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  await page.getByRole("button", { name: "Записать часть", exact: true }).click();
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await page.getByRole("button", { name: "Пропустить остаток подхода", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Жим штанги лёжа", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Шаг пропущен." })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  await expect.poll(() => api.writes.length).toBe(2);
  expect(api.writes[1].parts.map(part => part.status)).toEqual(["completed", "skipped", "skipped"]);
  await page.getByRole("button", { name: "К текущему шагу", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
});

test("auto navigation off leaves the viewed part unchanged while timer still finishes", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T09:00:00Z") });
  await installTimingApi(page, false, false);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await page.getByRole("button", { name: "Записать часть", exact: true }).click();
  await page.clock.runFor(20000);
  await expect(page.getByText("Отдых завершён", { exact: true })).toBeVisible();
  await expect(page.getByText("Часть 1 из 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "К текущему шагу", exact: true }).click();
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Записать часть", exact: true })).toBeEnabled();
});

test("real browser clock emits one completion signal and records no additional work", async ({ page }) => {
  await installTimingApi(page);
  await page.addInitScript(() => {
    Object.assign(window, { executionSignals: 0 });
    window.addEventListener("fitness:execution-rest-ended", () => {
      const state = window as unknown as { executionSignals: number }; state.executionSignals++;
    });
  });
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster&rest=short");
  await page.getByRole("button", { name: "Записать часть", exact: true }).click();
  await expect(page.getByText("Отдых завершён", { exact: true })).toBeVisible();
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByRole("button", { name: "Записать часть", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { executionSignals: number }).executionSignals)).toBe(1);
});

for (const kind of ["triset", "circuit"]) {
  test(`${kind} completes timed participant before round rest`, async ({ page }) => {
    await installTimingApi(page);
    await page.goto(`/e2e/fixtures/workout-method-runner.html?kind=clustergroup${kind}`);
    for (let ordinal = 1; ordinal <= 3; ordinal++) {
      await page.getByRole("button", { name: "Записать часть", exact: true }).click();
      if (ordinal < 3) await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
    await page.getByLabel("Рабочий вес, кг", { exact: true }).fill("30");
    await page.getByRole("button", { name: "Записать подход", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Планка", exact: true })).toBeVisible();
    await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Время работы, с", { exact: true })).toHaveValue("40");
    await page.getByRole("button", { name: "Записать подход", exact: true }).click();
    await expect(page.getByText("После круга", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("1:30");
  });
}

for (const theme of ["light", "dark"]) for (const width of [320, 375, 393, 1440]) {
  test(`execution controls fit ${width} ${theme} with accessible result fields`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 740 });
    await installTimingApi(page);
    await page.addInitScript(value => localStorage.setItem("fitness_theme_preference", value), theme);
    await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
    await expect(page.getByRole("button", { name: "Записать часть", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Записать часть", exact: true }).click();
    await expect(page.getByText("Между кластерами", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include('[aria-label="Выполнение тренировки"]').analyze();
    expect(axe.violations).toEqual([]);
    if (width === 393) await page.screenshot({ path: `C:/fitness_prog/artifacts/workout-methods-20261019/execution-${theme}.png`, fullPage: true });
  });
}

test("early finish saves partial work immediately and sends completion after its parts", async ({ page }) => {
  const api = await installTimingApi(page, true);
  let completion: { execution_version: number } | null = null;
  await page.route("**/workouts/*/complete", route => {
    completion = route.request().postDataJSON();
    return route.fulfill({ json: { id: "11111111-1111-4111-8111-111111111111", user_id: owner, program_id: null,
      scheduled_date: "2026-10-19", status: "completed", ai_notes: null, rpe: 7, started_at: "2026-10-19T09:00:00Z",
      completed_at: new Date().toISOString(), sets: [] } });
  });
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await page.getByRole("button", { name: "Записать часть", exact: true }).click();
  await page.getByRole("button", { name: "Завершить тренировку", exact: true }).last().click();
  await page.getByRole("button", { name: "Завершить · тяжесть 7/10", exact: true }).click();
  await expect(page.getByRole("button", { name: "К прогрессу", exact: true })).toBeVisible();
  expect(completion).toBeNull();
  api.release();
  await expect.poll(() => completion).toMatchObject({ execution_version: 2 });
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0].parts.map(part => part.status)).toEqual(["completed", "pending", "pending"]);
});
