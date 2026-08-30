import { describe, expect, it } from "vitest";

import type { AdminSystemHistorySnapshot } from "@/api/adminSystem";

import { summarizeSystemSnapshot } from "./adminSystemHistory";

const base: AdminSystemHistorySnapshot = {
  id: "00000000-0000-4000-8000-000000000032",
  captured_at: "2026-08-30T12:00:00Z",
  overall_status: "normal",
  source: "scheduled",
  items: [
    { key: "api", status: "normal" },
    { key: "database", status: "normal" },
  ],
};

describe("summarizeSystemSnapshot", () => {
  it("summarizes a healthy snapshot", () => {
    expect(summarizeSystemSnapshot(base)).toBe("Все проверки в норме");
  });

  it("names checks that need attention", () => {
    expect(
      summarizeSystemSnapshot({
        ...base,
        overall_status: "error",
        items: [
          { key: "database", status: "error" },
          { key: "worker", status: "no_data" },
        ],
      }),
    ).toBe("PostgreSQL — Ошибка; Worker — Нет данных");
  });
});
