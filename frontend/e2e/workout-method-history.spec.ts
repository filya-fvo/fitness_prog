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

for (const theme of ["light", "dark"]) test(`compound history is usable at mobile and desktop widths in ${theme}`, async ({ page }) => {
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
  await page.screenshot({ path: `C:/fitness_prog/artifacts/workout-methods-20261019/history-${theme}.png`, fullPage: true });
});
