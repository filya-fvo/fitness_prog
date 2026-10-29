import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import { fetchReleaseNotices, markReleaseNoticeSeen } from "./releaseNotices";
const owner = "11111111-1111-4111-8111-111111111111", id = "33333333-3333-4333-8333-333333333333";
const item = { id, release_key: "apk27", title: "Обновление", message_text: "Изменения", apk_url: "https://app.filfitclub.ru/android/latest.apk", created_at: "2026-10-29T12:00:00Z" };
const original = apiClient.defaults.adapter;
vi.stubGlobal("localStorage", { getItem: () => "synthetic-owner-token" });
afterEach(() => { apiClient.defaults.adapter = original; });
it("binds both API operations to the captured owner and validates the reply", async () => {
  const calls: { path?: string; params: unknown }[] = [];
  apiClient.defaults.adapter = async config => {
    calls.push({ path: config.url, params: config.params });
    return { status: 200, statusText: "OK", headers: {}, config, data: config.method === "post" ? { ok: true } : { items: [item] } };
  };
  expect(await fetchReleaseNotices(owner, () => true)).toEqual([item]);
  await markReleaseNoticeSeen(owner, id, () => true);
  expect(calls).toEqual([
    { path: "/notifications/release-notices", params: { expected_owner: owner } },
    { path: `/notifications/release-notices/${id}/seen`, params: { expected_owner: owner } },
  ]);
});
it("does not dispatch a pending read ACK after session invalidation", async () => {
  const adapter = vi.fn(); apiClient.defaults.adapter = adapter;
  let current = true;
  const request = markReleaseNoticeSeen(owner, id, () => current);
  current = false;
  await expect(request).rejects.toThrow("Session changed");
  expect(adapter).not.toHaveBeenCalled();
});
it.each([
  { items: [{ ...item, apk_url: "https://untrusted.test/app.apk" }] },
  { items: [{ ...item, message_text: "x".repeat(2001) }] },
  { items: Array.from({ length: 21 }, () => item) },
])("rejects an invalid or unbounded release response", async data => {
  apiClient.defaults.adapter = async config => ({ status: 200, statusText: "OK", headers: {}, config, data });
  await expect(fetchReleaseNotices(owner, () => true)).rejects.toThrow();
});
