import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
// @ts-expect-error Frozen deployed JavaScript schemas intentionally have no current-client types.
import { offlineWorkoutContextSchema, parseCachedPlans } from "../../tests/fixtures/apk26/schemas.mjs";
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../tests/fixtures/apk26/${name}.json`, import.meta.url), "utf8"));
describe("frozen APK26 parser against typed targets", () => {
  it("strips typed goals online and through deployed cache parsing, retaining full stamps and topology", () => {
    const input = fixture("typed-bundle");
    const online = offlineWorkoutContextSchema.parse(input);
    expect(online).toEqual(fixture("online-parsed"));
    expect({ ...online, plans: parseCachedPlans(input) }).toEqual(fixture("offline-parsed"));
    expect(online.plans[0].plan.exercises[0]).not.toHaveProperty("target");
    expect(online.plans[0].plan.exercises[0].suggested_weight).toBe(17.5);
    expect(online.plans[0].plan.exercises[0].set_methods[0].parts[0].target_weight).toBe(40);
    expect(online.plans[0].preparation_fingerprint).toBe("f".repeat(64));
  });
  it("rejects malformed known fields and incomplete bundles", () => {
    const input = fixture("typed-bundle");
    const invalid = structuredClone(input);
    invalid.plans[0].plan.exercises[0].set_methods[0].parts[0].target_weight = "broken";
    expect(() => parseCachedPlans(invalid)).toThrow();
    expect(() => parseCachedPlans({ ...input, end: "2026-10-26" })).toThrow();
  });
});
