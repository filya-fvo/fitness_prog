import { expect, test } from "@playwright/test";
import { installTimingApi } from "./fixtures/workout-execution-api";

test("synthetic V1 missing-slot control reaches the real timed modal; durable values survive reload", async ({ page }) => {
  await installTimingApi(page);
  await page.route("**/workouts/load-hints", route => route.fulfill({ json: { items: [{ exercise_id: "33333333-3333-4333-8333-333333333333",
    weight: 80, reps: 6, duration_sec: 30, completed_date: "2026-10-19", weight_mode: null, machine_params: null, rpe: null }] } }));
  await page.goto("/e2e/fixtures/workout-method-runner.html?target=timed");
  await expect(page.getByText("Цель: 95 с", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const dbPath = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ dbPath);
    return (await db.workoutLoadHints.toArray())[0]?.lastDurationSec;
  })).toBe(30);
  await page.getByRole("button", { name: "Править", exact: true }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("combobox", { name: "Минуты: выбрать значение" })).toHaveValue("1");
  await expect(modal.getByRole("combobox", { name: "Секунды: выбрать значение" })).toHaveValue("35");
  await modal.getByRole("button", { name: "Закрыть", exact: true }).click();
  const saved = await page.evaluate(async () => {
    const dbPath = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ dbPath);
    const session = (await db.sessions.toArray())[0];
    session.drafts[0] = { ...session.drafts[0], reps: "", weight: "", durationSec: null };
    session.drafts[1] = { ...session.drafts[1], durationSec: 42, isCompleted: true };
    session.drafts[2] = { ...session.drafts[2], durationSec: null, isSkipped: true };
    await db.sessions.put(session);
    return session.drafts;
  });
  await page.reload();
  await expect(page.getByText("Цель: 95 с", { exact: true })).toBeVisible();
  const restored = await page.evaluate(async () => {
    const dbPath = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ dbPath);
    return (await db.sessions.toArray())[0].drafts;
  });
  expect(restored).toEqual(saved);
});

test("online V2 timed start initializes95 from all server-seeded slots before history30", async ({ page }) => {
  await installTimingApi(page);
  await page.route("**/workouts/load-hints", route => route.fulfill({ json: { items: [{ exercise_id: "33333333-3333-4333-8333-333333333333",
    weight: null, reps: null, duration_sec: 30, completed_date: "2026-10-19", weight_mode: null, machine_params: null, rpe: null }] } }));
  await page.goto("/e2e/fixtures/workout-method-runner.html?target=timed-v2");
  await expect(page.getByText("Цель: 95 с", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Время работы, с", { exact: true })).toHaveValue("95");
  const persisted = await page.evaluate(async () => {
    const dbPath = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ dbPath);
    return { session: (await db.sessions.toArray())[0], hint: (await db.workoutLoadHints.toArray())[0] };
  });
  expect(persisted.hint.lastDurationSec).toBe(30);
  expect(persisted.session.workout.sets).toHaveLength(3);
  expect(persisted.session.workout.sets.every((set: { duration_sec: number | null; execution_revision: number; is_completed: boolean }) => set.duration_sec === null && set.execution_revision === 0 && !set.is_completed)).toBe(true);
  expect(persisted.session.drafts.every((draft: { durationSec: number | null; isCompleted: boolean }) => draft.durationSec === 95 && !draft.isCompleted)).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Время работы, с", { exact: true })).toHaveValue("95");
});

test("method goals initialize forms while ordinary targets keep their range and facts stay separate", async ({ page }) => {
  await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?target=weight");
  await expect(page.getByLabel("Повторы", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("100");
  const parts = await page.evaluate(async () => {
    const dbPath = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ dbPath);
    return (await db.sessions.toArray())[0].drafts[0].parts;
  });
  expect(parts).toHaveLength(3);
  expect(parts.every((part: { reps: number | null; weight: number | null; status: string }) => part.reps === null && part.weight === null && part.status === "pending")).toBe(true);
  await page.getByRole("button", { name: "Записать часть", exact: true }).click();
  await page.getByRole("button", { name: "Закончить отдых", exact: true }).click();
  await page.getByRole("button", { name: "Пропустить часть", exact: true }).click();
  await page.getByText("Все шаги и записи", { exact: true }).click();
  await page.getByRole("button", { name: /Жим штанги лёжа · 2Ожидает/ }).click();
  await expect(page.getByText("Цель: 12–15 повт. · 40 кг", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Повторы", { exact: true })).toHaveValue("12");
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("40");
  const saved = await page.evaluate(async () => {
    const dbPath = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ dbPath);
    const session = (await db.sessions.toArray())[0];
    session.drafts[1] = { ...session.drafts[1], reps: "", weight: "", durationSec: null };
    await db.sessions.put(session);
    return session.drafts;
  });
  await page.reload();
  await expect(page.getByLabel("Повторы", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("");
  const restored = await page.evaluate(async () => {
    const dbPath = "/src/db/schema.ts";
    const { db } = await import(/* @vite-ignore */ dbPath);
    return (await db.sessions.toArray())[0].drafts;
  });
  expect(restored).toEqual(saved);
  expect(restored[0].parts.map((part: { status: string }) => part.status)).toEqual(["completed", "skipped", "pending"]);
});

test("reps-only explicit goal starts at the minimum without a weight input", async ({ page }) => {
  await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?target=reps");
  await expect(page.getByText("Цель: 12–15 повт.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Повторы", { exact: true })).toHaveValue("12");
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveCount(0);
});
