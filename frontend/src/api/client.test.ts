import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

import {
  AI_API_TIMEOUT_MS,
  API_TIMEOUT_MS,
  OCR_API_TIMEOUT_MS,
  UPLOAD_API_TIMEOUT_MS,
  apiClient,
  clearStoredToken,
  setStoredToken,
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

describe("API request compatibility", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  afterEach(() => {
    clearStoredToken();
    vi.unstubAllGlobals();
  });

  it("keeps the stored session token and JSON payload on explicit requests", async () => {
    setStoredToken("test-session-token");
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
      data: { saved: true },
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    }));

    await apiClient.patch("/users/me", { name: "Анна" }, { adapter });

    const config = adapter.mock.calls[0][0];
    expect(config.method).toBe("patch");
    expect(config.headers.get("Authorization")).toBe("Bearer test-session-token");
    expect(config.headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(config.data)).toEqual({ name: "Анна" });
  });

  it("keeps native FormData and lets the browser supply its multipart boundary", async () => {
    setStoredToken("test-upload-token");
    const form = new FormData();
    form.append("file", new Blob(["image-data"], { type: "image/png" }), "test.png");
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
      data: { uploaded: true },
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    }));

    await apiClient.post("/admin/exercises/test/media", form, { adapter });

    const config = adapter.mock.calls[0][0];
    expect(config.data).toBe(form);
    expect(config.headers.get("Authorization")).toBe("Bearer test-upload-token");
    expect(config.headers.get("Content-Type")).not.toBe("application/json");
    expect(config.headers.get("Content-Type")).not.toContain("multipart/form-data");
  });
});
