import type { AuthUser } from "@/api/auth";
import type { LegalStatus } from "@/api/legal";
import legalDocuments from "./documents/manifest.json";

export function needsLegalAcceptance(user: AuthUser): boolean {
  const status = user.legal_status;
  if (!status?.accepted || status.user_id !== user.id || status.documents.length !== legalDocuments.length) return true;
  return !legalDocuments.every((document) => status.documents.some((receipt) =>
    receipt.document_id === document.document_id && receipt.revision === document.revision &&
    receipt.text_sha256 === document.text_sha256 && Boolean(receipt.accepted_at),
  ));
}

export function mergeAcceptedLegalStatus(user: AuthUser, status: LegalStatus): AuthUser | null {
  const updated = { ...user, legal_status: status };
  return needsLegalAcceptance(updated) ? null : updated;
}

/** A profile read started before acceptance cannot undo same-text receipts. */
export function preserveAcceptedLegalStatus(current: AuthUser | null, incoming: AuthUser): AuthUser {
  const status = incoming.legal_status;
  if (!current || current.id !== incoming.id || needsLegalAcceptance(current) || !status || status.user_id !== incoming.id || status.documents.length !== legalDocuments.length) return incoming;
  const sameTexts = legalDocuments.every((document) => status.documents.some((receipt) =>
    receipt.document_id === document.document_id && receipt.revision === document.revision && receipt.text_sha256 === document.text_sha256,
  ));
  return sameTexts && !status.accepted ? { ...incoming, legal_status: current.legal_status } : incoming;
}
