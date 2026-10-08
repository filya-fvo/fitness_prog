import { acceptedLegalStatus } from "./legal-fixture";
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

test("AI conversation uses one card language for both speakers", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "ai-visual-e2e"));
  await page.route("**/users/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
legal_status: acceptedLegalStatus("11111111-1111-4111-8111-111111111111"),
      id: "11111111-1111-4111-8111-111111111111", telegram_id: null,
      username: "ai-visual", auth_email: "qa@example.test", anthropometry: {},
      goals: { onboarding_completed: true }, subscription_status: "free",
      stars_balance: 0, onboarding_completed: true,
    }),
  }));
  await page.route("**/ai/history**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      session_id: null,
      messages: [
        { id: "22222222-2222-4222-8222-222222222222", role: "user", content: "Как разминаться?", timestamp: "2026-09-27T10:00:00Z" },
        { id: "33333333-3333-4333-8333-333333333333", role: "assistant", content: "Начните с лёгкого движения.", timestamp: "2026-09-27T10:00:01Z" },
      ],
    }),
  }));
  await page.goto("/ai");
  await expect(page.getByText("Как разминаться?", { exact: true })).toHaveClass(/app-card-plum/);
  await expect(page.getByText("Начните с лёгкого движения.", { exact: true })).toHaveClass(/app-card-ocean/);
});
