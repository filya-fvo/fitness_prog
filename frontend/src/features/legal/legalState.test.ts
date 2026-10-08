import { describe, expect, it } from "vitest";
import { legalDocuments } from "./documents";
import { needsLegalAcceptance, mergeAcceptedLegalStatus } from "./legalState";
import type { AuthUser } from "@/api/auth";

const owner = "a428ecbd-e607-4a75-ab5e-a02394815c8f";
const user: AuthUser = { id: owner, subscription_status: "free", onboarding_completed: true };
const accepted = { user_id: owner, accepted: true, documents: legalDocuments.map((doc) => ({ document_id: doc.document_id, title: doc.title, revision: doc.revision, text_sha256: doc.text_sha256, accepted_at: "2026-10-08T10:00:00Z" })) };

describe("legal entry gate", () => {
  it("requires a real server receipt for every current document", () => {
    expect(needsLegalAcceptance(user)).toBe(true);
    expect(needsLegalAcceptance({ ...user, legal_status: accepted })).toBe(false);
    expect(needsLegalAcceptance({ ...user, legal_status: { ...accepted, documents: accepted.documents.map((doc, index) => index === 0 ? { ...doc, accepted_at: null } : doc) } })).toBe(true);
  });
  it("rejects old text, duplicate documents and a different owner", () => {
    expect(needsLegalAcceptance({ ...user, legal_status: { ...accepted, user_id: "a428ecbd-e607-4a75-ab5e-a02394815c89" } })).toBe(true);
    expect(needsLegalAcceptance({ ...user, legal_status: { ...accepted, documents: accepted.documents.map((doc, index) => index === 0 ? { ...doc, text_sha256: "f".repeat(64) } : doc) } })).toBe(true);
    expect(needsLegalAcceptance({ ...user, legal_status: { ...accepted, documents: accepted.documents.map(() => accepted.documents[0]) } })).toBe(true);
  });
  it("does not apply a completed request to the next account", () => {
    expect(mergeAcceptedLegalStatus({ ...user, id: "a428ecbd-e607-4a75-ab5e-a02394815c89" }, accepted)).toBeNull();
    expect(mergeAcceptedLegalStatus(user, accepted)?.legal_status).toEqual(accepted);
  });
});
