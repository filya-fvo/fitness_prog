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
    await expect(page.locator("#faq-reschedule")).toContainText(/перенести/i);
  });

  test("legacy URLs keep both grouped content types and their familiar order", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Как сделать" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Знания" })).toBeVisible();
    await expect(page.getByText("С чего начать после регистрации")).toBeVisible();

    await page.goto("/knowledge");
    await expect(page.getByRole("heading", { name: "Знания" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Как сделать" })).toBeVisible();
    await expect(page.getByText("Как подобрать рабочий вес")).toBeVisible();
  });

  test("deep link opens and focuses the requested answer", async ({ page }) => {
    await page.goto("/faq?article=nutrition-label");
    const article = page.locator("#faq-nutrition-label");
    await expect(article).toHaveAttribute("open", "");
    await expect(article.locator("summary")).toBeFocused();
    await expect(article).toContainText("Если этикетка не распозналась");
  });

  test("each topic keeps how-to and knowledge grouped together", async ({ page }) => {
    await page.goto("/faq");
    await page.getByRole("button", { name: "Питание", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Как сделать" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Знания" })).toBeVisible();
    await expect(page.getByText("Как добавить продукт или блюдо")).toBeVisible();
    await expect(page.getByText("Сколько белка нужно при тренировках")).toBeVisible();
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
