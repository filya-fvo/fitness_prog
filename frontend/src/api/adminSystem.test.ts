import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import {
  checkAdminSystemStatus,
  fetchAdminSystemHistory,
  fetchAdminSystemStatus,
} from "./adminSystem";

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

  it("records an explicit manual check", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { checked_at: "2026-08-30T12:00:00Z", overall_status: "normal", items: [] },
    });

    const result = await checkAdminSystemStatus();

    expect(apiClient.post).toHaveBeenCalledWith("/admin/system/status/check");
    expect(result.overall_status).toBe("normal");
  });

  it("validates sanitized status history", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        snapshots: [
          {
            id: "00000000-0000-4000-8000-000000000032",
            captured_at: "2026-08-30T12:00:00Z",
            overall_status: "attention",
            source: "scheduled",
            items: [
              { key: "api", status: "normal" },
              { key: "backup", status: "attention" },
            ],
          },
        ],
        retention_days: 30,
      },
    });

    const result = await fetchAdminSystemHistory(48);

    expect(apiClient.get).toHaveBeenCalledWith("/admin/system/history", {
      params: { limit: 48 },
    });
    expect(result.snapshots[0]?.items[1]?.key).toBe("backup");
  });
});
