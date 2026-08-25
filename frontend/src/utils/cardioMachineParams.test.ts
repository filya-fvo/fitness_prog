import { describe, expect, it } from "vitest";

import {
  buildCardioMachineParams,
  cardioMachineFields,
  initialCardioParamValues,
} from "@/utils/cardioMachineParams";

describe("cardio machine parameters", () => {
  it.each([
    ["treadmill", ["speed", "incline"]],
    ["elliptical", ["resistance"]],
    ["bike", ["speed", "resistance"]],
    ["rower", ["resistance", "pace"]],
    ["other", ["resistance"]],
  ] as const)("uses machine-specific fields for %s", (kind, expected) => {
    expect(cardioMachineFields(kind).map((field) => field.key)).toEqual(expected);
  });

  it("stores only fields belonging to the selected machine", () => {
    const values = initialCardioParamValues({
      speed: 8.5,
      incline: 2,
      resistance: 7,
      pace: 2.1,
    });

    expect(buildCardioMachineParams("elliptical", values)).toEqual({ resistance: 7 });
    expect(buildCardioMachineParams("bike", values)).toEqual({ speed: 8.5, resistance: 7 });
  });
});
