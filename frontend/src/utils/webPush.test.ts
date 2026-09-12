import { afterEach, describe, expect, it, vi } from "vitest";

import { savePushSubscription } from "@/api/notifications";
import { applicationServerKeyMatches, reconcileWebPush } from "@/utils/webPush";

vi.mock("@/api/notifications", () => ({
  fetchPushConfig: vi.fn(),
  removePushSubscription: vi.fn(),
  savePushSubscription: vi.fn(),
}));

function subscriptionWithKey(bytes: number[]): PushSubscription {
  return {
    options: { applicationServerKey: new Uint8Array(bytes).buffer },
  } as unknown as PushSubscription;
}

describe("applicationServerKeyMatches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("recognizes the VAPID key used for a browser subscription", () => {
    expect(applicationServerKeyMatches(subscriptionWithKey([1, 2, 3, 4]), "AQIDBA")).toBe(true);
    expect(applicationServerKeyMatches(subscriptionWithKey([1, 2, 3, 4]), "AQIDBA==")).toBe(true);
  });

  it("rejects a subscription made with an older VAPID key", () => {
    expect(applicationServerKeyMatches(subscriptionWithKey([1, 2, 3, 4]), "AQIDBQ")).toBe(false);
  });

  it("restores an existing local subscription on the server", async () => {
    const subscription = subscriptionWithKey([1, 2, 3, 4]);
    const getSubscription = vi.fn().mockResolvedValue(subscription);
    vi.stubGlobal("window", { PushManager: class {}, Notification: class {} });
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription } }) },
    });
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.mocked(savePushSubscription).mockResolvedValue({
      enabled: true,
      public_key: "AQIDBA",
      subscriptions: 1,
    });

    await expect(reconcileWebPush({
      enabled: true,
      public_key: "AQIDBA",
      subscriptions: 0,
    })).resolves.toBe(true);
    expect(savePushSubscription).toHaveBeenCalledWith(subscription);
  });
});
