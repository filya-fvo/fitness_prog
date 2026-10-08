import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheUserProfile, readCachedUserProfile } from "./profileCache";
import { authUserFromProfile } from "@/lib/browserSession";
import { legalDocuments } from "@/features/legal/documents";

const owner = "f92a718b-af2b-4ad1-904a-524b1694b257";
const status = { user_id: owner, accepted: true, documents: legalDocuments.map((doc) => ({ document_id: doc.document_id, title: doc.title, revision: doc.revision, text_sha256: doc.text_sha256, accepted_at: "2026-10-08T10:00:00Z" })) };
const base = { id: owner, subscription_status: "free", onboarding_completed: true };

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) });
});

describe("server legal status in profile cache", () => {
  it("preserves all independent receipts for this owner", () => {
    cacheUserProfile({ ...base, legal_status: status });
    expect(readCachedUserProfile()?.legal_status).toEqual(status);
  });
  it("restores old profile as unaccepted without deleting it", () => {
    cacheUserProfile(base);
    expect(readCachedUserProfile()?.id).toBe(owner);
    expect(readCachedUserProfile()?.legal_status ?? null).toBeNull();
  });
  it("rejects receipts from another account", () => {
    cacheUserProfile({ ...base, legal_status: { ...status, user_id: "d6d7f0af-221f-4b13-ae5b-040957e4e866" } });
    expect(readCachedUserProfile()?.legal_status ?? null).toBeNull();
  });
  it("keeps server status through browser profile restoration", () => {
    const user = authUserFromProfile({ ...base, anthropometry: {}, goals: {}, stars_balance: 0, legal_status: status });
    expect(user.legal_status).toEqual(status);
  });
});
