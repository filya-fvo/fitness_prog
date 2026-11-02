import { beforeEach, expect, it, vi } from "vitest";
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
let reads: typeof import("./releaseNoticeReads");
let data: Map<string, string>;
beforeEach(async () => {
  vi.resetModules(); data = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  reads = await import("./releaseNoticeReads");
});
it("keeps the closed intent owner-bound without changing unrelated app storage", () => {
  data.set("fitness_jwt", "keep");
  reads.dismissReleaseNotice(A, ID);
  expect(reads.isReleaseDismissed(A, ID)).toBe(true);
  expect(reads.isReleaseDismissed(B, ID)).toBe(false);
  expect(reads.pendingReleaseReads(A)).toEqual([ID]);
  expect(data.get("fitness_jwt")).toBe("keep");
});
it("retains an offline close after a fresh page and forgets only confirmed pending ACK", async () => {
  reads.dismissReleaseNotice(A, ID);
  vi.resetModules(); reads = await import("./releaseNoticeReads");
  expect(reads.isReleaseDismissed(A, ID)).toBe(true);
  expect(reads.pendingReleaseReads(A)).toEqual([ID]);
  reads.confirmReleaseRead(A, ID);
  expect(reads.pendingReleaseReads(A)).toEqual([]);
  expect(reads.isReleaseDismissed(A, ID)).toBe(true);
});
it("validates and preserves all displayed IDs without count eviction or foreign data", () => {
  data.set(`fitness_release_reads:v1:${A}`, JSON.stringify([null, "not-a-uuid", ID, ID]));
  expect(reads.pendingReleaseReads(A)).toEqual([ID]);
  for (let i = 0; i < 70; i++) reads.dismissReleaseNotice(A, `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`);
  expect(reads.pendingReleaseReads(A)).toHaveLength(71);
  expect(data.get(`fitness_release_reads:v1:${A}`)!.length).toBeLessThan(3000);
  expect(reads.pendingReleaseReads(B)).toEqual([]);
});
it("malformed or unavailable storage never prevents closing for this session", () => {
  data.set(`fitness_release_reads:v1:${A}`, "{broken");
  expect(reads.pendingReleaseReads(A)).toEqual([]);
  vi.stubGlobal("localStorage", { getItem() { throw Error("denied"); }, setItem() { throw Error("quota"); } });
  reads.dismissReleaseNotice(A, ID);
  expect(reads.isReleaseDismissed(A, ID)).toBe(true);
  expect(reads.pendingReleaseReads(A)).toEqual([ID]);
});

it("batch close persists every displayed ID once and survives a new client instance", async () => {
  const write = vi.fn((key: string, value: string) => data.set(key, value));
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: write });
  const ids = Array.from({ length: 65 }, (_, i) => `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`);
  expect(reads.dismissReleaseNotices(A, ids)).toBe(true);
  expect(write).toHaveBeenCalledTimes(1);
  vi.resetModules(); reads = await import("./releaseNoticeReads");
  expect(reads.pendingReleaseReads(A)).toEqual(ids);
  reads.confirmReleaseRead(A, ids[0]);
  expect(reads.pendingReleaseReads(A)).toEqual(ids.slice(1));
  expect(reads.isReleaseDismissed(A, ids[0])).toBe(true);
});
