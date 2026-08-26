import { describe, expect, it } from "vitest";

import type { AdminSystemStatusResponse } from "@/api/adminSystem";

import { adminSystemLoadReducer, initialAdminSystemState } from "./adminSystemState";

const response: AdminSystemStatusResponse = {
  checked_at: "2026-08-26T12:00:00Z",
  overall_status: "normal",
  items: [],
};

describe("admin system loading flow", () => {
  it("starts in loading state", () => {
    expect(initialAdminSystemState.phase).toBe("loading");
  });

  it("shows an error and returns to loading on retry", () => {
    const failed = adminSystemLoadReducer(initialAdminSystemState, {
      type: "failure",
      error: "Сервис недоступен",
    });
    expect(failed).toEqual({ phase: "error", data: null, error: "Сервис недоступен" });
    expect(adminSystemLoadReducer(failed, { type: "load" })).toEqual(initialAdminSystemState);
  });

  it("stores a successful response", () => {
    expect(
      adminSystemLoadReducer(initialAdminSystemState, { type: "success", data: response }),
    ).toEqual({ phase: "ready", data: response, error: null });
  });
});
