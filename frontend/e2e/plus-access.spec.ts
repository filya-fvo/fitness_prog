import { expect, test, type Page } from "@playwright/test";

const USER_ID = "91919191-9191-4191-8191-919191919191";

function profile(tier: "free" | "plus") {
  return {
    id: USER_ID,
    telegram_id: null,
    username: "plus-boundary-qa",
    auth_email: null,
    anthropometry: {},
    goals: { onboarding_completed: true },
    subscription: {
      tier,
      active: tier === "plus",
      sources: tier === "plus" ? ["qa"] : [],
      valid_until: null,
    },
    subscription_status: tier,
    stars_balance: 0,
    onboarding_completed: true,
  };
}

async function authenticate(page: Page, tier: "free" | "plus") {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "plus-access-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(profile(tier)),
  }));
}

test("FREE progress shows a product gate without requesting history", async ({ page }) => {
  await authenticate(page, "free");
  const premiumRequests: string[] = [];
  page.on("request", (request) => {
    if (/workouts\/history|workouts\/regularity|nutrition\/range|daily-metrics\/range|measurements\/analytics/.test(request.url())) {
      premiumRequests.push(request.url());
    }
  });

  await page.goto("/progress");
  await expect(page.getByText("Подробный прогресс доступен в PLUS")).toBeVisible();
  await expect(page.getByRole("link", { name: "Что входит в PLUS" })).toBeVisible();
  await page.waitForTimeout(250);
  expect(premiumRequests).toEqual([]);

  await page.evaluate(async (userId) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("fitness_offline_v1");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("workouts", "readwrite");
      tx.objectStore("workouts").put({
        id: "92929292-9292-4292-8292-929292929292",
        user_id: userId,
        status: "completed",
        title: "Скрытая старая тренировка",
        sets: [],
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  }), USER_ID);
  await page.reload();
  await expect(page.getByText("Скрытая старая тренировка")).toHaveCount(0);
  expect(premiumRequests).toEqual([]);
});

test("FREE measurements keep today's form and never request the range", async ({ page }) => {
  await authenticate(page, "free");
  let rangeRequests = 0;
  await page.route(/\/measurements\/range(?:\?.*)?$/, (route) => {
    rangeRequests += 1;
    return route.fulfill({ status: 500, body: "unexpected" });
  });
  await page.route(/\/measurements\/daily(?:\?.*)?$/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ date: new URL(route.request().url()).searchParams.get("date"), sources: {} }),
  }));

  await page.goto("/measurements");
  await expect(page.getByRole("button", { name: "Сохранить замер" })).toBeVisible();
  await expect(page.getByText("История замеров доступна в PLUS")).toBeVisible();
  await expect(page.getByRole("button", { name: "‹" })).toHaveCount(0);
  expect(rangeRequests).toBe(0);

  await page.evaluate(async (userId) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("fitness_offline_v1");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("bodyMeasurements", "readwrite");
      tx.objectStore("bodyMeasurements").put({
        key: `${userId}:2025-01-01`, ownerUserId: userId, date: "2025-01-01",
        measurement: { date: "2025-01-01", note: "Скрытая старая запись", waist_cm: 80, sources: {} },
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  }), USER_ID);
  await page.reload();
  await expect(page.getByText("Скрытая старая запись")).toHaveCount(0);
  expect(rangeRequests).toBe(0);
});

test("a live downgrade closes progress without logging the user out", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "plus-access-e2e"));
  let free = false;
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(profile(free ? "free" : "plus")),
  }));
  await page.route("**/workouts/history", (route) => {
    free = true;
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          code: "plus_required",
          feature: "workout_history",
          message: "История тренировок доступна в PLUS",
        },
      }),
    });
  });

  await page.goto("/progress");
  await expect(page.getByText("Подробный прогресс доступен в PLUS")).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Основная навигация/i })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBe("plus-access-e2e");
});

test("beta PLUS notice is shown once and remains dismissed", async ({ page }) => {
  await authenticate(page, "plus");
  await page.goto("/more");
  await expect(page.getByText("PLUS открыт бесплатно")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть сообщение о PLUS" }).click();
  await page.reload();
  await expect(page.getByText("PLUS открыт бесплатно")).toHaveCount(0);
});
