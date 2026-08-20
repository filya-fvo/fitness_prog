import { describe, expect, it } from "vitest";

import { normalizeDecimalInput, parseDecimalInput } from "./decimalInputValue";

describe("localized decimal input", () => {
  it("accepts both Russian comma and dot", () => {
    expect(parseDecimalInput("12,5")).toBe(12.5);
    expect(parseDecimalInput("12.5")).toBe(12.5);
  });

  it("normalizes values before they reach calculations", () => {
    expect(normalizeDecimalInput(" 7,25 ")).toBe("7.25");
  });

  it("rejects empty and invalid values", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("12,5,1")).toBeNull();
  });
});
