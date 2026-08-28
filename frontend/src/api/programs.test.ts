import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { fetchPrograms } from "./programs";

describe("program catalog API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses publication metadata returned by the safe public catalog", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        items: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Программа",
            structure: {},
            publication_status: "published",
            program_key: "seed-program",
            version: 2,
            is_current: true,
            published_at: "2026-08-28T10:00:00Z",
          },
        ],
        total: 1,
      },
    });

    const result = await fetchPrograms();

    expect(apiClient.get).toHaveBeenCalledWith("/programs", {
      params: expect.objectContaining({ templates_only: true }),
    });
    expect(result.items[0]).toMatchObject({
      publication_status: "published",
      program_key: "seed-program",
      version: 2,
      is_current: true,
    });
  });
});
