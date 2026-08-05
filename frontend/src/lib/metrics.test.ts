import { describe, expect, it } from "vitest";

import { summarizeFunnel } from "@/lib/metrics";

describe("metrics funnel", () => {
  it("detects activation after onboarding + set", () => {
    const t0 = "2026-08-01T10:00:00.000Z";
    const t1 = "2026-08-01T10:05:00.000Z";
    const snap = summarizeFunnel([
      { event: "web_app_opened", ts: t0, payload: {} },
      { event: "onboarding_completed", ts: t0, payload: {} },
      {
        event: "set_logged",
        ts: t1,
        payload: { ms_from_workout_start: 12_000 },
      },
    ]);
    expect(snap.opened).toBe(true);
    expect(snap.onboardingCompleted).toBe(true);
    expect(snap.activated).toBe(true);
    expect(snap.timeToFirstSetMs).toBe(5 * 60 * 1000);
  });

  it("returns null D7 when history shorter than 7 days", () => {
    const t0 = "2026-08-01T10:00:00.000Z";
    const t1 = "2026-08-02T10:00:00.000Z";
    const snap = summarizeFunnel([
      { event: "web_app_opened", ts: t0, payload: {} },
      { event: "set_logged", ts: t1, payload: {} },
    ]);
    expect(snap.d7Returned).toBeNull();
  });

  it("flags D7 when activity on day+7", () => {
    const snap = summarizeFunnel([
      { event: "web_app_opened", ts: "2026-08-01T10:00:00.000Z", payload: {} },
      { event: "onboarding_completed", ts: "2026-08-01T10:01:00.000Z", payload: {} },
      { event: "set_logged", ts: "2026-08-01T10:10:00.000Z", payload: {} },
      { event: "web_app_opened", ts: "2026-08-08T12:00:00.000Z", payload: {} },
    ]);
    expect(snap.d7Returned).toBe(true);
    expect(snap.activated).toBe(true);
  });
});
