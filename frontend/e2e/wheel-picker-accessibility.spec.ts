import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/fixtures/wheel-picker.html");
});

test("wheel supports keyboard, held keys, bounded options, clicking and external presets", async ({ page }) => {
  const wheel = page.getByRole("listbox", { name: "Повторения", exact: true });
  await wheel.focus();
  await expect(wheel).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("Выбрано")).toHaveText("5");
  await page.keyboard.down("ArrowDown");
  await page.keyboard.down("ArrowDown");
  await page.keyboard.up("ArrowDown");
  await expect(page.getByLabel("Выбрано")).toHaveText("9");
  await page.keyboard.press("Home");
  await expect(page.getByLabel("Выбрано")).toHaveText("1");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByLabel("Выбрано")).toHaveText("1");
  await wheel.evaluate((element) => { element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, repeat: true })); });
  await expect(page.getByLabel("Выбрано")).toHaveText("5");
  await wheel.getByRole("option", { name: "5", exact: true }).click();
  await expect(page.getByLabel("Выбрано")).toHaveText("5");
  await page.getByRole("combobox", { name: "Повторения: выбрать значение" }).selectOption("3");
  await expect(page.getByLabel("Выбрано")).toHaveText("3");
  await page.getByRole("button", { name: "Пресет", exact: true }).click();
  await expect(wheel.getByRole("option", { name: "5", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Большой пресет" }).click();
  await expect(page.getByLabel("Выбрано")).toHaveText("100");
  await expect(page.getByRole("combobox", { name: "Повторения: выбрать значение" })).toHaveValue("100");
  await wheel.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByLabel("Выбрано")).toHaveText("9");
});

test("scroll stays usable and respects reduced motion when settling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const wheel = page.getByRole("listbox", { name: "Повторения", exact: true });
  await page.waitForTimeout(100);
  await wheel.evaluate((element) => {
    const target = element as HTMLElement;
    target.scrollTo = (options?: ScrollToOptions | number) => {
      if (typeof options === "object") {
        target.dataset.behavior = options.behavior;
        target.scrollTop = options.top ?? target.scrollTop;
      }
    };
    target.scrollTop = 132;
    target.dispatchEvent(new Event("scroll"));
  });
  await expect(page.getByLabel("Выбрано")).toHaveText("9");
  await page.waitForTimeout(200);
  expect(await wheel.getAttribute("data-behavior")).not.toBe("smooth");
});

test("set modal exposes minute, second, rest and note fields and retains focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const opener = page.getByRole("button", { name: "Открыть подход" });
  await opener.focus();
  await expect(opener).toBeFocused();
  // Keyboard activation preserves the opener focus Safari does not give pointer clicks.
  await opener.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  await dialog.getByRole("combobox", { name: "Минуты: выбрать значение" }).selectOption("2");
  await dialog.getByRole("listbox", { name: "Секунды", exact: true }).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await dialog.getByLabel("Отдых после подхода").selectOption("90");
  await dialog.getByRole("button", { name: "Добавить примечание" }).click();
  await dialog.getByLabel("Примечание (по желанию)").fill("Под контролем");
  await dialog.getByRole("button", { name: "Применить" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Закрыть" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const locator of [dialog.getByRole("combobox", { name: "Минуты: выбрать значение" }), dialog.getByRole("button", { name: "Закрыть" })]) {
    const box = await locator.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate((next) => { document.documentElement.dataset.theme = next; }, theme);
    for (const width of [320, 375, 393, 1440]) {
      await page.setViewportSize({ width, height: 700 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(dialog.getByRole("combobox", { name: "Минуты: выбрать значение" })).toHaveValue("2");
    }
  }
  await page.setViewportSize({ width: 320, height: 480 });
  await dialog.getByRole("listbox", { name: "Минуты", exact: true }).focus();
  const shortBox = await dialog.boundingBox();
  expect(shortBox?.height).toBeLessThanOrEqual(480);
  await dialog.screenshot({ path: "../artifacts/audit-fixes-20261003/wheel-modal-320.png" });
  await dialog.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByLabel("Результат")).toContainText('"durationSec":121');
  await expect(page.getByLabel("Результат")).toContainText('"restTimeSec":90');
  await expect(page.getByLabel("Результат")).toContainText('"note":"Под контролем"');
  await expect(page.getByRole("button", { name: "Открыть подход" })).toBeFocused();
});

test("set modal provides associated labels for rest and optional note", async ({ page }) => {
  await page.getByRole("button", { name: "Открыть подход" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить подход" });
  await expect(dialog.getByLabel("Отдых после подхода")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Добавить примечание" }).click();
  await expect(dialog.getByLabel("Примечание (по желанию)")).toHaveCount(1);
});
