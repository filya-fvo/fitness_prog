import { describe, expect, it } from "vitest";

import { estimate1rm } from "@/utils/strengthProgress";

describe("strengthProgress", () => {
  it("estimates 1RM via Epley", () => {
    expect(estimate1rm(100, 1)).toBe(100);
    expect(estimate1rm(100, 5)).toBe(116.7);
    expect(estimate1rm(0, 5)).toBe(0);
  });

});
