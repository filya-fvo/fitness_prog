import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { downloadAdminAudit, fetchAdminAudit } from "./adminAudit";

describe("fetchAdminAudit", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends server filters and validates the safe response", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        items: [
          {
            id,
            actor_user_id: id,
            actor_label: "@owner",
            action: "exercise.update",
            object_type: "exercise",
            object_id: id,
            object_label: "Жим лёжа",
            result: "success",
            description: "Упражнение изменено.",
            before: { difficulty: 2 },
            after: { difficulty: 3 },
            notification_status: null,
            correlation_id: id,
            created_at: "2026-08-26T12:00:00Z",
          },
        ],
        total: 1,
        limit: 30,
        offset: 0,
        actors: [{ id, label: "@owner" }],
        actions: ["exercise.update"],
      },
    });

    const result = await fetchAdminAudit(
      { actorUserId: id, query: "жим", action: "exercise.update", result: "success" },
      { limit: 30, offset: 0 },
    );

    expect(apiClient.get).toHaveBeenCalledWith("/admin/audit", {
      params: {
        date_from: undefined,
        date_to: undefined,
        actor_user_id: id,
        q: "жим",
        action: "exercise.update",
        result: "success",
        limit: 30,
        offset: 0,
      },
    });
    expect(result.items[0]?.before).toEqual({ difficulty: 2 });
  });

  it("downloads a bounded export with the active filters", async () => {
    const blob = new Blob(["id,action"], { type: "text/csv" });
    vi.spyOn(apiClient, "post").mockResolvedValue({
      data: blob,
      headers: {
        "x-exported-count": "1000",
        "x-total-count": "1250",
        "x-export-truncated": "true",
      },
    });

    const result = await downloadAdminAudit(
      { query: "жим", action: "exercise.update", result: "success" },
      "csv",
    );

    expect(apiClient.post).toHaveBeenCalledWith(
      "/admin/audit/export",
      {
        date_from: undefined,
        date_to: undefined,
        actor_user_id: undefined,
        query: "жим",
        action: "exercise.update",
        result: "success",
      },
      { params: { format: "csv" }, responseType: "blob" },
    );
    expect(result).toEqual({
      blob,
      exportedCount: 1000,
      totalMatches: 1250,
      truncated: true,
    });
  });
});
