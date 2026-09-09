import { expect, test } from "@playwright/test";

const USER_ID = "a1111111-1111-4111-8111-111111111111";
const EXERCISE_ID = "a2222222-2222-4222-8222-222222222222";

const exercise = {
  id: EXERCISE_ID,
  name_ru: "Жим гантелей лёжа",
  muscle_group: "chest",
  secondary_muscle_groups: [],
  equipment: "dumbbells",
  description: "Контролируемое движение",
  technique: "Сведите лопатки",
  common_mistakes: null,
  difficulty: 2,
  video_url: null,
  animation_url: null,
  thumbnail_url: null,
  media_duration_sec: null,
  media_source: "none",
  tags: [],
  limitations: [],
  weight_rule: "per_hand",
};

test("PLUS exercise explorer supports recent, groups, pins and deep links", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript((userId) => {
    localStorage.setItem("fitness_jwt", "exercise-explorer-e2e");
    localStorage.setItem(`fitness_notice:beta-plus-2026-09:${userId}`, "dismissed");
  }, USER_ID);
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: null,
      username: "explorer-user",
      auth_email: null,
      anthropometry: {},
      goals: { onboarding_completed: true },
      subscription: { tier: "plus", active: true, sources: ["qa"], valid_until: null },
      subscription_status: "plus",
      stars_balance: 0,
      onboarding_completed: true,
    }),
  }));
  let pinned = false;
  const seenQueries: string[] = [];
  const seenGroups: string[] = [];
  await page.route(/\/exercises\/explorer(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope");
    seenQueries.push(url.searchParams.get("q") ?? "");
    seenGroups.push(url.searchParams.get("muscle_group") ?? "");
    const visible = scope !== "pinned" || pinned;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: visible ? [{
          ...exercise,
          is_pinned: pinned,
          last_completed_date: "2026-09-08",
          completed_workouts: 4,
        }] : [],
        total: visible ? 1 : 0,
        page: 1,
        page_size: 20,
        muscle_groups: ["chest", "back"],
        pin_limit: 8,
      }),
    });
  });
  await page.route(new RegExp(`/exercises/${EXERCISE_ID}$`), (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(exercise),
  }));
  await page.route(new RegExp(`/exercises/${EXERCISE_ID}/pin$`), (route) => {
    if (route.request().method() === "PUT") pinned = true;
    if (route.request().method() === "DELETE") pinned = false;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        exercise_id: EXERCISE_ID,
        is_pinned: pinned,
        pinned_count: pinned ? 1 : 0,
        pin_limit: 8,
      }),
    });
  });
  await page.route(`**/workouts/exercises/${EXERCISE_ID}/progress**`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      exercise_id: EXERCISE_ID,
      period_start: "2025-09-10",
      period_end: "2026-09-09",
      points: [],
      summary: {
        total_weight: { latest: null, best: null, change: null },
        estimated_1rm: { latest: null, best: null, change: null },
      },
      diary: [],
      next_diary_cursor: null,
    }),
  }));

  await page.goto("/progress/exercises");
  await expect(page.getByRole("heading", { name: "Упражнения" })).toBeVisible();
  await expect(page.getByText("Жим гантелей лёжа")).toBeVisible();
  await expect(page.getByRole("button", { name: "Грудь", exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("exercise-explorer-mobile.png", { fullPage: true });

  await page.getByRole("searchbox", { name: "Поиск упражнения" }).fill("гантел");
  await expect.poll(() => seenQueries).toContain("гантел");
  await page.getByRole("button", { name: "Грудь", exact: true }).click();
  await expect.poll(() => seenGroups).toContain("chest");

  await page.getByRole("button", { name: "Закрепить упражнение" }).click();
  await expect(page.getByRole("button", { name: "Открепить упражнение" })).toBeVisible();
  await page.getByRole("button", { name: "Закреплённые" }).click();
  await expect(page.getByText("Жим гантелей лёжа")).toBeVisible();

  await page.getByText("Жим гантелей лёжа").click();
  await expect(page).toHaveURL(new RegExp(`exercise=${EXERCISE_ID}`));
  await expect(page.getByRole("dialog", { name: "Жим гантелей лёжа" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page).not.toHaveURL(/exercise=/);

  await page.goto(`/progress/exercises?exercise=${EXERCISE_ID}`);
  await expect(page.getByRole("dialog", { name: "Жим гантелей лёжа" })).toBeVisible();
});
