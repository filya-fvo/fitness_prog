import { describe, expect, it } from "vitest";

import {
  ACTIVATION_CHECKLIST_ITEM_IDS,
  activationChecklistEnabled,
  activationChecklistIsVisible,
  activationSignalsFromAnalytics,
  addActivationSignals,
  completedActivationItems,
  createActivationChecklistState,
  nextLocalDate,
  readActivationChecklistState,
} from "@/features/onboarding/activationChecklist";

describe("activation checklist", () => {
  it("only starts for profiles carrying the rollout state", () => {
    expect(readActivationChecklistState(undefined)).toBeNull();
    const state = createActivationChecklistState(new Date("2026-09-07T10:00:00Z"));
    expect(readActivationChecklistState(state)).toEqual(state);
    expect(activationChecklistEnabled("false")).toBe(false);
    expect(activationChecklistEnabled("true")).toBe(true);
  });

  it("requires both nutrition and FAQ but accepts skipping a measurement", () => {
    const initial = createActivationChecklistState(new Date("2026-09-07T10:00:00Z"));
    const partial = addActivationSignals(initial, [
      "plan_viewed",
      "schedule_saved",
      "set_logged",
      "checkin_saved",
      "measurement_skipped",
      "nutrition_opened",
    ]);
    expect(completedActivationItems(partial.signals)).toEqual([
      "first_plan",
      "schedule",
      "first_set",
      "checkin",
      "measurement",
    ]);
    expect(partial.completed_at).toBeNull();

    const complete = addActivationSignals(
      partial,
      ["faq_opened"],
      new Date("2026-09-08T10:00:00Z"),
    );
    expect(completedActivationItems(complete.signals)).toEqual(ACTIVATION_CHECKLIST_ITEM_IDS);
    expect(complete.completed_at).toBe("2026-09-08T10:00:00.000Z");
  });

  it("restores signals from real product events", () => {
    expect(activationSignalsFromAnalytics([
      { event: "faq_opened", ts: "2026-09-06T10:00:00.000Z" },
      { event: "workout_started", ts: "2026-09-07T10:00:00.000Z" },
      { event: "set_logged", ts: "2026-09-07T10:00:01.000Z" },
      { event: "habit_checked", ts: "2026-09-07T10:00:02.000Z" },
      { event: "measurement_saved", ts: "2026-09-07T10:00:03.000Z" },
      { event: "nutrition_opened", ts: "2026-09-07T10:00:04.000Z" },
      { event: "faq_opened", ts: "2026-09-07T10:00:05.000Z" },
      { event: "unknown", ts: "2026-09-07T10:00:06.000Z" },
    ], "2026-09-07T00:00:00.000Z")).toEqual([
      "plan_viewed",
      "set_logged",
      "checkin_saved",
      "measurement_saved",
      "nutrition_opened",
      "faq_opened",
    ]);
  });

  it("hides until the next local day after snooze", () => {
    const state = {
      ...createActivationChecklistState(),
      snoozed_until: "2026-09-08",
    };
    expect(activationChecklistIsVisible(state, "2026-09-07")).toBe(false);
    expect(activationChecklistIsVisible(state, "2026-09-08")).toBe(true);
    expect(nextLocalDate("2026-12-31")).toBe("2027-01-01");
  });
});
