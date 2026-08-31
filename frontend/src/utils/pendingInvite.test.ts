import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimInviteStartParam,
  clearPendingInvite,
  consumePendingInvitePath,
  pendingInvitePath,
  rememberPendingInvite,
} from "./pendingInvite";

describe("pending invite", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  it("survives onboarding navigation and is consumed once", () => {
    const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    rememberPendingInvite(token);
    expect(pendingInvitePath()).toBe(`/invite?token=${token}`);
    expect(consumePendingInvitePath()).toBe(`/invite?token=${token}`);
    expect(pendingInvitePath()).toBeNull();
  });

  it("does not retain a short or malformed token", () => {
    rememberPendingInvite("bad token");
    expect(pendingInvitePath()).toBeNull();
  });

  it("clears an accepted invitation", () => {
    const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    rememberPendingInvite(token);
    clearPendingInvite();
    expect(pendingInvitePath()).toBeNull();
  });

  it("claims the same Telegram start parameter only once per webview session", () => {
    const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    expect(claimInviteStartParam(token)).toBe(true);
    expect(claimInviteStartParam(token)).toBe(false);
    expect(pendingInvitePath()).toBe(`/invite?token=${token}`);
  });
});
