import type { Page } from "@playwright/test";
const owner = "22222222-2222-4222-8222-222222222222";

export function quickComplete(page: Page) {
  return page.getByRole("list", { name: "Подходы упражнения" })
    .getByRole("button", { name: "Готово", exact: true })
    .and(page.locator("button:enabled"));
}

export async function openSetEditor(page: Page, setNumber = 1) {
  await page.getByRole("button", { name: `Править подход ${setNumber}`, exact: true }).click();
  return page.getByRole("dialog");
}

export async function openPartEditor(page: Page, partNumber: number) {
  await page.getByRole("button", { name: `Править часть ${partNumber}`, exact: true }).click();
  return page.getByRole("dialog");
}

export async function applySetWeight(page: Page, weight: string, setNumber = 1) {
  const editor = await openSetEditor(page, setNumber);
  await editor.getByRole("textbox", { name: "Точный вес, кг", exact: true }).fill(weight);
  await editor.getByRole("button", { name: "Применить", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
}

export async function installTimingApi(page: Page, delaySet = false, autoAdvance = true) {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "execution-e2e"));
  const writes: Array<{ parts: Array<{ status: string }>; base_execution_revision: number; is_skipped?: boolean; is_completed?: boolean }> = [];
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
      ...body, execution_revision: (body.base_execution_revision ?? 0) + 1, is_completed: !Array.isArray(body.parts) || body.execution_kind === "standard" ? body.is_completed : body.parts.every((part: { status: string }) => part.status !== "pending") && body.parts.some((part: { status: string }) => part.status === "completed") } });
  });
  return { writes, release: () => release?.() };
}
