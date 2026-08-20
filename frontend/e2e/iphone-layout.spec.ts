import { expect, test } from "@playwright/test";

test("browser login remains usable in an iPhone-sized WebKit viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Вход или регистрация по электронной почте")).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    rootHeight: document.getElementById("root")?.getBoundingClientRect().height ?? 0,
    innerHeight: window.innerHeight,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.rootHeight).toBeGreaterThanOrEqual(dimensions.innerHeight - 1);

  const email = page.getByLabel("Электронная почта");
  await expect(email).toBeVisible();
  const fontSize = await email.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
  await email.fill("iphone@example.test");
  await expect(email).toHaveValue("iphone@example.test");

  const nav = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
});
