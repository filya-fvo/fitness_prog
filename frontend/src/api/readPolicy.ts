/** Cache-first is opt-in for subscribed overview screens, never editable forms. */
export type ReadPolicy = "cache" | "fresh";
export function readPolicyConfig(policy?: ReadPolicy) {
  return policy ? { headers: { "Cache-Control": policy === "cache" ? "stale-while-revalidate" : "no-cache" } } : {};
}
