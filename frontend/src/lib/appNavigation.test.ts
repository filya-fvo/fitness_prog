import { describe, expect, it } from "vitest";

import { fallbackPathFor, shouldShowPageBack } from "./appNavigation";

describe("application back navigation", () => {
  it("keeps primary tabs as navigation roots", () => {
    for (const path of ["/", "/train", "/nutrition", "/progress", "/more", "/onboarding"]) {
      expect(shouldShowPageBack(path)).toBe(false);
    }
  });

  it("returns nested screens to their owning section when there is no history", () => {
    expect(fallbackPathFor("/programs")).toBe("/train");
    expect(fallbackPathFor("/workouts")).toBe("/train");
    expect(fallbackPathFor("/workouts/active/session-id")).toBe("/train");
    expect(fallbackPathFor("/measurements")).toBe("/more");
    expect(fallbackPathFor("/knowledge")).toBe("/more");
    expect(fallbackPathFor("/admin/system")).toBe("/admin");
  });
});
