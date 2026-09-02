import { describe, expect, it, vi } from "vitest";

import { parseSavedAdminFilters, saveAdminFilterSet } from "./savedAdminFilters";

describe("saved admin filters", () => {
  it("keeps only allowlisted string fields", () => {
    const parsed = parseSavedAdminFilters(JSON.stringify([{
      id: "one",
      name: " Ошибки ",
      createdAt: 1,
      values: { result: "failure", secret: "must-not-survive", query: 42 },
    }]), ["result", "query"]);
    expect(parsed).toEqual([{
      id: "one",
      name: "Ошибки",
      createdAt: 1,
      values: { result: "failure" },
    }]);
  });

  it("updates a same-name set and limits history to eight", () => {
    let sequence = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `new-id-${sequence += 1}` });
    let items = saveAdminFilterSet([], "Мой набор", { level: "beginner" });
    items = saveAdminFilterSet(items, "мой набор", { level: "advanced" });
    expect(items).toHaveLength(1);
    expect(items[0].values.level).toBe("advanced");
    for (let index = 0; index < 10; index += 1) {
      items = saveAdminFilterSet(items, `Набор ${index}`, { query: String(index) });
    }
    expect(items).toHaveLength(8);
    vi.unstubAllGlobals();
  });
});
