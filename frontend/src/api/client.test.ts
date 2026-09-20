import { describe, expect, it } from "vitest";

import {
  AI_API_TIMEOUT_MS,
  API_TIMEOUT_MS,
  OCR_API_TIMEOUT_MS,
  UPLOAD_API_TIMEOUT_MS,
  apiClient,
} from "@/api/client";

describe("API timeout policy", () => {
  it("bounds ordinary requests and keeps explicit room for slow local services", () => {
    expect(apiClient.defaults.timeout).toBe(API_TIMEOUT_MS);
    expect(API_TIMEOUT_MS).toBe(15_000);
    expect(UPLOAD_API_TIMEOUT_MS).toBeGreaterThan(API_TIMEOUT_MS);
    expect(OCR_API_TIMEOUT_MS).toBeGreaterThan(UPLOAD_API_TIMEOUT_MS);
    expect(AI_API_TIMEOUT_MS).toBeGreaterThan(OCR_API_TIMEOUT_MS);
  });
});
