import { describe, expect, it, vi } from "vitest";

import {
  buildRefreshUrl,
  fetchLatestRelease,
  isUpdateProtectedPath,
  needsAppUpdate,
  parseReleaseVersion,
} from "@/lib/appUpdate";

describe("application update", () => {
  it("accepts only a bounded release identifier", () => {
    expect(parseReleaseVersion({ buildId: "release-42", createdAt: "2026-09-01" })).toEqual({
      buildId: "release-42",
    });
    expect(parseReleaseVersion({ buildId: "" })).toBeNull();
    expect(parseReleaseVersion({ buildId: 42 })).toBeNull();
    expect(parseReleaseVersion(null)).toBeNull();
  });

  it("fetches the public pointer without using a cached response", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ buildId: "v2" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await expect(fetchLatestRelease(fetcher, 123)).resolves.toEqual({
      buildId: "v2",
    });
    expect(fetcher).toHaveBeenCalledWith("/version.json?t=123", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  });

  it("does not turn a failed version check into an application error", async () => {
    const fetcher = vi.fn(async () => { throw new Error("offline"); });
    await expect(fetchLatestRelease(fetcher, 123)).resolves.toBeNull();
  });

  it("compares production build ids and preserves the current route on refresh", () => {
    expect(needsAppUpdate("v1", "v2")).toBe(true);
    expect(needsAppUpdate("v2", "v2")).toBe(false);
    expect(needsAppUpdate("development", "v2")).toBe(false);

    const refreshed = new URL(buildRefreshUrl(
      "https://app.filfitclub.ru/progress?period=30",
      "v2",
      456,
    ));
    expect(refreshed.pathname).toBe("/progress");
    expect(refreshed.searchParams.get("period")).toBe("30");
    expect(refreshed.searchParams.get("__app_refresh")).toBe("v2-456");
  });

  it("defers reloads on screens with potentially unsaved work", () => {
    for (const path of [
      "/onboarding",
      "/workouts",
      "/workouts/active/123",
      "/nutrition",
      "/measurements",
      "/profile",
      "/support/123",
      "/invite",
      "/admin/broadcasts",
    ]) {
      expect(isUpdateProtectedPath(path), path).toBe(true);
    }
    expect(isUpdateProtectedPath("/")).toBe(false);
    expect(isUpdateProtectedPath("/progress")).toBe(false);
    expect(isUpdateProtectedPath("/social")).toBe(false);
  });
});
