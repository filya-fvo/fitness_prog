import { describe, expect, it } from "vitest";

import { formatElapsed, formatKg, formatRestTime, formatTonnage } from "@/utils/format";

describe("format utils", () => {
  it("formats rest timer mm:ss", () => {
    expect(formatRestTime(0)).toBe("0:00");
    expect(formatRestTime(65)).toBe("1:05");
    expect(formatRestTime(600)).toBe("10:00");
  });

  it("formats elapsed workout clock", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(3600 + 65)).toBe("1:01:05");
  });

  it("formats kg", () => {
    expect(formatKg(null)).toBe("—");
    expect(formatKg(62.5)).toBe("62.5 кг");
  });

  it("formats tonnage", () => {
    expect(formatTonnage(500)).toBe("500");
    expect(formatTonnage(1500)).toBe("1.5 т");
  });
});
