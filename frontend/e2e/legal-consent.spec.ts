import { expect, test, type Page } from "@playwright/test";
import manifest from "../src/features/legal/documents/manifest.json" with { type: "json" };

const owner = "a428ecbd-e607-4a75-ab5e-a02394815c8f";
const receipt = (accepted: boolean) => ({ user_id: owner, accepted, documents: manifest.map((doc) => ({ document_id: doc.document_id, title: doc.title, revision: doc.revision, text_sha256: doc.text_sha256, accepted_at: accepted ? "2026-10-08T10:00:00Z" : null })) });

async function setup(page: Page, initialAccepted = false, failFirst = false) {
  let accepted = initialAccepted;
  let attempts = 0;
  const profile = () => ({ id: owner, username: "legal-tester", subscription_status: "free", onboarding_completed: true, goals: {}, anthropometry: {}, stars_balance: 0, legal_status: receipt(accepted) });
  await page.addInitScript((user) => {
    localStorage.setItem("fitness_jwt", "legal-test-session");
    localStorage.setItem("fitness_cached_user_v1", JSON.stringify(user));
    localStorage.setItem("legal-diary-sentinel", "must-stay");
  }, profile());
  await page.route("**/users/me", (route) => route.fulfill({ json: profile() }));
  await page.route("**/legal/status", (route) => route.fulfill({ json: receipt(accepted) }));
  await page.route("**/legal/accept", async (route) => {
    attempts += 1;
    const body = route.request().postDataJSON();
    expect(body.documents).toHaveLength(3);
    expect(body.documents.every((doc: { accepted: boolean }) => doc.accepted === true)).toBe(true);
    if (failFirst && attempts === 1) { await route.fulfill({ status: 503, json: { detail: "Попробуйте снова" } }); return; }
    accepted = true;
    await route.fulfill({ json: receipt(true) });
  });
  return { markAcceptedElsewhere: () => { accepted = true; }, attempts: () => attempts };
}

for (const [width, theme] of [320, 393, 1440].flatMap((width) => ["light", "dark"].map((theme) => [width, theme] as const))) {
  test(`legal three separate choices and once per account at ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const state = await setup(page);
    await page.goto("/profile");
    const dialog = page.getByRole("dialog", { name: "Документы FilFit" });
    await expect(dialog).toBeVisible();
    await page.evaluate((selectedTheme) => { document.documentElement.dataset.theme = selectedTheme; }, theme);
    await page.screenshot({ path: `artifacts/legal-consent/gate-${width}-${theme}.png`, fullPage: true });
    const checks = dialog.getByRole("checkbox");
    await expect(checks).toHaveCount(3);
    for (const check of await checks.all()) await expect(check).not.toBeChecked();
    const confirm = dialog.getByRole("button", { name: "Подтвердить и продолжить" });
    await expect(confirm).toBeDisabled();
    await checks.nth(0).check(); await checks.nth(1).check();
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("button", { name: "Прочитать согласие" }).click();
    await expect(dialog.getByRole("heading", { name: "Согласие на обработку персональных данных FilFit" })).toBeVisible();
    await dialog.getByRole("button", { name: "К подтверждению" }).click();
    await expect(checks.nth(0)).toBeChecked();
    await checks.nth(2).check();
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Профиль", exact: true })).toBeVisible();
    expect(state.attempts()).toBe(1);
    await page.reload();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("legal-diary-sentinel"))).toBe("must-stay");
    await page.screenshot({ path: `artifacts/legal-consent/profile-${width}.png`, fullPage: true });
  });
}

test("legal network failure keeps choices and allows retry", async ({ page }) => {
  const state = await setup(page, false, true);
  await page.goto("/profile");
  const dialog = page.getByRole("dialog", { name: "Документы FilFit" });
  for (const check of await dialog.getByRole("checkbox").all()) await check.check();
  await dialog.getByRole("button", { name: "Подтвердить и продолжить" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  for (const check of await dialog.getByRole("checkbox").all()) await expect(check).toBeChecked();
  await dialog.getByRole("button", { name: "Подтвердить и продолжить" }).click();
  await expect(dialog).toBeHidden();
  expect(state.attempts()).toBe(2);
});

test("legal documents remain public and Escape does not accept", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/profile");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(state.attempts()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("legal-diary-sentinel"))).toBe("must-stay");
  for (const id of ["privacy", "consent", "offer"]) {
    await page.goto(`/legal/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Филатов Вячеслав Олегович", { exact: false }).first()).toBeVisible();
  }
});

