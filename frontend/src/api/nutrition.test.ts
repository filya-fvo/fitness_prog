import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { recognizeNutritionLabel } from "./nutrition";

describe("recognizeNutritionLabel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends the image as multipart form data", async () => {
    const response = {
      recognized: false,
      name_ru: null,
      basis_label: null,
      serving_grams: null,
      calories_kcal: null,
      proteins_g: null,
      fats_g: null,
      carbs_g: null,
      fiber_g: null,
      sugars_g: null,
      salt_g: null,
      confidence: 0,
      warnings: ["Таблица не найдена"],
      remaining_requests: 9,
    };
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: response });
    const image = Object.assign(new Blob(["jpeg"], { type: "image/jpeg" }), {
      name: "label.jpg",
    }) as File;

    await recognizeNutritionLabel(image);

    expect(post).toHaveBeenCalledWith(
      "/nutrition/label/recognize",
      expect.any(FormData),
    );
    const form = post.mock.calls[0]?.[1] as FormData;
    expect(form.get("image")).toBeTruthy();
  });
});
