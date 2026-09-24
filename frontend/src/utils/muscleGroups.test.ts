import { describe, expect, it } from "vitest";

import { normalizeMuscleGroup } from "@/utils/muscleGroups";

describe("normalizeMuscleGroup", () => {
  it.each([
    ["грудь", "chest"],
    ["ягодицы", "glutes"],
    ["Ноги", "legs"],
    ["core", "core"],
  ])("normalizes %s", (source, expected) => {
    expect(normalizeMuscleGroup(source)).toBe(expected);
  });

  it("uses a neutral silhouette key for an unknown group", () => {
    expect(normalizeMuscleGroup("неизвестная группа")).toBe("neutral");
  });
});