test("legal acceptance elsewhere is restored on focus", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/profile");
  await expect(page.getByRole("dialog")).toBeVisible();
  state.markAcceptedElsewhere();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(state.attempts()).toBe(0);
});

test("legal old cached profile offline waits for connection and preserves diary", async ({ page }) => {
  const state = await setup(page);
  await page.addInitScript(() => {
    const user = JSON.parse(localStorage.getItem("fitness_cached_user_v1")!);
    delete user.legal_status;
    localStorage.setItem("fitness_cached_user_v1", JSON.stringify(user));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  });
  await page.goto("/profile");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("Подключитесь к интернету");
  await expect(dialog.getByRole("button", { name: "Подтвердить и продолжить" })).toBeDisabled();
  expect(state.attempts()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("legal-diary-sentinel"))).toBe("must-stay");
});

test("legal accepted cached profile remains available when server is unreachable", async ({ page }) => {
  await setup(page, true);
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
  await page.route("**/users/me", (route) => route.abort());
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Профиль", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("legal focus remains in dialog and reader restores focus without acceptance", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/profile");
  const dialog = page.getByRole("dialog");
  const read = dialog.getByRole("button", { name: "Прочитать согласие" });
  await read.click();
  await expect(dialog.getByRole("button", { name: "К подтверждению" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(read).toBeFocused();
  await dialog.getByRole("button", { name: "Выйти без подтверждения" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Прочитать Политику" })).toBeFocused();
  expect(state.attempts()).toBe(0);
});

test("legal new Telegram login has unchecked choices and BackButton never accepts", async ({ page }) => {
  const state = await setup(page);
  await page.addInitScript(() => {
    localStorage.removeItem("fitness_jwt"); localStorage.removeItem("fitness_cached_user_v1");
    const callbacks: Array<() => void> = [];
    Object.assign(window, { legalBack: () => callbacks.slice().forEach((callback) => callback()) });
    window.Telegram = { WebApp: { initData: "query_id=legal-new-user", ready: () => undefined, expand: () => undefined,
      BackButton: { isVisible: false, show: () => undefined, hide: () => undefined, onClick: (cb: () => void) => callbacks.push(cb), offClick: (cb: () => void) => { const i = callbacks.indexOf(cb); if (i >= 0) callbacks.splice(i, 1); } } } };
  });
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.abort());
  await page.route("**/auth/telegram", (route) => route.fulfill({ json: { access_token: "legal-new-token", token_type: "bearer", expires_in_days: 30, user: { id: owner, subscription_status: "free", onboarding_completed: true, legal_status: receipt(false) } } }));
  await page.goto("/profile");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const checkbox of await dialog.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
  await dialog.getByRole("button", { name: "Прочитать согласие" }).click();
  await page.evaluate(() => Reflect.get(window, "legalBack")());
  await expect(dialog.getByRole("checkbox")).toHaveCount(3);
  await page.evaluate(() => Reflect.get(window, "legalBack")());
  await expect(dialog).toBeHidden();
  expect(state.attempts()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("fitness_jwt"))).toBeNull();
});

test("legal late response after owner changes cannot accept the new account", async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let saving = false;
  await page.route("**/legal/accept", async (route) => { saving = true; await wait; await route.fulfill({ json: receipt(true) }); });
  const nextOwner = "22222222-2222-4222-8222-222222222222";
  const nextStatus = { ...receipt(false), user_id: nextOwner };
  await page.goto("/profile");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const checkbox of await dialog.getByRole("checkbox").all()) await checkbox.check();
  await dialog.getByRole("button", { name: "Подтвердить и продолжить" }).click();
  try {
    await expect.poll(() => saving).toBe(true);
    await page.route("**/users/me", (route) => route.fulfill({ json: { id: nextOwner, subscription_status: "free", onboarding_completed: true, anthropometry: {}, goals: {}, stars_balance: 0, legal_status: nextStatus } }));
    await page.route("**/legal/status", (route) => route.fulfill({ json: nextStatus }));
    await page.evaluate(() => { localStorage.setItem("fitness_jwt", "next-owner-token"); window.dispatchEvent(new Event("online")); });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("fitness_cached_user_v1")!).id)).toBe(nextOwner);
    release();
    await expect(dialog).toBeVisible();
    for (const checkbox of await dialog.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fitness_cached_user_v1")!).legal_status.accepted)).toBe(false);
  } finally { release(); }
});
