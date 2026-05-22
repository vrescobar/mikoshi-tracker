# OpenClaw Troubleshooting

Use this guide when the documented native OpenClaw setup still does not work after you copied [`../packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](../packages/openclaw-plugin/examples/openclaw-plugin.jsonc).

This is a troubleshooting guide, not a second setup path.

Supported native runtime contract:

- `MIKOSHI_TRACKER_API_URL`
- `MIKOSHI_TRACKER_API_TOKEN`
- optional Skill layer via [`../skills/mikoshi-tracker-mcp/SKILL.md`](../skills/mikoshi-tracker-mcp/SKILL.md)

## Symptom Matrix

| Symptom                                                                                                           | What it usually means                                                                                                   | Supported fix                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin not loading`                                                                                              | OpenClaw is not loading `@mikoshi-tracker/openclaw-plugin` at all                                                               | Re-check the plugin block in [`../packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](../packages/openclaw-plugin/examples/openclaw-plugin.jsonc) and confirm the host can resolve the package. |
| `Invalid schema for function 'habits_edit': schema must be a JSON Schema of 'type: "object"', got 'type: "None"'` | You are loading a plugin build where `habits_edit` exported a top-level intersection schema instead of an object schema | Update to a build that includes Quick Task 13 or rebuild the current workspace plugin so `habits_edit` registers with top-level `type: "object"` and required `habitId`.                              |
| `skill visible, tools missing`                                                                                    | The Skill loaded but the MCP server is not running or the token is missing                                              | Confirm the MCP server is configured and `MIKOSHI_TRACKER_API_TOKEN` is injected. The Skill is not a transport layer — it requires a live MCP server.                                                        |
| Startup says `MIKOSHI_TRACKER_API_TOKEN` is missing                                                                       | The native plugin runtime did not receive the token env                                                                 | Put a personal API token into the secret that resolves to `MIKOSHI_TRACKER_API_TOKEN`. Do not inject an email or password.                                                                                    |
| Startup says the token looks more like an email address or URL                                                    | The wrong secret shape was injected                                                                                     | Keep the API URL in `MIKOSHI_TRACKER_API_URL` and inject a personal API token into `MIKOSHI_TRACKER_API_TOKEN`.                                                                                                       |
| Tool returns `error.category = "auth"`                                                                            | The token reached the plugin, but it is rejected by the API                                                             | Replace or rotate `MIKOSHI_TRACKER_API_TOKEN` and retry.                                                                                                                                                      |
| Tool returns `error.category = "not_found"`                                                                       | The `habitId` does not exist for this user anymore                                                                      | Re-read with `habits_list` or inspect the target habit before mutating.                                                                                                                               |
| Tool returns `error.category = "wrong_kind"`                                                                      | The mutation tool does not match the habit kind                                                                         | Follow `error.suggestedTool`, for example `today_complete` vs `today_set_total`.                                                                                                                      |
| Tool returns `error.category = "timeout"` or `"network"`                                                          | The plugin could not reach the API reliably                                                                             | Retry once, then inspect network reachability and `MIKOSHI_TRACKER_API_URL`.                                                                                                                                  |
| You only have account credentials                                                                                 | You are still before steady-state runtime setup                                                                         | Run `npx -y @mikoshi-tracker/mcp bootstrap-token --api-url <...> --email <...>` once, then store the returned token as `MIKOSHI_TRACKER_API_TOKEN`.                                                                   |

## Decision Points

## 1. The plugin does not load

Checklist:

1. Confirm OpenClaw is using [`../packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](../packages/openclaw-plugin/examples/openclaw-plugin.jsonc).
2. Confirm the host can resolve `@mikoshi-tracker/openclaw-plugin`.
3. Confirm `MIKOSHI_TRACKER_API_URL` and `MIKOSHI_TRACKER_API_TOKEN` are injected into the plugin runtime.

## 2. The runtime rejects the token value

The plugin is intentionally strict here.

- `MIKOSHI_TRACKER_API_URL` should be your API base URL such as `https://your-mikoshi-tracker.example.com/api`.
- `MIKOSHI_TRACKER_API_TOKEN` should be a personal API token.
- If startup says the value looks like an email or URL, fix secret mapping instead of trying alternate env names.

## 3. A tool returns a structured error

Do not branch on the prose first. Branch on machine-readable fields:

- `error.category`
- `error.retryable`
- `error.resolution`
- `error.suggestedTool`

Typical cases:

- `wrong_kind` -> switch to the tool named by `suggestedTool`
- `not_found` -> re-read and get a valid `habitId`
- `auth` -> replace token and retry
- `timeout` / `network` -> safe retry path

## 4. You only have account credentials and no token yet

Use the one-shot helper:

```bash
npx -y @mikoshi-tracker/mcp bootstrap-token \
  --api-url https://your-mikoshi-tracker.example.com/api \
  --email you@example.com
```

If the account already has a personal API token, the helper may require `--force` before rotating it.

After success:

1. Save the returned personal API token in the secret store used by OpenClaw.
2. Put that token into `MIKOSHI_TRACKER_API_TOKEN`.
3. Go back to the native plugin setup from [`../packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](../packages/openclaw-plugin/examples/openclaw-plugin.jsonc).

## Canonical References

- Native package guide: [`../packages/openclaw-plugin/README.md`](../packages/openclaw-plugin/README.md)
- Native setup asset: [`../packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](../packages/openclaw-plugin/examples/openclaw-plugin.jsonc)
- Migration note: [`./openclaw-migration.md`](./openclaw-migration.md)
- Cross-host integration guide: [`./ai-agent-integration.md`](./ai-agent-integration.md)
- Validation checklist: [`./openclaw-validation-checklist.md`](./openclaw-validation-checklist.md)
- Generic MCP package: [`../packages/mcp/README.md`](../packages/mcp/README.md)
