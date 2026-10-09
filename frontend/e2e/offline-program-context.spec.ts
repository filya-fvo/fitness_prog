import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { acceptedLegalStatus } from "./legal-fixture";
const owner = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const exerciseId = "44444444-4444-4444-8444-444444444444";
const program = { id: programId, name: "Офлайн программа", is_template: true, publication_status: "published", is_current: true, version: 1, workout_type: "strength", structure: { schedule: [{ day_index: 1, name: "Жим", exercises: [{ exercise_id: exerciseId, name_ru: "Жим лёжа", sets: 3, reps: "10" }] }] } };
const profile = { id: owner, telegram_id: null, username: "offline-qa", anthropometry: {}, goals: { onboarding_completed: true, active_program_id: programId, active_program_next_day: 1, active_program_week_phase: "medium", active_program_phase_source: "manual", activation_checklist: { version: 1, started_at: "2026-09-01T00:00:00Z", dismissed_at: "2026-09-02T00:00:00Z", signals: [] } }, subscription_status: "free", stars_balance: 0, onboarding_completed: true, legal_status: acceptedLegalStatus(owner) };
const exercise = { id: exerciseId, name_ru: "Жим лёжа", muscle_group: "грудь", equipment: "штанга", difficulty: 2, tags: [] };
const plan = { title: "Жим", day_index: 1, week_phase: "medium", exercises: [{ exercise_id: exerciseId, name_ru: "Жим лёжа", order: 1, target_sets: 3, target_reps: "10", rest_sec: 60 }] };
const schedule = { requested_date: "2026-10-09", current: { original_date: "2026-10-09", target_date: "2026-10-09", start_time: "06:00:00", title: "Жим", program_id: programId, day_index: 1, status: "scheduled", is_override: false, can_reschedule: false }, next: null };
let server: Server;
let requests = 0;
let failCatalog = false;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    requests++;
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5189");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") { res.end(); return; }
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname;
    if (failCatalog && path === "/programs") { res.statusCode=503; res.end(JSON.stringify({detail:"Unavailable"})); return; }
    let data: unknown;
    if (path === "/users/me") data = profile;
    else if (path === "/legal/status") data = profile.legal_status;
    else if (path === "/programs") data = { items: [program], total: 1 };
    else if (path === "/programs/mine") data = { items: [], total: 0 };
    else if (path === `/programs/${programId}`) data = program;
    else if (path === "/exercises") data = { items: [exercise], total: 1, page: 1, page_size: 200 };
    else if (path === "/workouts/offline-context") data = { version: 1, owner, schedule_fingerprint: "0".repeat(64), prepared_at: "2026-10-09T08:00:00Z", start: "2026-10-09", end: "2026-10-09", program, days: [{ requested_date: "2026-10-09", schedule }], plans: [{ scheduled_date: "2026-10-09", day_index: 1, week_phase: "medium", readiness: "normal", plan }] };
    else if (path === "/workouts/load-hints") data = { items: [{ exercise_id: exerciseId, weight: 50, reps: 10, duration_sec: null, weight_mode: "total", machine_params: null, rpe: 7, completed_date: "2026-10-08", phase_loads: {} }] };
    else if (path === "/workouts/schedule/overview") data = schedule;
    else if (path === "/workouts/schedule/settings") data = { version: 1, days: [0, 2, 4], start_time: "06:00:00" };
    else if (path === "/workouts/planned-plan") data = plan;
    else if (path === "/workouts/illness") data = { active: false, started_on: null, recovery_choice_pending: false, recovery_light_cycle_active: false };
    else if (path === "/workouts/history") data = { items: [], total: 0 };
    else { res.statusCode = 404; data = { detail: "QA endpoint unavailable" }; }
    if (failCatalog && path === "/workouts/offline-context") setTimeout(() => res.end(JSON.stringify(data)), 600);
    else res.end(JSON.stringify(data));
  });
  await new Promise<void>(resolve => server.listen(19189, "127.0.0.1", resolve));
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
for (const width of [320, 393, 1440]) {
  test(`PWA cold launch offline preserves program and plan at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.clock.setFixedTime(new Date("2026-10-09T12:00:00Z"));
    await page.addInitScript(() => localStorage.setItem("fitness_jwt", "offline-context-qa"));
    await page.goto("/train");
    await expect(page.getByText("Офлайн программа", { exact: true }).first()).toBeVisible();
    await page.waitForFunction(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open("fitness_offline_v1"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      try { return await new Promise<boolean>(resolve => { const req = db.transaction("meta").objectStore("meta").get("offline-workout:v1:22222222-2222-4222-8222-222222222222:header"); req.onsuccess = () => resolve(Boolean(req.result)); }); }
      finally { db.close(); }
    });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true })); });
    const before = requests;
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("Офлайн программа", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Начать ·/ })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: /Программы тренировок.*Выбрать программу/ }).click();
    await expect(page.getByText("Офлайн программа", { exact: true }).first()).toBeVisible();
    expect(requests).toBe(before);
  });
}

test("prepared program appears when online catalog fails before context hydration", async ({page}) => {
  failCatalog=true;
  try {
    await page.clock.setFixedTime(new Date("2026-10-09T12:00:00Z"));
    await page.addInitScript(() => localStorage.setItem("fitness_jwt", "offline-context-qa"));
    await page.goto("/programs");
    await expect(page.getByText("Офлайн программа", {exact:true}).first()).toBeVisible({timeout:15000});
    await expect(page.getByRole("button", {name:/Начать сегодня/}).first()).toBeEnabled();
  } finally { failCatalog=false; }
});
