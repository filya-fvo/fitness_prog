import { describe, expect, it } from "vitest";

import { formatAuditValue, localDateTimeToIso, toApiFilters } from "./adminAuditView";

describe("admin audit view helpers", () => {
  it("converts local date filters to an offset-aware API timestamp", () => {
    const value = localDateTimeToIso("2026-08-26T12:30");
    expect(value).toMatch(/^2026-08-26T\d{2}:30:00\.000Z$/);
    expect(localDateTimeToIso("")).toBeUndefined();
  });

  it("omits empty filters and rejects an unknown result", () => {
    expect(
      toApiFilters({
        dateFrom: "",
        dateTo: "",
        actorUserId: "",
        action: "exercise.update",
        result: "unknown",
      }),
    ).toEqual({
      dateFrom: undefined,
      dateTo: undefined,
      actorUserId: undefined,
      action: "exercise.update",
      result: undefined,
    });
  });

  it("formats allowlisted scalar and aggregate values", () => {
    expect(formatAuditValue(true)).toBe("Да");
    expect(formatAuditValue(["сила", "грудь"])).toBe("сила, грудь");
    expect(formatAuditValue({ workouts: 2 })).toBe("тренировки: 2");
  });
});
