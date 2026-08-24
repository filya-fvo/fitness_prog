import { expect, test } from "@playwright/test";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_ID = "44444444-4444-4444-8444-444444444444";

test("opening the app retries an exhausted offline workout without deleting it", async ({ page }) => {
  let createRequests = 0;
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: null,
      username: "sync-user",
      auth_email: null,
      anthropometry: {},
      goals: { onboarding_completed: true },
      subscription_status: "free",
      stars_balance: 0,
      onboarding_completed: true,
    }),
  }));
  await page.route("**/workouts", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    createRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: SERVER_ID,
        user_id: USER_ID,
        program_id: null,
        scheduled_date: "2026-08-24",
        status: "planned",
        ai_notes: null,
        rpe: null,
        started_at: "2026-08-24T10:00:00Z",
        completed_at: null,
        title: "Своя тренировка",
        workout_type: "custom",
        plan: { exercises: [] },
        duration_sec: null,
        sets: [],
      }),
    });
  });

  await page.goto("/");
  await expect.poll(() => page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const row = databases.find((item) => item.name === "fitness_offline_v1");
    if (!row) return false;
    const request = indexedDB.open("fitness_offline_v1");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const ready = database.objectStoreNames.contains("syncQueue");
    database.close();
    return ready;
  })).toBe(true);
  await page.evaluate(async ({ userId, clientId }) => {
    const request = indexedDB.open("fitness_offline_v1");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("syncQueue", "readwrite");
      tx.objectStore("syncQueue").put({
        id: "exhausted-create",
        ownerUserId: userId,
        type: "create_workout",
        clientWorkoutId: clientId,
        payload: { scheduledDate: "2026-08-24", exerciseIds: [], programId: null },
        createdAt: Date.now(),
        attempts: 5,
        lastError: "Network Error",
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, { userId: USER_ID, clientId: CLIENT_ID });

  await page.reload();
  await expect.poll(() => createRequests).toBe(1);
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open("fitness_offline_v1");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const tx = database.transaction("syncQueue", "readonly");
      const countRequest = tx.objectStore("syncQueue").count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
    database.close();
    return count;
  })).toBe(0);
});

test("temporary API failure keeps a complete custom workout plan locally", async ({ page }) => {
  const exerciseId = "55555555-5555-4555-8555-555555555555";
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: null,
      username: "offline-create-user",
      auth_email: null,
      anthropometry: {},
      goals: { onboarding_completed: true },
      subscription_status: "free",
      stars_balance: 0,
      onboarding_completed: true,
    }),
  }));
  await page.route(/\/exercises(?:\?|$)/, async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      items: [{
        id: exerciseId,
        name_ru: "Тяга верхнего блока",
        muscle_group: "Спина",
        equipment: "Тренажёр",
        description: null,
        technique: null,
        common_mistakes: null,
        difficulty: 2,
        video_url: null,
        animation_url: null,
        thumbnail_url: null,
        media_duration_sec: null,
        media_source: "none",
        tags: [],
      }],
      total: 1,
      page: 1,
      page_size: 200,
    }),
  }));
  await page.route("**/workouts/history", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }));
  await page.route("**/workouts", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"down"}' });
      return;
    }
    await route.fallback();
  });

  await page.goto("/workouts");
  await page.getByRole("button", { name: "Выбрать в тренировку" }).click();
  await page.getByRole("button", { name: /Начать .*\(1\)/ }).click();
  await expect(page).toHaveURL(/\/workouts\/active\//);

  const queued = await page.evaluate(async () => {
    const request = indexedDB.open("fitness_offline_v1");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<Array<{ type: string; payload: Record<string, unknown> }>>(
      (resolve, reject) => {
        const tx = database.transaction("syncQueue", "readonly");
        const rowsRequest = tx.objectStore("syncQueue").getAll();
        rowsRequest.onsuccess = () => resolve(rowsRequest.result);
        rowsRequest.onerror = () => reject(rowsRequest.error);
      },
    );
    database.close();
    return rows.find((item) => item.type === "create_workout")?.payload ?? null;
  });
  expect(queued).toMatchObject({
    exerciseIds: [exerciseId],
    workoutType: "custom",
    setsPerExercise: 3,
    plan: {
      workout_type: "custom",
      exercises: [{ exercise_id: exerciseId, target_sets: 3, target_reps: "8-12" }],
    },
  });
});
