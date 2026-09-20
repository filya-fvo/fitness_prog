import { expect, type Locator } from "@playwright/test";

export async function expectMinimumTouchTarget(locator: Locator, size = 44) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(size);
  expect(box!.height).toBeGreaterThanOrEqual(size);
}
