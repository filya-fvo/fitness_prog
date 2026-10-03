import { expect, test } from "@playwright/test";

const charts = ["volume", "nutrition", "load", "weekly", "wellness", "exercise"] as const;
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-03T12:00:00+03:00"));
  await page.goto("/e2e/fixtures/charts-accessibility.html");
});

test("all chart labels remain at least 12 CSS pixels on narrow and wide screens", async ({ page }) => {
  await page.locator("details").evaluateAll((details) => { details.forEach((node) => { (node as HTMLDetailsElement).open = true; }); });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((next) => { document.documentElement.dataset.theme = next; }, theme);
    for (const width of [320, 375, 393, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const chart of charts) {
        const small = await page.getByTestId(chart).evaluate((root) => {
          const result: Array<{ text: string; size: number }> = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const parent = node.parentElement;
            if (!parent || !node.textContent?.trim() || parent.closest("title,defs,style,script")) continue;
            const rect = parent.getBoundingClientRect();
            if (rect.width <= 1 || rect.height <= 1 || !parent.getClientRects().length || parent.closest("details:not([open])") && !parent.closest("summary")) continue;
            const scale = parent instanceof SVGGraphicsElement ? parent.getScreenCTM()?.a ?? 1 : 1;
            const size = parseFloat(getComputedStyle(parent).fontSize) * scale;
            if (size < 11.99) result.push({ text: node.textContent.trim(), size });
          }
          return result;
        });
        expect(small, `${chart} ${theme} at ${width}px`).toEqual([]);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("exact data for every plotted day and week is available with keyboard and touch", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const expected = [{ id: "volume", rows: 14, value: "1234.5" }, { id: "nutrition", rows: 14, value: "2100" }, { id: "load", rows: 12, value: "1234.5" }, { id: "weekly", rows: 7, value: "1243.5" }, { id: "wellness", rows: 14, value: "9000" }];
  for (const { id, rows, value } of expected) {
    const scope = page.getByTestId(id);
    const summary = scope.locator("summary");
    await expect(summary).toHaveCount(1);
    await expect(summary).toContainText("Точные значения");
    await summary.focus();
    await summary.press("Enter");
    const table = scope.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(rows);
    await expect(table).toContainText(value);
    if (isMobile) await summary.tap();
    else await summary.click();
    await expect(table).not.toBeVisible();
    if (isMobile) await summary.tap();
    else await summary.click();
    await expect(table).toBeVisible();
  }
  const nutrition = page.getByTestId("nutrition").getByRole("table");
  await expect(nutrition.getByRole("row", { name: /2026-09-21/ })).toContainText("-100");
  await expect(nutrition.getByRole("row", { name: /2026-09-22/ })).toContainText("Нет записей");
  const wellness = page.getByTestId("wellness");
  await expect(wellness.getByRole("table").getByRole("row", { name: /2026-09-22/ })).toContainText("Нет данных");
  await wellness.getByRole("button", { name: "Сон", exact: true }).click();
  await expect(wellness.getByRole("table").getByRole("row", { name: /2026-09-22/ })).toContainText("0 ч 0 мин");
  const exercise = page.getByTestId("exercise");
  const table = exercise.getByRole("table");
  await exercise.getByRole("button", { name: /Показать ещё/ }).focus();
  await exercise.getByRole("button", { name: /Показать ещё/ }).press("Enter");
  await expect(table.locator("tbody tr")).toHaveCount(14);
  await expect(table).toContainText("20.5 кг");
  const region = exercise.getByRole("region", { name: "Таблица динамики упражнения" });
  await region.focus();
  await expect(region).toBeFocused();
  await region.press("ArrowRight");
  await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("wellness uses a simple keyboard operable metric group and exercise chart follows the theme", async ({ page }) => {
  const wellness = page.getByTestId("wellness");
  await expect(wellness.getByRole("tablist")).toHaveCount(0);
  const metric = wellness.getByRole("group", { name: "Показатель" }).getByRole("button", { name: "Сон", exact: true });
  await metric.focus();
  await metric.press("Enter");
  await expect(metric).toHaveAttribute("aria-pressed", "true");
  const exercise = page.getByTestId("exercise");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const background = await exercise.getByRole("img").evaluate((node) => {
    let parent = node.parentElement;
    while (parent) {
      const color = getComputedStyle(parent).backgroundColor;
      if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
      parent = parent.parentElement;
    }
    return "transparent";
  });
  const channels = background.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  expect(channels.every((channel) => channel > 180)).toBe(true);
  await page.setViewportSize({ width: 320, height: 900 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((next) => { document.documentElement.dataset.theme = next; }, theme);
    for (const chart of charts) {
      await page.getByTestId(chart).screenshot({ path: `../artifacts/audit-fixes-20261003/charts-${theme}-${chart}-320.png` });
    }
  }
});
