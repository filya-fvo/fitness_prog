import { expect, test, type Page } from "@playwright/test";
import { applySetWeight, installTimingApi, openPartEditor, quickComplete } from "./fixtures/workout-execution-api";
const initialTime = new Date("2026-10-20T09:00:00Z");
async function signals(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { executionSignals: 0 });
    window.addEventListener("fitness:execution-rest-ended", () => { (window as unknown as { executionSignals: number }).executionSignals++; });
  });
}
async function signalCount(page: Page) { return page.evaluate(() => (window as unknown as { executionSignals: number }).executionSignals); }

test("restores a superset member from IndexedDB when the running catalog is incomplete", async ({ page }) => {
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup&catalog=partial");
  await expect(quickComplete(page)).toBeVisible();
  await page.reload();

  await page.getByRole("navigation", { name: "Упражнения тренировки" }).getByRole("button", { name: /Молитва/ }).click();

  await expect(page.getByRole("heading", { name: "Молитва", exact: true })).toBeVisible();
  await applySetWeight(page, "30");
  await expect.poll(() => api.writes.length).toBe(1);
  expect(api.writes[0]).toMatchObject({ exercise_id: "44444444-4444-4444-8444-444444444444", is_completed: true });
});

test("reload between cluster parts retains facts and original deadline", async ({ page }) => {
  await page.clock.install({ time: initialTime }); await page.clock.pauseAt(new Date(initialTime.getTime() + 1000));
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await quickComplete(page).click();
  await expect.poll(() => api.writes.length).toBe(1);
  await page.clock.runFor(8000);
  await page.reload();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:12");
  await page.clock.runFor(12000);
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(1);
});

test("return after throttled deadline signals once and offers the next pending part only", async ({ page }) => {
  await page.clock.install({ time: initialTime });
  const api = await installTimingApi(page); await signals(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await quickComplete(page).click();
  await page.clock.fastForward(60000);
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  await expect.poll(() => signalCount(page)).toBe(1);
  expect(api.writes).toHaveLength(1);
});

test("two tabs share durable facts and claim a single end signal", async ({ page, context }) => {
  const other = await context.newPage();
  await page.clock.install({ time: initialTime }); await other.clock.install({ time: initialTime });
  const one = await installTimingApi(page), two = await installTimingApi(other);
  await signals(page); await signals(other);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await other.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await expect(other.getByText("Часть 1 из 3", { exact: true })).toBeVisible();
  await quickComplete(page).click();
  await expect(other.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:20");
  await Promise.all([page.clock.runFor(20000), other.clock.runFor(20000)]);
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  await expect(other.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  await expect.poll(async () => await signalCount(page) + await signalCount(other)).toBe(1);
  expect(one.writes.length + two.writes.length).toBe(1);
  await Promise.all([quickComplete(page).click(), quickComplete(other).click()]);
  await expect.poll(() => one.writes.length + two.writes.length).toBe(2);
  const last = [...one.writes, ...two.writes].find(row => row.base_execution_revision === 1)!;
  expect(last.parts.map(part => part.status)).toEqual(["completed", "completed", "pending"]);
});

test("ambiguous system clock jump requires explicit continuation without a false signal", async ({ page }) => {
  await page.clock.install({ time: initialTime });
  const api = await installTimingApi(page); await signals(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await quickComplete(page).click();
  await page.clock.setSystemTime(new Date(initialTime.getTime() + 600000));
  await page.clock.runFor(250);
  await expect(page.getByText("Время устройства изменилось.", { exact: false })).toBeVisible();
  await expect(page.getByText("Часть 1 из 3", { exact: true })).toBeVisible();
  expect(await signalCount(page)).toBe(0);
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await expect(page.getByText("Часть 2 из 3", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(1);
});

test("corrupt persisted target does not erase facts or open a flattened recording screen", async ({ page }) => {
  await page.clock.install({ time: initialTime });
  await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await quickComplete(page).click();
  await page.evaluate(async () => {
    const path = "/src/db/schema.ts"; const { db } = await import(/* @vite-ignore */ path);
    const session = await db.sessions.get("11111111-1111-4111-8111-111111111111");
    session.execution.progress.rest.targetStep.id = "foreign";
    await db.sessions.put(session);
  });
  await page.reload();
  await expect(page.getByText("Не удалось проверить сохранённое выполнение.", { exact: false })).toBeVisible();
  await expect(quickComplete(page)).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const path = "/src/db/schema.ts"; const { db } = await import(/* @vite-ignore */ path);
    const session = await db.sessions.get("11111111-1111-4111-8111-111111111111");
    return session.drafts[0].parts[0].status;
  })).toBe("completed");
});

test("an old correction form keeps entered values and cannot overwrite another tab", async ({ page, context }) => {
  const other = await context.newPage();
  await page.clock.install({ time: initialTime }); await other.clock.install({ time: initialTime });
  const one = await installTimingApi(page), two = await installTimingApi(other);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await other.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await quickComplete(page).click();
  await expect(other.getByLabel("Осталось отдыха", { exact: true })).toBeVisible();
  const staleEditor = await openPartEditor(page, 1);
  const currentEditor = await openPartEditor(other, 1);
  const repetitions = staleEditor.getByRole("combobox", { name: "Повторения: выбрать значение" });
  await repetitions.selectOption("3");
  await currentEditor.getByRole("combobox", { name: "Повторения: выбрать значение" }).selectOption("2");
  await currentEditor.getByRole("button", { name: "Сохранить исправление", exact: true }).click();
  const refresh = staleEditor.getByRole("button", { name: "Обновить форму", exact: true });
  await expect(refresh).toBeVisible();
  await expect(repetitions).toHaveValue("3");
  await expect(staleEditor.getByRole("button", { name: "Сохранить исправление", exact: true })).toBeDisabled();
  await expect.poll(() => one.writes.length + two.writes.length).toBe(2);
  await refresh.click();
  await expect(repetitions).toHaveValue("2");
});


test("reload between exercises and rounds keeps the next pending slot and round deadline", async ({ page }) => {
  await page.clock.install({ time: initialTime }); await page.clock.pauseAt(new Date(initialTime.getTime() + 1000));
  const api = await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=clustergroup");
  for (let part = 1; part <= 3; part++) {
    await quickComplete(page).click();
    if (part < 3) await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await expect.poll(() => api.writes.length).toBe(3);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  await applySetWeight(page, "30");
  await expect.poll(() => api.writes.length).toBe(4);
  await page.clock.runFor(10000);
  await page.reload();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("1:20");
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await expect(page.getByText("Суперсет · круг 2 из 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Жим штанги лёжа", exact: true })).toBeVisible();
  await applySetWeight(page, "100", 2);
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await expect.poll(() => api.writes.length).toBe(5);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Сгибания со штангой", exact: true })).toBeVisible();
  await expect(page.getByText("Суперсет · круг 2 из 2", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveCount(0);
  await expect.poll(() => api.writes.length).toBe(5);
  expect(api.writes[2].parts.map(part => part.status)).toEqual(["completed", "completed", "completed"]);
});
