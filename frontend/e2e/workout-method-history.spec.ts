import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("partial compound history shows actual volume and edits parts without flattening", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?method=cluster");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  const writes: Array<Record<string, unknown>> = [];
  await page.route(`**/workouts/${before.id}/sets`, route => {
    const payload = route.request().postDataJSON(); writes.push(payload);
    return route.fulfill({ json: { ...before.sets[0], ...payload, execution_revision: 2 } });
  });
  const trigger = page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания", exact: true });
  await expect(trigger).toContainText("Частично выполнено");
  await expect(trigger).toContainText("Кластер: 100 кг × 4 + 100 кг × 4 + 3: ожидает");
  await expect(page.getByText("800 кг", { exact: true })).toBeVisible();
  await expect(page.getByText("Частей выполнено: 2/3.", { exact: false })).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Кластер · подход 1", exact: true });
  await expect(dialog.getByLabel("Статус части 3", { exact: true })).toHaveValue("pending");
  await dialog.getByLabel("Повторы части 1", { exact: true }).fill("3");
  expect((await new AxeBuilder({ page }).include('[aria-labelledby="compound-history-title"]').analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Сохранить части", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toContainText("100 кг × 3");
  await expect(page.getByText("700 кг", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ execution_version: 2, execution_kind: "cluster", base_execution_revision: 1, reps: null, weight: null });
  expect((writes[0].parts as Array<{ status: string }>).map(part => part.status)).toEqual(["completed", "completed", "pending"]);
  await trigger.click();
  await expect(dialog.getByLabel("Повторы части 1", { exact: true })).toHaveValue("3");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("failed part correction keeps form and retries the same operation identity", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?method=cluster");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  const writes: Array<Record<string, unknown>> = [];
  await page.route(`**/workouts/${before.id}/sets`, route => {
    const payload = route.request().postDataJSON(); writes.push(payload);
    return writes.length === 1 ? route.fulfill({ status: 503, json: { detail: "Сервис временно недоступен" } })
      : route.fulfill({ json: { ...before.sets[0], ...payload, execution_revision: 2 } });
  });
  await page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Кластер · подход 1", exact: true });
  await dialog.getByLabel("Повторы части 1", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "Сохранить части", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Сервис временно недоступен");
  await expect(dialog.getByLabel("Повторы части 1", { exact: true })).toHaveValue("3");
  await dialog.getByRole("button", { name: "Сохранить части", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0].client_operation_id).toBe(writes[1].client_operation_id);
});

for (const theme of ["light", "dark"]) test(`compound history is usable at mobile and desktop widths in ${theme}`, async ({ page }, testInfo) => {
  await page.addInitScript(value => localStorage.setItem("fitness_theme_preference", value), theme);
  await page.goto("/e2e/fixtures/workout-edit.html?method=cluster");
  await page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Кластер · подход 1", exact: true });
  for (const width of [320, 375, 393, 1440]) {
    await page.setViewportSize({ width, height: 568 });
    await expect(dialog.getByRole("button", { name: "Сохранить части", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 740 });
  expect((await new AxeBuilder({ page }).include('[aria-labelledby="compound-history-title"]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`history-${theme}.png`), fullPage: true });
});


test("a late history correction cannot update the next account", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?method=cluster");
  const output = page.getByLabel("Сохранённая тренировка");
  const before = JSON.parse(await output.textContent() || "{}");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  await page.route(`**/workouts/${before.id}/sets`, async route => {
    writes++; const payload = route.request().postDataJSON(); await held;
    await route.fulfill({ json: { ...before.sets[0], ...payload, execution_revision: 2 } });
  });
  await page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Кластер · подход 1", exact: true });
  await dialog.getByLabel("Повторы части 1", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "Сохранить части", exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  await page.evaluate(async () => {
    // @ts-expect-error Real Vite module used by the fixture.
    const { useUserStore } = await import("/src/store/userStore.ts");
    useUserStore.setState({ user: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", subscription_status: "plus", onboarding_completed: true } });
  });
  release();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => JSON.parse(await output.textContent() || "{}").sets[0].parts[0].reps).toBe(4);
});

test("acknowledged history correction survives a local cache error", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?method=cluster");
  const output = page.getByLabel("Сохранённая тренировка");
  const before = JSON.parse(await output.textContent() || "{}");
  await page.route(`**/workouts/${before.id}/sets`, route => route.fulfill({ json: { ...before.sets[0], ...route.request().postDataJSON(), execution_revision: 2 } }));
  await page.evaluate(async () => {
    // @ts-expect-error Real Vite storage module.
    const { db } = await import("/src/db/schema.ts");
    db.workouts.hook("creating", () => { throw new Error("synthetic local cache failure"); });
  });
  await page.getByRole("button", { name: "Изменить подход 1: Гакк-приседания", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Кластер · подход 1", exact: true });
  await dialog.getByLabel("Повторы части 1", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "Сохранить части", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(JSON.parse(await output.textContent() || "{}").sets[0].parts[0].reps).toBe(3);
});

test("acknowledged workout notes survive a local cache error", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?method=cluster");
  const output = page.getByLabel("Сохранённая тренировка");
  const before = JSON.parse(await output.textContent() || "{}");
  await page.route(`**/workouts/${before.id}`, route => route.fulfill({ json: { ...before, ...route.request().postDataJSON() } }));
  await page.evaluate(async () => {
    // @ts-expect-error Real Vite storage module.
    const { db } = await import("/src/db/schema.ts");
    db.workouts.hook("creating", () => { throw new Error("synthetic local cache failure"); });
  });
  await page.getByRole("button", { name: "Заметки и тяжесть тренировки", exact: true }).click();
  await page.getByRole("textbox", { name: "Заметки", exact: true }).fill("После кластера");
  await page.getByRole("button", { name: "Сохранить заметки", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сохранить заметки", exact: true })).toHaveCount(0);
  await expect.poll(async () => JSON.parse(await output.textContent() || "{}").ai_notes).toBe("После кластера");
});


test("late workout notes are ignored after account switch", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?method=cluster");
  const output = page.getByLabel("Сохранённая тренировка");
  const before = JSON.parse(await output.textContent() || "{}");
  let release!: () => void, writes = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/workouts/${before.id}`, async route => { writes++; const payload = route.request().postDataJSON(); await held; await route.fulfill({ json: { ...before, ...payload } }); });
  await page.getByRole("button", { name: "Заметки и тяжесть тренировки", exact: true }).click();
  await page.getByRole("textbox", { name: "Заметки", exact: true }).fill("Поздняя заметка");
  await page.getByRole("button", { name: "Сохранить заметки", exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  await page.evaluate(async () => {
    // @ts-expect-error Real Vite owner store.
    const { useUserStore } = await import("/src/store/userStore.ts");
    useUserStore.setState({ user: null });
  });
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(JSON.parse(await output.textContent() || "{}").ai_notes).toBe(before.ai_notes);
});

test("acknowledged deletion closes history even if local cache removal fails", async ({ page }) => {
  await page.goto("/e2e/fixtures/workout-edit.html?method=cluster");
  const before = JSON.parse(await page.getByLabel("Сохранённая тренировка").textContent() || "{}");
  let removed = 0;
  await page.route(`**/workouts/${before.id}`, route => { removed++; return route.fulfill({ status: 204 }); });
  await page.evaluate(async workout => {
    // @ts-expect-error Real Vite database.
    const { db } = await import("/src/db/schema.ts");
    await db.workouts.put(workout);
    db.workouts.hook("deleting", () => { throw new Error("synthetic cache failure"); });
  }, before);
  await page.getByRole("button", { name: "Заметки и тяжесть тренировки", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Удалить тренировку", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(removed).toBe(1);
});
