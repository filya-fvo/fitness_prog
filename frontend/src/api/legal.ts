import { apiClient } from "./client";
import { legalStatusSchema, type LegalAcceptRequest, type LegalStatus } from "./legalSchemas";
export { legalDocumentMetaSchema, legalStatusSchema } from "./legalSchemas";
export type { LegalAcceptRequest, LegalStatus } from "./legalSchemas";

export async function fetchLegalStatus(): Promise<LegalStatus> {
  const { data } = await apiClient.get("/legal/status");
  return legalStatusSchema.parse(data);
}
export async function acceptLegalDocuments(body: LegalAcceptRequest): Promise<LegalStatus> {
  const { data } = await apiClient.post("/legal/accept", body);
  return legalStatusSchema.parse(data);
}
