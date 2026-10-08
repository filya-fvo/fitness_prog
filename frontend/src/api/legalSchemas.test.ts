import { expect, it } from "vitest";
import manifest from "../features/legal/documents/manifest.json";
import { legalStatusSchema } from "./legalSchemas";

it("legal receipt validation is usable without a browser or HTTP client", () => {
  const status = { user_id: "00000000-0000-4000-8000-000000000001", accepted: true, documents: manifest.map((doc) => ({ ...doc, accepted_at: "2026-10-08T10:00:00Z" })) };
  expect(legalStatusSchema.parse(status).documents).toHaveLength(3);
  expect(legalStatusSchema.safeParse({ ...status, user_id: "wrong" }).success).toBe(false);
  expect(legalStatusSchema.safeParse({ ...status, documents: [] }).success).toBe(false);
});
