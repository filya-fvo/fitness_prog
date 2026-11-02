import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import { fetchReleaseNotices, markReleaseNoticeSeen } from "./releaseNotices";
const owner = "11111111-1111-4111-8111-111111111111", id = "33333333-3333-4333-8333-333333333333";
const item = { id, apk_version: 27, release_key: "apk27", title: "Обновление", message_text: "Изменения", apk_url: "https://app.filfitclub.ru/android/latest.apk", created_at: "2026-10-29T12:00:00Z" };
const original = apiClient.defaults.adapter;
vi.stubGlobal("localStorage", { getItem: () => "synthetic-owner-token" });
afterEach(() => { apiClient.defaults.adapter = original; });
it("binds both API operations to the captured owner and validates the reply", async () => {
  const calls: { path?: string; params: unknown }[] = [];
  apiClient.defaults.adapter = async config => {
    calls.push({ path: config.url, params: config.params });
    return { status: 200, statusText: "OK", headers: {}, config, data: config.method === "post" ? { ok: true } : { items: [item], next_cursor: null } };
  };
  expect(await fetchReleaseNotices(owner, () => true)).toEqual({ items: [item], next_cursor: null });
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
  { next_cursor: null, items: [{ ...item, apk_url: "https://untrusted.test/app.apk" }] },
  { next_cursor: null, items: [{ ...item, message_text: "x".repeat(2001) }] },
  { next_cursor: null, items: Array.from({ length: 21 }, () => item) },
])("rejects an invalid or unbounded release response", async data => {
  apiClient.defaults.adapter = async config => ({ status: 200, statusText: "OK", headers: {}, config, data });
  await expect(fetchReleaseNotices(owner, () => true)).rejects.toThrow();
});

it("forwards the server cursor with the same captured owner", async () => {
  apiClient.defaults.adapter = async config => {
    expect(config.params).toEqual({ expected_owner: owner, cursor: id });
    return { status: 200, statusText: "OK", headers: {}, config, data: { items: [], next_cursor: null } };
  };
  expect(await fetchReleaseNotices(owner, () => true, id)).toEqual({ items: [], next_cursor: null });
});
it.each([{ items: [item] }, { items: [item], next_cursor: "invalid" }])("requires a valid explicit pagination boundary", async data => {
  apiClient.defaults.adapter = async config => ({ status: 200, statusText: "OK", headers: {}, config, data });
  await expect(fetchReleaseNotices(owner, () => true)).rejects.toThrow();
});
