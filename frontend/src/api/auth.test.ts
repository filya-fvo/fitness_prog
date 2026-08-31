import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getTelegramBrowserLoginConfig,
  loginWithTelegram,
  loginWithTelegramIdToken,
} from "./auth";
import { apiClient } from "./client";

const authResponse = {
  access_token: "token",
  token_type: "bearer",
  expires_in_days: 30,
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    telegram_id: 123,
    username: "tester",
    subscription_status: "free",
    onboarding_completed: true,
  },
};

describe("loginWithTelegram", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reuses one request when auth bootstrap runs twice", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem, removeItem: vi.fn() });

    let resolveRequest: ((value: { data: typeof authResponse }) => void) | undefined;
    const pending = new Promise<{ data: typeof authResponse }>((resolve) => {
      resolveRequest = resolve;
    });
    const post = vi.spyOn(apiClient, "post").mockReturnValue(pending);

    const first = loginWithTelegram("same-init-data");
    const second = loginWithTelegram("same-init-data");
    expect(post).toHaveBeenCalledTimes(1);

    resolveRequest?.({ data: authResponse });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(setItem).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("loads browser config and exchanges an OIDC token", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem, removeItem: vi.fn() });
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { enabled: true, client_id: 123456, nonce: "n".repeat(40) },
    });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: authResponse });

    await expect(getTelegramBrowserLoginConfig()).resolves.toMatchObject({ client_id: 123456 });
    await expect(loginWithTelegramIdToken("telegram-id-token", "n".repeat(40))).resolves.toEqual(
      authResponse,
    );
    expect(post).toHaveBeenCalledWith("/auth/telegram/browser", {
      id_token: "telegram-id-token",
      nonce: "n".repeat(40),
    });
    expect(setItem).toHaveBeenCalledWith("fitness_jwt", "token");
    vi.unstubAllGlobals();
  });
});
