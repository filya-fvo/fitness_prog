import { expect, test } from "@playwright/test";

const USER = "42424242-4242-4424-8424-424242424242";
const points = Array.from({ length: 12 }, (_, index) => ({
  date: `2026-09-${String(index + 18).padStart(2, "0")}`,
  waist_cm: 80.125 + index * 0.125,
  bicep_cm: 30.25 + index * 0.25,
  note: null,
}));

for (const width of [320, 393, 1440]) {
  test(`measurement chart exposes all exact selected values and readable HTML labels at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.clock.install({ time: new Date("2026-10-03T10:00:00+03:00") });
    await page.addInitScript(() => localStorage.setItem("fitness_jwt", "measurement-chart-e2e"));
    await page.route("**/users/me", (route) => route.fulfill({ json: {
      id: USER, telegram_id: 42, username: "Filatov_Slava", anthropometry: {}, goals: { onboarding_completed: true },
      subscription_status: "plus", subscription: { tier: "plus", active: true, sources: ["qa"], valid_until: null },
      stars_balance: 0, onboarding_completed: true,
    } }));
    await page.route("**/measurements/daily?*", (route) => route.fulfill({ json: {
      date: new URL(route.request().url()).searchParams.get("date"), note: null,
    } }));
    await page.route("**/measurements/range?*", (route) => route.fulfill({ json: { start: "2025-10-03", end: "2026-10-03", items: points } }));
    await page.goto("/measurements");
    await expect(page.getByRole("img", { name: "Динамика замеров" })).toBeVisible();
    const expand = page.getByText("Точные значения (12)", { exact: true });
    await expect(expand).toBeVisible();
    const labels = page.getByRole("group", { name: "Подписи графика замеров" });
    await expect(labels).toBeVisible();
    const sizes = await labels.locator("span").evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    await expand.focus();
    await page.keyboard.press("Enter");
    const table = page.getByRole("table", { name: "Динамика замеров: Талия, см", exact: true });
    await expect(table.getByRole("row")).toHaveCount(13);
    for (const point of points) await expect(table.getByRole("cell", { name: `${String(point.waist_cm).replace(".", ",")} см`, exact: true })).toBeVisible();
    await page.getByLabel("Показатель на графике").selectOption("bicep_cm");
    const armTable = page.getByRole("table", { name: "Динамика замеров: Бицепс, см", exact: true });
    await expect(armTable.getByRole("row")).toHaveCount(13);
    for (const point of points) await expect(armTable.getByRole("cell", { name: `${String(point.bicep_cm).replace(".", ",")} см`, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
