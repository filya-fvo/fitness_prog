import { describe, expect, it } from "vitest";

import { subscriptionStateSchema } from "./subscription";

describe("subscriptionStateSchema", () => {
  it("parses an active PLUS entitlement state", () => {
    expect(subscriptionStateSchema.parse({
      tier: "plus",
      active: true,
      sources: ["legacy_stars", "beta_grant"],
      valid_until: "2026-11-30T21:00:00+00:00",
    })).toMatchObject({ tier: "plus", active: true });
  });

  it("rejects unknown entitlement sources", () => {
    expect(() => subscriptionStateSchema.parse({
      tier: "plus",
      active: true,
      sources: ["untrusted_provider"],
      valid_until: null,
    })).toThrow();
  });
});
