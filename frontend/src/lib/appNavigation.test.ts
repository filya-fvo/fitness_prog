import { describe, expect, it } from "vitest";

import { fallbackPathFor, shouldShowPageBack } from "./appNavigation";

describe("application back navigation", () => {
  it("keeps primary tabs as navigation roots", () => {
    for (const path of ["/", "/train", "/progress", "/help-center", "/profile", "/onboarding"]) {
      expect(shouldShowPageBack(path)).toBe(false);
    }
  });

  it("returns nested screens to their owning section when there is no history", () => {
    expect(fallbackPathFor("/programs")).toBe("/train");
    expect(fallbackPathFor("/workouts")).toBe("/train");
    expect(fallbackPathFor("/workouts/active/session-id")).toBe("/train");
    expect(fallbackPathFor("/progress/exercises")).toBe("/progress");
    expect(fallbackPathFor("/measurements")).toBe("/progress");
    expect(fallbackPathFor("/profile/settings")).toBe("/profile");
    expect(fallbackPathFor("/notifications")).toBe("/profile");
    expect(fallbackPathFor("/ai")).toBe("/help-center");
    expect(fallbackPathFor("/support")).toBe("/help-center");
    expect(fallbackPathFor("/knowledge")).toBe("/help-center");
    expect(fallbackPathFor("/faq")).toBe("/help-center");
    expect(fallbackPathFor("/admin")).toBe("/profile");
    expect(fallbackPathFor("/admin/system")).toBe("/admin");
  });
});
