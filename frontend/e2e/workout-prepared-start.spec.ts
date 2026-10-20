import { expect, test } from "@playwright/test";
import { installTimingApi } from "./fixtures/workout-execution-api";
import { acceptedLegalStatus } from "./legal-fixture";
const owner = "22222222-2222-4222-8222-222222222222", program = "11111111-1111-4111-8111-111111111111", exercise = "33333333-3333-4333-8333-333333333333", server = "55555555-5555-4555-8555-555555555555";
for (const shortRange of [false, true]) test(`real Training page prepares offline, starts, restores a cluster and syncs in order; shortRange=${shortRange}`, async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-20T09:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-20T09:00:01Z"));
  const day = "2026-10-20";
  const profile = { id: owner, goals: { onboarding_completed: true, active_program_id: program, active_program_next_day: 1, active_program_week_phase: "medium", active_program_phase_source: "manual" }, anthropometry: {}, subscription_status: "free", stars_balance: 0, onboarding_completed: true, legal_status: acceptedLegalStatus(owner) };
  const programRow = { id: program, name: "Программа кластеров", version: 1, structure: { schedule: [{ day_index: 1, exercises: [{ exercise_id: exercise, sets: 1 }] }] } };
  const base = { execution_version: 2, day_index: 1, week_phase: "medium", title: "Кластер", exercises: [{ exercise_id: exercise, name_ru: "Жим лёжа", order: 1, target_sets: 1, target_reps: "4", rest_sec: 120,
    set_methods: [{ set_number: 1, kind: "cluster", parts: [0, 1, 2].map(i => ({ target_reps: 4, target_weight: 100, pause_after_sec: i < 2 ? 20 : 0 })) }] }] };
  let revision = 0, rest = 120;
  const currentPlan = () => ({ ...base, customization_revisions: { occurrence: revision }, customization_scopes: revision ? ["occurrence"] : [], exercises: [{ ...base.exercises[0], rest_sec: rest }] });
  const schedule = { requested_date: day, current: { original_date: day, target_date: day, start_time: "06:00:00", program_id: program, day_index: 1, title: "Кластер", status: "scheduled", is_override: false, can_reschedule: false }, next: null };
  const events: string[] = [];
  let created: Record<string, unknown> | null = null;
  await page.addInitScript(profile => {
    localStorage.setItem("fitness_jwt", "prepared-e2e"); localStorage.setItem("fitness_cached_user_v1", JSON.stringify(profile));
    if (localStorage.getItem("prepared-e2e-offline")) Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  }, profile);
  await page.route("**/*", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let data: unknown;
    if (path === "/users/me") data = profile;
    else if (path === "/legal/status") data = profile.legal_status;
    else if (path === "/programs") data = { items: [programRow], total: 1 };
    else if (path === "/programs/mine") data = { items: [], total: 0 };
    else if (path === `/programs/${program}`) data = programRow;
    else if (path === "/exercises") data = { items: [{ id: exercise, name_ru: "Жим лёжа", muscle_group: "chest", equipment: "штанга", difficulty: 1, tags: ["load:weight_reps"] }], total: 1, page: 1, page_size: 200 };
    else if (path === "/workouts/planned-plan") data = currentPlan();
    else if (path === "/workouts/customizations") {
      if (request.method() === "PUT") { events.push("preparation"); rest = request.postDataJSON().patch.exercise_overrides[0].rest_sec; revision = 1; }
      const scope = request.method() === "GET" ? new URL(request.url()).searchParams.get("scope") : "occurrence";
      data = { program_id: program, day_index: 1, scope, scheduled_date: scope === "occurrence" ? day : null, revision: scope === "occurrence" ? revision : 0, program_version: 1, patch: {} };
    }
    else if (path === "/workouts/offline-context" && shortRange && Number(new URL(request.url()).searchParams.get("days")) > 1) { await route.fulfill({ status: 413, json: { detail: "Планы слишком большие. Подготовьте меньше дней" } }); return; }
    else if (path === "/workouts/offline-context") data = { version: 1, owner, prepared_at: "2026-10-20T09:00:00Z", schedule_fingerprint: "0".repeat(64), start: day, end: day, program: programRow,
      days: [{ requested_date: day, schedule }], plans: [{ scheduled_date: day, day_index: 1, week_phase: "medium", readiness: "normal", preparation_fingerprint: String(revision + 1).repeat(64), exercise_defaults: { target_reps: "8-10", rest_sec: 60 }, plan: currentPlan() }] };
    else if (path === "/workouts/schedule/overview") data = schedule;
    else if (path === "/workouts/schedule/settings") data = { version: 1, days: [1, 3, 5], start_time: "06:00:00" };
    else if (path === "/workouts/illness") data = { active: false, started_on: null, recovery_choice_pending: false, recovery_light_week_active: false };
    else if (path === "/workouts/load-hints" || path === "/workouts/history") data = { items: [], total: 0 };
    else if (path === "/workouts" && request.method() === "POST") {
      events.push("create"); const body = request.postDataJSON(); expect(body.preparation.plan_fingerprint).toBe("2".repeat(64));
      created = { id: server, user_id: owner, program_id: program, scheduled_date: day, status: "planned", ai_notes: null, rpe: null, started_at: "2026-10-20T09:00:00Z", completed_at: null, plan: body.plan, sets: [] }; data = created;
    }
    else if (path === `/workouts/${server}/sets`) { events.push("parts"); const body = request.postDataJSON(); expect(body.parts.map((part: { status: string }) => part.status)).toEqual(["completed", "pending", "pending"]); data = { ...body, id: "66666666-6666-4666-8666-666666666666", workout_id: server, execution_revision: 1, is_completed: false }; }
    else if (path === `/workouts/${server}/complete`) { events.push("finish"); data = { ...created, status: "completed", completed_at: "2026-10-20T09:00:05Z" }; }
    else if (path === `/workouts/${server}`) data = created;
    else return route.fallback();
    await route.fulfill({ json: data });
  });
  await page.setViewportSize({ width: 393, height: 740 });
  await page.goto("/train");
  if (shortRange) {
    const range = page.getByRole("button", { name: "На 1 день", exact: true });
    await expect(range).toBeVisible();
    for (const width of [320, 393]) for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 740 }); await page.emulateMedia({ colorScheme });
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/workout-methods/range-${width}-${colorScheme}.png`, fullPage: true, animations: "disabled" });
    }
    await range.click();
  }
  await expect(page.getByRole("status").filter({ hasText: "Планы сохранены на устройстве" })).toBeVisible();
  await page.getByRole("button", { name: /Подготовить упражнения/ }).click();
  const dialog = page.getByRole("dialog", { name: "Подготовка тренировки" });
  await expect(dialog.getByLabel("Отдых, с", { exact: true })).toHaveValue("120");
  await page.evaluate(() => { localStorage.setItem("prepared-e2e-offline", "1"); Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }); window.dispatchEvent(new Event("offline")); });
  await dialog.getByLabel("Отдых, с", { exact: true }).fill("150");
  await dialog.getByRole("button", { name: "Сохранить подготовку" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /^Начать ·/ }).click();
  await page.getByRole("button", { name: "Пропустить всё", exact: true }).click();
  await page.getByRole("button", { name: "Записать часть", exact: true }).click();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:20");
  await page.clock.runFor(5000);
  await page.reload();
  await expect(page.getByLabel("Осталось отдыха", { exact: true })).toHaveText("0:15");
  await page.getByRole("button", { name: "Завершить тренировку", exact: true }).last().click();
  await page.getByRole("button", { name: "Завершить · тяжесть 7/10", exact: true }).click();
  await expect(page.getByRole("button", { name: "К прогрессу", exact: true })).toBeVisible();
  expect(events).toEqual([]);
  await page.evaluate(() => { localStorage.removeItem("prepared-e2e-offline"); Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); window.dispatchEvent(new Event("online")); });
  await expect.poll(() => events).toEqual(["preparation", "create", "parts", "finish"]);
});

test("reduced readiness confirms preserved explicit weights before offline start", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T09:00:00Z"));
  await installTimingApi(page);
  await page.goto("/e2e/fixtures/workout-method-runner.html?kind=cluster");
  await expect(page.getByText("Часть 1 из 3", { exact: true })).toBeVisible();
  const messages: string[] = [];
  page.on("dialog", async dialog => { messages.push(dialog.message()); if (messages.length === 1) await dialog.dismiss(); else await dialog.accept(); });
  const result = await page.evaluate(async () => {
    const storagePath = "/src/db/offlineWorkoutContext.ts", startPath = "/src/features/workout/services/programWorkoutStart.ts", dbPath = "/src/db/schema.ts";
    const { saveOfflineWorkoutContext } = await import(/* @vite-ignore */ storagePath);
    const { startProgramSession } = await import(/* @vite-ignore */ startPath);
    const { db } = await import(/* @vite-ignore */ dbPath);
    const owner = "22222222-2222-4222-8222-222222222222", programId = "99999999-9999-4999-8999-999999999999", date = "2026-10-20";
    const current = (await db.sessions.toArray())[0];
    const plan = { ...current.workout.plan, week_phase: "light" };
    await saveOfflineWorkoutContext(owner, { version: 1, owner, prepared_at: "2026-10-20T09:00:00Z", schedule_fingerprint: "0".repeat(64), start: date, end: date,
      program: { id: programId, name: "Проверка нагрузки", version: 1, structure: { days: [{ day: 1 }] } }, days: [{ requested_date: date, schedule: { requested_date: date, current: null, next: null } }],
      plans: [{ scheduled_date: date, day_index: 1, week_phase: "heavy", readiness: "reduce", preparation_fingerprint: "1".repeat(64), plan }] },
      { id: owner, goals: { active_program_id: programId }, anthropometry: {}, subscription_status: "free", stars_balance: 0, onboarding_completed: true }, [], []);
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    const before = await db.sessions.count();
    const input = { programId, scheduledDate: date, dayIndex: 1, weekPhase: "heavy", cycleReadiness: "reduce" };
    let cancelled = "";
    try { await startProgramSession(input); } catch (error) { cancelled = String(error); }
    const afterCancel = await db.sessions.count();
    const started = await startProgramSession(input);
    return { cancelled, before, afterCancel, afterConfirm: await db.sessions.count(), weight: started.workout.plan.exercises[0].set_methods[0].parts[0].target_weight };
  });
  expect(messages).toHaveLength(2);
  expect(messages[0]).toContain("не облегчаются автоматически");
  expect(result.cancelled).toContain("Старт отменён");
  expect(result.afterCancel).toBe(result.before);
  expect(result.afterConfirm).toBe(result.before + 1);
  expect(result.weight).toBe(100);
});
