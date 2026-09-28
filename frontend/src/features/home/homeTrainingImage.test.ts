import { describe, expect, it } from "vitest";

import { homeTrainingImage } from "@/features/home/homeTrainingImage";

describe("home training image", () => {
  it("uses the female athlete only for a female profile", () => {
    expect(homeTrainingImage("female")).toBe("/app-media/home-training-female.webp");
    expect(homeTrainingImage("male")).toBe("/app-media/home-training-male.webp");
    expect(homeTrainingImage("")).toBe("/app-media/home-training-male.webp");
    expect(homeTrainingImage("unspecified")).toBe("/app-media/home-training-male.webp");
  });
});
