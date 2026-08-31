import { describe, expect, it } from "vitest";

import { authUserFromProfile, isUnauthorizedBrowserSession } from "@/lib/browserSession";

describe("browser session", () => {
  it("maps a refreshed profile to the cached authentication user", () => {
    expect(authUserFromProfile({
      id: "00000000-0000-4000-8000-000000000111",
      telegram_id: 42,
      username: "athlete",
      auth_email: "athlete@example.com",
      anthropometry: {},
      goals: {},
      subscription_status: "free",
      stars_balance: 0,
      onboarding_completed: true,
    })).toEqual({
      id: "00000000-0000-4000-8000-000000000111",
      telegram_id: 42,
      username: "athlete",
      auth_email: "athlete@example.com",
      subscription_status: "free",
      onboarding_completed: true,
    });
  });

  it("distinguishes an expired token from a temporary network failure", () => {
    expect(isUnauthorizedBrowserSession({
      isAxiosError: true,
      response: { status: 401 },
    })).toBe(true);
    expect(isUnauthorizedBrowserSession({
      isAxiosError: true,
      code: "ECONNABORTED",
    })).toBe(false);
  });
});
