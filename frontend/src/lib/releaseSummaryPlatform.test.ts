import { beforeEach, expect, it, vi } from "vitest";
import { fetchLatestRelease } from "./appUpdate";
import { eligibleReleaseSummaries } from "./releaseSummaryPlatform";
import type { ReleaseNotice } from "@/api/releaseNotices";
vi.mock("./appUpdate", () => ({ fetchLatestRelease: vi.fn() }));
const items = [{ id: "11111111-1111-4111-8111-111111111111", title: "Изменения", message_text: "Проверено", apk_version: 27, release_key: "apk27", created_at: "2026-10-29T12:00:00Z", apk_url: "https://app.filfitclub.ru/android/latest.apk" }] satisfies ReleaseNotice[];
beforeEach(() => vi.stubGlobal("__FITNESS_BUILD_ID__", "running-build"));
it("shows all historical unread items only in the actual current WEB build", async () => {
  vi.mocked(fetchLatestRelease).mockResolvedValue({ buildId: "running-build" });
  expect(await eligibleReleaseSummaries(items)).toEqual(items);
});
it("does not present future release text in a stale runtime", async () => {
  vi.mocked(fetchLatestRelease).mockResolvedValue({ buildId: "newer-build" });
  expect(await eligibleReleaseSummaries(items)).toEqual([]);
});
it("defers the summary while the current version cannot be established", async () => {
  vi.mocked(fetchLatestRelease).mockResolvedValue(null);
  expect(await eligibleReleaseSummaries(items)).toEqual([]);
});
