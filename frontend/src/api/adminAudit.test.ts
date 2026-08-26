import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { fetchAdminAudit } from "./adminAudit";

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
      { actorUserId: id, action: "exercise.update", result: "success" },
      { limit: 30, offset: 0 },
    );

    expect(apiClient.get).toHaveBeenCalledWith("/admin/audit", {
      params: {
        date_from: undefined,
        date_to: undefined,
        actor_user_id: id,
        action: "exercise.update",
        result: "success",
        limit: 30,
        offset: 0,
      },
    });
    expect(result.items[0]?.before).toEqual({ difficulty: 2 });
  });
});
