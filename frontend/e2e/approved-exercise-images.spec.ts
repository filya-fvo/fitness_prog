import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync("../backend/scripts/seed_content/exercises.json", "utf8")) as Array<{
  name_ru: string; image_url: string; thumbnail_url: string; animation_url: string;
}>;
const deadbug = seed.find((item) => item.name_ru === "Мёртвый жук")!;
const exerciseId = "33333333-3333-4333-8333-333333333333";

for (const [width, height, colorScheme] of [
  [320, 568, "light"], [375, 667, "light"], [393, 844, "light"],
  [393, 844, "dark"], [1440, 844, "dark"],
] as const) {
  test(`approved illustration uses all phases and list uses initial phase at ${width}px ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
    await page.route("**/users/me", (route) => route.fulfill({ json: {
      id: "22222222-2222-4222-8222-222222222222", telegram_id: null,
      username: "qa", auth_email: null, anthropometry: {},
      goals: { onboarding_completed: true }, onboarding_completed: true,
      subscription_status: "free", stars_balance: 0,
    } }));
    await page.route(/\/exercises(?:\?|$)/, (route) => route.fulfill({ json: {
      items: [{ ...deadbug, id: exerciseId }], total: 1, page: 1, page_size: 100,
    } }));

    await page.goto("/workouts");
    const open = page.getByRole("button", { name: "Открыть технику: Мёртвый жук" });
    const thumbnail = open.locator("img");
    await expect(thumbnail).toHaveAttribute("src", deadbug.thumbnail_url);
    await expect(thumbnail).toHaveJSProperty("complete", true);
    expect(await thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await open.click();
    const dialog = page.getByRole("dialog", { name: "Мёртвый жук" });
    const photo = dialog.getByRole("img", { name: "Фото: Мёртвый жук" });
    await expect(photo).toHaveAttribute("src", deadbug.image_url);
    await expect(photo).toHaveJSProperty("naturalWidth", 2020);
    await expect(photo).toHaveCSS("object-fit", "contain");
    const bounds = await photo.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `../artifacts/exercise-images-release-2026-10-01/card-${width}-${colorScheme}.png` });
    await dialog.getByRole("button", { name: "Анимация", exact: true }).click();
    await expect(dialog.getByRole("img", { name: "Мёртвый жук", exact: true })).toHaveAttribute("src", deadbug.animation_url);
  });
}
