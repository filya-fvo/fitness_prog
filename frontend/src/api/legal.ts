import { z } from "zod";
import { apiClient } from "./client";

export const legalDocumentMetaSchema = z.object({
  document_id: z.enum(["privacy", "consent", "offer"]),
  title: z.string(),
  revision: z.string(),
  text_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const legalStatusSchema = z.object({
  user_id: z.string().uuid(),
  accepted: z.boolean(),
  documents: z.array(legalDocumentMetaSchema.extend({ accepted_at: z.string().datetime({ offset: true }).nullable() })).length(3),
});
export type LegalStatus = z.infer<typeof legalStatusSchema>;
export interface LegalAcceptRequest {
  documents: { document_id: LegalStatus["documents"][number]["document_id"]; revision: string; text_sha256: string; accepted: true }[];
}
export async function fetchLegalStatus(): Promise<LegalStatus> {
  const { data } = await apiClient.get("/legal/status");
  return legalStatusSchema.parse(data);
}
export async function acceptLegalDocuments(body: LegalAcceptRequest): Promise<LegalStatus> {
  const { data } = await apiClient.post("/legal/accept", body);
  return legalStatusSchema.parse(data);
}
