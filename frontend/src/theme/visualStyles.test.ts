import { describe, expect, it } from "vitest";

import {
  buttonClass,
  cardClass,
  chipClass,
  fieldClass,
  statusClass,
} from "./visualStyles";

describe("visualStyles", () => {
  it("keeps the primary action on the brand gradient", () => {
    expect(buttonClass("primary")).toContain("app-gradient-action");
  });

  it("keeps status surfaces separate from the brand gradient", () => {
    expect(buttonClass("secondary")).not.toContain("app-gradient-action");
    expect(cardClass("success")).toContain("app-card-success");
  });

  it("returns semantic classes for every primitive variant", () => {
    expect(cardClass("indigo")).toContain("app-card-indigo");
    expect(chipClass("info")).toContain("app-chip-info");
    expect(fieldClass()).toContain("app-field");
    expect(statusClass("danger")).toContain("app-status-danger");
  });
});
