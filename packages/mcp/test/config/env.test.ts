import { describe, expect, it } from "vitest";

import { parseBootstrapConfig, parseConfig, redactSecrets, type ConfigInput } from "../../src/config/env";

function createInput(overrides: Partial<ConfigInput> = {}): ConfigInput {
  return {
    env: {
      MIKOSHI_TRACKER_API_URL: "https://habit.example.com/api",
      MIKOSHI_TRACKER_API_TOKEN: "secret-token",
    },
    argv: [],
    ...overrides,
  };
}

describe("parseConfig", () => {
  it("requires MIKOSHI_TRACKER_API_URL and MIKOSHI_TRACKER_API_TOKEN by default", () => {
    expect(() =>
      parseConfig({
        env: {},
        argv: [],
      }),
    ).toThrowError(
      "Missing required configuration: MIKOSHI_TRACKER_API_URL, MIKOSHI_TRACKER_API_TOKEN. The normal MikoshiTracker MCP server expects a personal API token in MIKOSHI_TRACKER_API_TOKEN.",
    );
  });

  it("explains how password-only operators should reach the runtime token contract", () => {
    expect(() =>
      parseConfig({
        env: {
          MIKOSHI_TRACKER_API_URL: "https://habit.example.com/api",
          MIKOSHI_TRACKER_BOOTSTRAP_EMAIL: "alice@example.com",
        },
        argv: [],
      }),
    ).toThrowError(/bootstrap-token/);
  });

  it("accepts --api-url and --timeout overrides", () => {
    const config = parseConfig(
      createInput({
        argv: ["--api-url", "https://override.example.com/api", "--timeout", "2500"],
      }),
    );

    expect(config).toMatchObject({
      apiUrl: "https://override.example.com/api",
      apiToken: "secret-token",
      timeoutMs: 2500,
    });
  });

  it("does not guess missing /api suffixes", () => {
    const config = parseConfig(
      createInput({
        env: {
          MIKOSHI_TRACKER_API_URL: "https://habit.example.com",
          MIKOSHI_TRACKER_API_TOKEN: "secret-token",
        },
      }),
    );

    expect(config.apiUrl).toBe("https://habit.example.com");
  });

  it("rejects invalid timeout values", () => {
    expect(() =>
      parseConfig(
        createInput({
          argv: ["--timeout", "nope"],
        }),
      ),
    ).toThrowError("Invalid --timeout value: nope");
  });
});

describe("parseBootstrapConfig", () => {
  it("accepts the dedicated bootstrap credential inputs without changing the server runtime contract", () => {
    const config = parseBootstrapConfig({
      env: {
        MIKOSHI_TRACKER_BOOTSTRAP_EMAIL: "alice@example.com",
        MIKOSHI_TRACKER_BOOTSTRAP_PASSWORD: "password123",
      },
      argv: ["--api-url", "https://habit.example.com/api", "--force"],
    });

    expect(config).toEqual({
      apiUrl: "https://habit.example.com/api",
      email: "alice@example.com",
      password: "password123",
      force: true,
    });
  });

  it("requires api url and bootstrap email for the explicit helper flow", () => {
    expect(() =>
      parseBootstrapConfig({
        env: {},
        argv: [],
      }),
    ).toThrowError("Missing required bootstrap configuration: MIKOSHI_TRACKER_API_URL, --email or MIKOSHI_TRACKER_BOOTSTRAP_EMAIL.");
  });
});

describe("redactSecrets", () => {
  it("redacts bearer tokens, password values, cookies, and explicit secrets", () => {
    const message = redactSecrets(
      "Bearer secret-token password password123 cookie session=abc123 token secret-token",
      {
        MIKOSHI_TRACKER_API_TOKEN: "secret-token",
        MIKOSHI_TRACKER_BOOTSTRAP_PASSWORD: "password123",
      },
      ["abc123"],
    );

    expect(message).not.toContain("secret-token");
    expect(message).not.toContain("password123");
    expect(message).not.toContain("abc123");
    expect(message).toContain("[REDACTED]");
  });
});
