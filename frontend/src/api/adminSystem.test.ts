import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { fetchAdminSystemStatus } from "./adminSystem";

describe("fetchAdminSystemStatus", () => {
  afterEach(() => vi.restoreAllMocks());

  it("validates the allowlisted system response", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        checked_at: "2026-08-26T12:00:00Z",
        overall_status: "attention",
        items: [
          {
            key: "redis",
            title: "Redis",
            status: "attention",
            summary: "Очередь растёт.",
            next_step: "Повторите проверку.",
            observed_at: "2026-08-26T11:59:00Z",
            facts: [{ label: "Ожидает", value: "52", kind: "number" }],
          },
        ],
      },
    });

    const result = await fetchAdminSystemStatus();

    expect(apiClient.get).toHaveBeenCalledWith("/admin/system/status");
    expect(result.items[0]?.key).toBe("redis");
    expect(result.items[0]?.facts[0]?.value).toBe("52");
  });
});
