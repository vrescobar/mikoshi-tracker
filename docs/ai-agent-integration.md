# AI Agent Integration

This guide explains which MikoshiTracker integration surface to use for each host.

## Integration Surfaces

MikoshiTracker ships three separate layers. Do not mix up their roles.

- `@mikoshi-tracker/openclaw-plugin`: native OpenClaw plugin tools. This is the default path for OpenClaw.
- `@mikoshi-tracker/mcp`: generic MCP server for hosts that speak MCP but do not load OpenClaw plugins.
- `mikoshi-tracker-mcp` Skill: optional workflow guidance layer. It teaches routing and payload choice. It is not transport.

In this repository:

- Native OpenClaw package: [`../packages/openclaw-plugin/README.md`](../packages/openclaw-plugin/README.md)
- Canonical OpenClaw-native asset: [`../packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](../packages/openclaw-plugin/examples/openclaw-plugin.jsonc)
- Migration note: [`./openclaw-migration.md`](./openclaw-migration.md)
- Generic MCP package: [`../packages/mcp/README.md`](../packages/mcp/README.md)
- Workspace skill: [`../skills/mikoshi-tracker-mcp/SKILL.md`](../skills/mikoshi-tracker-mcp/SKILL.md)
- Repo-local skill: [`../.agents/skills/mikoshi-tracker-mcp/SKILL.md`](../.agents/skills/mikoshi-tracker-mcp/SKILL.md)

## OpenClaw Native Plugin

Use the native plugin first for OpenClaw.

Runtime contract:

- `MIKOSHI_TRACKER_API_URL`
- `MIKOSHI_TRACKER_API_TOKEN`

Canonical setup asset:

- [`../packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](../packages/openclaw-plugin/examples/openclaw-plugin.jsonc)

Native result contract:

- success: `{ ok: true, toolName, summary, data }`
- failure: `{ ok: false, toolName, error }`

Native failure fields are meant for agents:

- `error.category`
- `error.retryable`
- `error.resolution`
- `error.suggestedTool`

Recommended connection order:

1. Ensure you already have a personal API token.
2. If not, run `bootstrap-token` once through [`@mikoshi-tracker/mcp`](../packages/mcp/README.md).
3. Load `@mikoshi-tracker/openclaw-plugin`.
4. Inject `MIKOSHI_TRACKER_API_URL` and `MIKOSHI_TRACKER_API_TOKEN`.
5. Optionally add the MikoshiTracker Skill if your OpenClaw build also supports workspace Skills.

Do not route OpenClaw through `skill -> mcporter -> MCP -> API` as the primary path anymore.

If you are switching an existing OpenClaw workspace off the older MCP bridge path, follow [`./openclaw-migration.md`](./openclaw-migration.md).

## Generic MCP Hosts

Use [`@mikoshi-tracker/mcp`](../packages/mcp/README.md) when the host:

- supports MCP
- does not load OpenClaw native plugins
- needs `bootstrap-token`
- wants MCP prompts/resources such as `mikoshi_tracker_assistant_workflow` and `mikoshi-tracker://guides/workflow`

This remains the correct path for generic MCP clients, Claude Code MCP, and Inspector.

## Skills

Use the MikoshiTracker Skill only as guidance.

- OpenClaw workspace skill discovery: [`../skills/mikoshi-tracker-mcp/SKILL.md`](../skills/mikoshi-tracker-mcp/SKILL.md)
- Repo-local skill for Codex/Claude-style agents: [`../.agents/skills/mikoshi-tracker-mcp/SKILL.md`](../.agents/skills/mikoshi-tracker-mcp/SKILL.md)

The Skill helps the agent:

- default to `today_get_summary`
- pick `today_complete` vs `today_set_total`
- avoid ambiguous mutations
- ask the minimum clarifying question when payload is incomplete

The Skill does not create callable tools by itself.

## Choose The Right Pattern

### 1. OpenClaw host

Use the native plugin:

- start with [`../packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](../packages/openclaw-plugin/examples/openclaw-plugin.jsonc)
- keep `MIKOSHI_TRACKER_API_URL` and `MIKOSHI_TRACKER_API_TOKEN` in the plugin runtime
- add the Skill only if you want extra routing guidance

### 2. Generic MCP client

Use [`@mikoshi-tracker/mcp`](../packages/mcp/README.md):

- MCP server configuration: use `command: "npx"` with `args: ["-y", "@mikoshi-tracker/mcp"]`
- Env/secret injection: provide `MIKOSHI_TRACKER_API_URL` and `MIKOSHI_TRACKER_API_TOKEN` in the env block
- Example: [`packages/mcp/examples/openclaw.jsonc`](../packages/mcp/examples/openclaw.jsonc)
- optionally load `mikoshi_tracker_assistant_workflow` or `mikoshi-tracker://guides/workflow`
- do not expect `SKILL.md` discovery unless the host explicitly supports it

### 3. Repo-local Skill-aware agent with MCP

Inside this repository, agents can combine:

- MCP transport via [`@mikoshi-tracker/mcp`](../packages/mcp/README.md)
- workflow guidance via `$mikoshi-tracker-mcp`

This is a Repo-local Skill-aware agent with MCP pattern. It remains useful for Codex/Claude-style repo agents even though OpenClaw itself now has a native plugin path.

## Typical Trigger Phrases

The `mikoshi-tracker-mcp` Skill is intentionally multilingual (en / es / zh-CN). Common requests include:

- `What should I do today?`
- `What habits are still left today?`
- `Mark reading as done.`
- `Set water to 1800 ml today.`
- `Undo the last check-in.`
- `How am I doing this week?`

For symptom-driven fixes such as `skill visible, tools missing` or startup errors, see [OpenClaw Troubleshooting](./openclaw-troubleshooting.md).

## Common Mistakes

- Treating the Skill as if it were the transport layer
- Using MCP as the default OpenClaw path when the native plugin is available
- Reusing account credentials in place of `MIKOSHI_TRACKER_API_TOKEN`
- Ignoring `error.category` and `error.resolution` and branching on prose instead

## Short Answer: "Why should OpenClaw use the native plugin now?"

- It removes the extra MCP bridge hop.
- It keeps the same MikoshiTracker API/auth contract.
- It returns stable JSON envelopes directly suited for agents.
- It leaves `@mikoshi-tracker/mcp` available for every other host that still needs MCP.
