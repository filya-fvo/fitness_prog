import { expect, test } from "@playwright/test";
for (const width of [320, 393]) for (const entry of ["exercise", "edit"] as const) {
  test(`group draft is in viewport after ${entry} with existing groups at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto("/e2e/fixtures/group-focus.html");
    if (entry === "exercise") await page.getByRole("region", { name: "Упражнение 11", exact: true }).getByRole("button", { name: "Суперсет / трисет", exact: true }).click();
    else await page.getByRole("button", { name: "Изменить связку", exact: true }).first().click();
    const field = page.getByRole("combobox", { name: "Вид связки", exact: true });
    await expect(field).toBeFocused();
    await expect(field).toBeInViewport({ ratio: 1 });
    if (entry === "exercise") await expect(page.getByRole("checkbox", { name: "Упражнение 11", exact: true })).toBeChecked();
  });
}
