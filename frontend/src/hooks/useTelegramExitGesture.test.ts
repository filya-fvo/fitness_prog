import { describe, expect, it } from "vitest";

import { isExitEdgeSwipe } from "@/hooks/useTelegramExitGesture";

describe("Telegram exit edge gesture", () => {
  it("accepts a deliberate right swipe from the left edge", () => {
    expect(isExitEdgeSwipe({ startX: 6, startY: 300, endX: 110, endY: 318 })).toBe(true);
  });

  it("ignores gestures that start in app content", () => {
    expect(isExitEdgeSwipe({ startX: 40, startY: 300, endX: 150, endY: 300 })).toBe(false);
  });

  it("ignores short and mostly vertical gestures", () => {
    expect(isExitEdgeSwipe({ startX: 8, startY: 300, endX: 55, endY: 305 })).toBe(false);
    expect(isExitEdgeSwipe({ startX: 8, startY: 300, endX: 90, endY: 370 })).toBe(false);
  });
});
