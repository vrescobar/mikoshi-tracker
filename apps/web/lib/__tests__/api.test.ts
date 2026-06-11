/**
 * URL-derivation contract for browser fetches (replaces the old
 * apps/api/test/deployment/web-api-url.test.ts which exercised the deleted
 * server-side helpers): relative by default so the public proxy origin stays
 * canonical, absolute only when VITE_API_BASE_URL is explicitly configured.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { createApiUrl } from "../api";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createApiUrl", () => {
  test("uses relative paths by default so the public proxy origin stays canonical", () => {
    expect(createApiUrl("/api/today")).toBe("/api/today");
  });

  test("uses VITE_API_BASE_URL when one is explicitly configured", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://habit.example.com");
    expect(createApiUrl("/api/openapi.json")).toBe("https://habit.example.com/api/openapi.json");
  });
});
