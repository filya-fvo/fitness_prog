import { expect, test } from "@playwright/test";
const body = "# Полная инструкция\n\nСуперсет и трисет: выберите упражнения.\n";
for (const width of [320, 393, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`public guide downloads at ${width}px ${theme}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 820 });
    await page.emulateMedia({ colorScheme: theme });
    await context.route("**/guides/user", route => route.fulfill({ contentType: "text/markdown; charset=utf-8", headers: { "Content-Disposition": 'attachment; filename="Fitness_Mini_App_Instrukciya.md"' }, body }));
    await page.goto("/help");
    await expect(page.getByRole("button", { name: "Скачать инструкцию администратора" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Скачать инструкцию пользователя" })).toBeVisible();
    const saved = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать инструкцию пользователя" }).click();
    const download = await saved;
    expect(download.suggestedFilename()).toBe("Fitness_Mini_App_Instrukciya.md");
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("utf8")).toBe(body);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test("administrator guide uses authorization and retries after a download error", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "guide-admin-token"));
  let attempts = 0;
  await page.route("**/guides/admin", route => {
    expect(route.request().headers().authorization).toBe("Bearer guide-admin-token");
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 503, json: { detail: "Попробуйте позже" } }) : route.fulfill({ contentType: "text/markdown", body });
  });
  await page.goto("/e2e/fixtures/guide-downloads.html?admin");
  const button = page.getByRole("button", { name: "Скачать инструкцию администратора" });
  await button.click();
  await expect(page.getByRole("alert")).toContainText("Не удалось скачать");
  await expect(button).toBeEnabled();
  const saved = page.waitForEvent("download");
  await button.click();
  expect((await saved).suggestedFilename()).toBe("Fitness_Mini_App_Admin_Instrukciya.md");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("late administrator file is discarded after logout", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route("**/guides/admin", async route => { requested = true; await held; await route.fulfill({ contentType: "text/markdown", body }); });
  await page.goto("/e2e/fixtures/guide-downloads.html?admin");
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.getByRole("button", { name: "Скачать инструкцию администратора" }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  release();
  await expect(page.getByRole("button", { name: "Скачать инструкцию администратора" })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(downloads).toBe(0);
});
