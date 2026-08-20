import { describe, expect, it } from "vitest";

import { prepareNutritionLabelImage } from "./labelImage";

describe("prepareNutritionLabelImage", () => {
  it("keeps a small supported image unchanged", async () => {
    const file = { type: "image/jpeg", size: 1024 } as File;

    await expect(prepareNutritionLabelImage(file)).resolves.toBe(file);
  });

  it("rejects non-image files before upload", async () => {
    const file = { type: "application/pdf", size: 1024 } as File;

    await expect(prepareNutritionLabelImage(file)).rejects.toThrow(
      "Выбранный файл не является изображением",
    );
  });
});
