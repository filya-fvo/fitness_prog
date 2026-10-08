import manifest from "../src/features/legal/documents/manifest.json" with { type: "json" };

/** Explicitly confirmed server profile for tests unrelated to legal onboarding. */
export function acceptedLegalStatus(userId: string) {
  return {
    user_id: userId,
    accepted: true,
    documents: manifest.map((document) => ({
      document_id: document.document_id,
      title: document.title,
      revision: document.revision,
      text_sha256: document.text_sha256,
      accepted_at: "2026-10-08T10:00:00Z",
    })),
  };
}
