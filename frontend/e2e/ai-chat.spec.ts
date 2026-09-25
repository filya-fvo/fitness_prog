import { expect, test } from "@playwright/test";

test("AI trainer shows unauthenticated feedback in a unified error card", async ({ page }) => {
  await page.goto("/ai");
  await expect(page.getByText(/Привет! Я локальный ИИ-тренер/))
    .toHaveClass(/app-card/);
  await expect(page.getByRole("button", { name: "Почему болят колени?" }))
    .toHaveClass(/app-chip/);
  await expect(page.getByRole("textbox", { name: "Сообщение тренеру" }))
    .toHaveClass(/app-field/);
  await expect(page.getByRole("button", { name: "Отправить сообщение" }))
    .toHaveClass(/app-gradient-action/);
  await page.getByRole("button", { name: "Почему болят колени?" }).click();
  await expect(page.getByText("Нужна авторизация через Telegram или электронную почту"))
    .toHaveClass(/app-card-danger/);
});
