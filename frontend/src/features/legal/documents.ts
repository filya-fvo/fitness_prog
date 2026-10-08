import manifest from "./documents/manifest.json";
import privacy from "./documents/privacy.md?raw";
import consent from "./documents/consent.md?raw";
import offer from "./documents/offer.md?raw";

const texts = { privacy, consent, offer };
export type LegalDocumentId = keyof typeof texts;
export interface LegalDocument {
  document_id: LegalDocumentId;
  title: string;
  revision: string;
  text_sha256: string;
  text: string;
}
export const legalDocuments: readonly LegalDocument[] = manifest.map((entry) => ({
  document_id: entry.document_id as LegalDocumentId,
  title: entry.title,
  revision: entry.revision,
  text_sha256: entry.text_sha256,
  text: texts[entry.document_id as LegalDocumentId].replace(/\r\n?/g, "\n"),
}));
