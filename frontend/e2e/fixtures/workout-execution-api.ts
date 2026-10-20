import type { Page } from "@playwright/test";
const owner = "22222222-2222-4222-8222-222222222222";
export async function installTimingApi(page: Page, delaySet = false, autoAdvance = true) {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "execution-e2e"));
  const writes: Array<{ parts: Array<{ status: string }>; base_execution_revision: number }> = [];
  let release: (() => void) | null = null;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/users/me", route => route.fulfill({ json: { id: owner, anthropometry: {}, goals: { auto_advance_exercises: autoAdvance },
    subscription_status: "plus", stars_balance: 0, onboarding_completed: true } }));
  await page.route(/\/exercises(?:\?|$)/, route => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 200 } }));
  await page.route("**/workouts/load-hints", route => route.fulfill({ json: { items: [] } }));
  await page.route("**/notifications/**", route => route.fulfill({ json: { ok: true } }));
  await page.route("**/workouts/*/sets", async route => {
    const body = route.request().postDataJSON();
    writes.push(body);
    if (delaySet) await held;
    return route.fulfill({ json: { id: "66666666-6666-4666-8666-666666666666", workout_id: "11111111-1111-4111-8111-111111111111",
      ...body, execution_revision: body.base_execution_revision + 1, is_completed: body.parts.every((part: { status: string }) => part.status !== "pending") } });
  });
  return { writes, release: () => release?.() };
}
