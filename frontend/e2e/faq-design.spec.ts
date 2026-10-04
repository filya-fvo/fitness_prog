import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [320, 375, 393, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`illustrated FAQ at ${width}px ${theme}`, async ({ page }, testInfo) => {
      test.skip(test.info().project.use.isMobile === true && width === 1440, "Desktop uses the desktop project");
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((preference) => {
        localStorage.setItem("fitness_theme_preference", preference);
      }, theme);
      await page.goto("/faq");
      const cards = page.locator(".faq-article-card");
      await expect(cards).toHaveCount(31);
      await expect(cards.locator(".faq-illustration[aria-hidden=true]")).toHaveCount(31);

      // Check all answers, including the longest titles, instead of only the first viewport.
      const layout = await cards.evaluateAll((elements) => elements.map((card) => {
        const heading = card.querySelector(".faq-article-heading > span")!;
        const art = card.querySelector(".faq-article-art")!;
        const description = card.querySelector(".faq-article-description")!;
        const titleRect = heading.getBoundingClientRect();
        const artRect = art.getBoundingClientRect();
        return {
          title: heading.textContent,
          overlapping: titleRect.right > artRect.left,
          overflows: card.scrollWidth > card.clientWidth || description.scrollWidth > description.clientWidth,
          scene: card.querySelector(".faq-illustration-scene")?.getAttribute("href"),
          background: getComputedStyle(card).backgroundColor,
        };
      }));
      expect(new Set(layout.map((item) => item.scene)).size).toBe(31);
      // SVG symbols live in a separate, cached asset. A halo alone must not pass as a loaded scene.
      await expect.poll(() => page.locator(".faq-illustration-scene").evaluateAll((items) =>
        items.every((item) => (item as SVGGraphicsElement).getBBox().width > 0),
      )).toBe(true);
      for (const item of layout) {
        expect(item.overlapping, item.title ?? "").toBe(false);
        expect(item.overflows, item.title ?? "").toBe(false);
        expect(item.background).not.toBe("rgba(0, 0, 0, 0)");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const topicWidths = await page.locator(".faq-topic").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
      expect(Math.max(...topicWidths) - Math.min(...topicWidths)).toBeLessThan(1);

      const shot = (name: string, fullPage = false) => page.screenshot({
        path: testInfo.outputPath(`${name}-${width}-${theme}-${testInfo.project.name}.png`), fullPage,
      });
      await shot("faq");
      if (width === 393 && test.info().project.name === "chromium") {
        await shot("faq-all", true);
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        expect(result.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([]);
      }

      await page.getByRole("button", { name: "Питание", exact: true }).click();
      await expect(page.getByRole("button", { name: "Питание", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#faq-nutrition-add .faq-illustration")).toBeVisible();
      await shot("faq-nutrition");

      const search = page.getByRole("searchbox", { name: "Поиск ответа" });
      await page.getByRole("button", { name: "Показать все", exact: true }).click();
      await search.fill("перенести пятницу");
      const answer = page.locator("#faq-reschedule");
      await answer.locator("summary").focus();
      await page.keyboard.press("Enter");
      await expect(answer).toHaveAttribute("open", "");
      await expect(answer.locator("ul")).toBeVisible();
      await shot("faq-expanded");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.keyboard.press("Enter");
      await expect(answer).not.toHaveAttribute("open", "");
    });
  }
}
