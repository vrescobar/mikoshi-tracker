import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import defaultRegister, { activate, activateMikoshiTrackerOpenClawPlugin, EXPECTED_TOOL_NAMES, register } from "../src/index";
import openClawDefaultRegister, {
  activate as activateOpenClawEntry,
  register as registerOpenClawEntry,
} from "../src/openclaw";
import type { OpenClawRegisteredTool } from "../src/types";

const packageRoot = new URL("../", import.meta.url);

describe("activateMikoshiTrackerOpenClawPlugin", () => {
  it("registers the planned MikoshiTracker tool catalog through the native plugin API", () => {
    const registerTool = vi.fn();
    const result = activateMikoshiTrackerOpenClawPlugin(
      {
        registerTool,
      },
      {
        env: {
          MIKOSHI_TRACKER_API_URL: "https://habit.example.com/api",
          MIKOSHI_TRACKER_API_TOKEN: "secret-token",
        },
      },
    );

    expect(result.registeredTools).toEqual(EXPECTED_TOOL_NAMES);
    expect(registerTool.mock.calls.map(([tool]) => (tool as OpenClawRegisteredTool).name)).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("exports OpenClaw-compatible register and activate entrypoints", () => {
    const registerTool = vi.fn();

    const registration = register(
      {
        registerTool,
      },
      {
        env: {
          MIKOSHI_TRACKER_API_URL: "https://habit.example.com/api",
          MIKOSHI_TRACKER_API_TOKEN: "secret-token",
        },
      },
    );

    expect(defaultRegister).toBe(register);
    expect(activate).not.toBe(register);
    expect(registration.registeredTools).toEqual(EXPECTED_TOOL_NAMES);
    expect(registerTool.mock.calls.map(([tool]) => (tool as OpenClawRegisteredTool).name)).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("loads through the OpenClaw wrapper entry and flattens nested env sources", () => {
    const registerTool = vi.fn();

    const registration = registerOpenClawEntry(
      {
        registerTool,
        config: {
          env: {
            MIKOSHI_TRACKER_API_URL: "https://api-config.example.com/api",
            MIKOSHI_TRACKER_API_TOKEN: "api-config-token",
          },
        },
      },
      {
        config: {
          env: {
            MIKOSHI_TRACKER_API_TOKEN: "options-config-token",
          },
        },
        env: {
          MIKOSHI_TRACKER_API_URL: "https://habit.example.com/api/",
          MIKOSHI_TRACKER_API_TOKEN: {
            value: "secret-token",
          },
        },
      },
    );

    expect(openClawDefaultRegister).toBe(registerOpenClawEntry);
    expect(activateOpenClawEntry).not.toBe(registerOpenClawEntry);
    expect(registration.config).toEqual({
      apiUrl: "https://habit.example.com/api",
      apiToken: "secret-token",
      timeoutMs: 10_000,
    });
    expect(registration.registeredTools).toEqual(EXPECTED_TOOL_NAMES);
    expect(registerTool.mock.calls.map(([tool]) => (tool as OpenClawRegisteredTool).name)).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("starts successfully when options.env is a plain string map", () => {
    const registerTool = vi.fn();

    const result = registerOpenClawEntry(
      {
        registerTool,
      },
      {
        env: {
          MIKOSHI_TRACKER_API_URL: "https://habit.example.com/api",
          MIKOSHI_TRACKER_API_TOKEN: "secret-token",
        },
      },
    );

    expect(result.config).toEqual({
      apiUrl: "https://habit.example.com/api",
      apiToken: "secret-token",
      timeoutMs: 10_000,
    });
    expect(result.registeredTools).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("starts successfully when api.config.env uses { value } wrappers", () => {
    const registerTool = vi.fn();

    const result = registerOpenClawEntry(
      {
        registerTool,
        config: {
          env: {
            MIKOSHI_TRACKER_API_URL: {
              value: "https://habit.example.com/api/",
            },
            MIKOSHI_TRACKER_API_TOKEN: {
              value: "secret-token",
            },
          },
        },
      },
      {},
    );

    expect(result.config).toEqual({
      apiUrl: "https://habit.example.com/api",
      apiToken: "secret-token",
      timeoutMs: 10_000,
    });
    expect(
      registerTool.mock.calls.find(([tool]) => (tool as OpenClawRegisteredTool).name === "habits_edit")?.[0],
    ).toMatchObject({
      parameters: expect.objectContaining({
        type: "object",
      }),
    });
  });

  it("starts successfully when api.config.env uses env reference objects resolved from process.env", () => {
    const registerTool = vi.fn();
    const previousApiUrl = process.env.MIKOSHI_TRACKER_API_URL;
    const previousApiToken = process.env.MIKOSHI_TRACKER_API_TOKEN;

    process.env.MIKOSHI_TRACKER_API_URL = "https://habit.example.com/api/";
    process.env.MIKOSHI_TRACKER_API_TOKEN = "secret-token";

    try {
      const result = registerOpenClawEntry(
        {
          registerTool,
          config: {
            env: {
              MIKOSHI_TRACKER_API_URL: {
                source: "env",
                id: "MIKOSHI_TRACKER_API_URL",
                provider: "default",
              },
              MIKOSHI_TRACKER_API_TOKEN: {
                source: "env",
                key: "MIKOSHI_TRACKER_API_TOKEN",
                provider: "default",
              },
            },
          },
        },
        {},
      );

      expect(result.config).toEqual({
        apiUrl: "https://habit.example.com/api",
        apiToken: "secret-token",
        timeoutMs: 10_000,
      });
      expect(registerTool.mock.calls.map(([tool]) => (tool as OpenClawRegisteredTool).name)).toEqual(
        EXPECTED_TOOL_NAMES,
      );
    } finally {
      resetProcessEnv("MIKOSHI_TRACKER_API_URL", previousApiUrl);
      resetProcessEnv("MIKOSHI_TRACKER_API_TOKEN", previousApiToken);
    }
  });

  it("fails before registration when required env vars are missing", () => {
    const registerTool = vi.fn();

    expect(() =>
      activateMikoshiTrackerOpenClawPlugin(
        {
          registerTool,
        },
        {
          env: {
            MIKOSHI_TRACKER_API_URL: "https://habit.example.com/api",
          },
        },
      ),
    ).toThrowError(/MIKOSHI_TRACKER_API_TOKEN/);
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("keeps the bootstrap native instead of booting MCP under the hood", async () => {
    const source = await readFile(new URL("src/index.ts", packageRoot), "utf8");
    const openClawSource = await readFile(new URL("src/openclaw.ts", packageRoot), "utf8");

    expect(source).not.toContain("@modelcontextprotocol/sdk");
    expect(source).not.toContain("@mikoshi-tracker/mcp");
    expect(source).not.toContain("mcporter");
    expect(source).not.toContain("child_process");
    expect(openClawSource).not.toContain("@modelcontextprotocol/sdk");
    expect(openClawSource).not.toContain("@mikoshi-tracker/mcp");
    expect(openClawSource).not.toContain("mcporter");
    expect(openClawSource).not.toContain("child_process");
  });
});

function resetProcessEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
