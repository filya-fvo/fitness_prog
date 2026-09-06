import { expect, test } from "@playwright/test";

test.describe("unified public help and FAQ", () => {
  test("search understands common words and searches both sections", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/faq");

    await expect(page.getByRole("heading", { name: "Помощь и FAQ" })).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Поиск ответа" });
    await search.fill("таблетки");
    await expect(page.locator("#faq-supplements")).toBeVisible();
    await expect(page.locator("#faq-supplements")).toContainText("добавки");

    await search.fill("перенести пятницу");
    await expect(page.locator("#faq-reschedule")).toBeVisible();
    await expect(page.locator("#faq-reschedule")).toContainText("Перенести");
  });

  test("legacy URLs select their old content type", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("tab", { name: "Как сделать" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("С чего начать после регистрации")).toBeVisible();

    await page.goto("/knowledge");
    await expect(page.getByRole("tab", { name: "О тренировках и питании" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Как подобрать рабочий вес")).toBeVisible();
  });

  test("deep link opens and focuses the requested answer", async ({ page }) => {
    await page.goto("/faq?article=nutrition-label");
    const article = page.locator("#faq-nutrition-label");
    await expect(article).toHaveAttribute("open", "");
    await expect(article.locator("summary")).toBeFocused();
    await expect(article).toContainText("Если этикетка не распозналась");
  });

  test("tabs support arrow-key navigation", async ({ page }) => {
    await page.goto("/faq");
    const howTo = page.getByRole("tab", { name: "Как сделать" });
    const knowledge = page.getByRole("tab", { name: "О тренировках и питании" });
    await howTo.focus();
    await howTo.press("ArrowRight");
    await expect(knowledge).toBeFocused();
    await expect(knowledge).toHaveAttribute("aria-selected", "true");
  });

  test("the single entry in More returns to the previous app context", async ({ page }) => {
    await page.goto("/more");
    const entry = page.locator("section").getByRole("link", { name: /Помощь и FAQ/ });
    await expect(entry).toHaveCount(1);
    await entry.click();
    await expect(page).toHaveURL(/\/faq$/);
    await page.getByRole("button", { name: "Вернуться в приложение" }).click();
    await expect(page).toHaveURL(/\/more$/);
  });
});
