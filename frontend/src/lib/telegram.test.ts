import { describe, expect, it } from "vitest";

import { pathFromStartParam } from "./telegram";

describe("pathFromStartParam", () => {
  it("opens the separate measurements screen", () => {
    expect(pathFromStartParam("measurements")).toBe("/measurements");
  });

  it("opens the water controls in the daily check-in", () => {
    expect(pathFromStartParam("water")).toBe("/?checkin=water");
  });
});
