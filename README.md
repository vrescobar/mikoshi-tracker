# MikoshiTracker

Self-hosted **generic typed-entries tracker** — habits, meals, weight, and any recurring or event-log data — that makes "what should I do today?" legible to both humans and AI. Habits are one of several `EntryType`s; `food_meal` and `weight_log` are non-habit types.

自托管**通用条目追踪工具** — 习惯、餐食及任何周期性或事件日志数据 — 让人和 AI 都能清楚地知道"今天该做什么"。

> **Origin:** MikoshiTracker is a fork of [`haaabit`](https://github.com/vrescobar/haaabit) (originally MIT-licensed,
> Copyright © 2026 Finn). See [`LICENSE`](LICENSE) for the full attribution.

## Features / 功能

- **Today-first dashboard** — see pending and completed habits at a glance, with completion rates, trends, and today's food summary
- **Generic typed-entries engine** — any data modelled as an `EntryType` with a JSON-Schema-validated payload, a cadence (`recurring` or `event_log`), and a declarative aggregations spec; no new tables or services required per type
- **Built-in types:** `habit_boolean`, `habit_quantity`, `food_meal` (daily nutrition log with kcal/macro tracking), and `weight_log` (bodyweight tracker with trend aggregations)
- **Boolean and quantified habits** — simple yes/no or numeric targets (e.g. "Read 10 pages")
- **Flexible recurrence** — daily, specific weekdays, weekly count, or monthly count
- **Food log** — per-meal kcal/macro events, calendar heatmap, insights, and a WhatsApp-driven AI ingestion skill (`mikoshi-tracker-food` in the Mikoshi repo)
- **Reversible check-ins** — every action creates an immutable mutation record; undo anytime
- **Streaks and analytics** — current/longest streaks, 7-day and 30-day trends, stability ranking, and a declarative aggregation API (`/api/aggregations`)
- **Habit Circles** — social layer where several users share a leaderboard; circle tokens let an external bot (WhatsApp / Mikoshi) record check-ins on shared habits only
- **REST API with OpenAPI docs** — bearer-authenticated endpoints for habits, today, stats, entries, events, aggregations, and circles
- **MCP package for AI hosts** — publishable `@mikoshi-tracker/mcp` package that exposes habits, today, stats, entries, events, and aggregations over local `stdio`
- **AI-ready** — structured API and provenance-tracked mutations let AI agents check in on your behalf; skill pointer on each `EntryType` links to the responsible ingestion skill
- **Trilingual UI** — English, Chinese, and Spanish with browser-language detection and manual switching
- **Archive and restore** — shelve habits without losing history
- **Admin controls** — first user becomes admin; toggle new-user registration on or off; system-key provisioning for bot-operated circles
- **Lightweight native deployment** — SQLite (`bun:sqlite`) and a single systemd user unit where one Bun process serves both the API and the built SPA; no ORM, no reverse proxy, no containers

## Tech Stack / 技术栈

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| API      | Fastify, better-auth, Zod                   |
| Web      | Vite + React (SPA), React Router, CSS Modules, Radix UI |
| Database | SQLite via native `bun:sqlite` (raw SQL + zod row schemas; no ORM) |
| Serving  | Single Bun process serves the API + built SPA (no reverse proxy) |
| Runtime  | TypeScript, Bun (workspace), Node.js        |
| Testing  | bun test (API), Vitest (web unit), Playwright (E2E) |

## Quick Start (native) / 快速开始

```bash
git clone https://github.com/vrescobar/mikoshi-tracker.git
cd mikoshi-tracker
bun install

./scripts/install-services.sh   # installs systemd user units
# Create ~/.config/mikoshi-tracker/env as printed by the script
# (BETTER_AUTH_SECRET: openssl rand -hex 32)
./scripts/deploy.sh             # build + migrate + restart + health check
```

Open `http://localhost:7080` — the first registered user becomes admin.

For the full setup guide (prerequisites, env reference, troubleshooting), see
[Self-host install guide / 自托管安装指南](./docs/self-hosting.md). For
public-internet hardening see
[docs/PUBLIC-DEPLOYMENT.md](./docs/PUBLIC-DEPLOYMENT.md).

For upgrades, see [Self-host upgrade guide / 自托管升级指南](./docs/self-hosting-upgrades.md).

## Local Development / 本地开发

Prerequisites: Bun 1.3+, Node.js 20+

```bash
# Install dependencies
bun install

# Create apps/api/.env (DATABASE_URL, BETTER_AUTH_SECRET, …) — the API
# auto-applies SQL migrations from apps/api/migrations on boot.

# Start API and web in parallel (Vite proxies /api + /magic to the API)
bun run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- API docs: `http://localhost:3001/api/docs`

### Running Tests / 运行测试

```bash
# API unit tests (Vitest)
bun run test

# E2E browser tests (Playwright)
bun run test:e2e
```

## Generic Entries Architecture / 通用条目架构

MikoshiTracker is built around a schema-driven engine where every domain (habits, meals, …) is an `EntryType` row with a JSON-Schema-validated payload. Adding a new type requires only inserting an `EntryType` row (and, optionally, shipping a Mikoshi skill) — no new tables, services, or endpoints. See [`docs/architecture/generic-entries.md`](./docs/architecture/generic-entries.md) for diagrams and a full walkthrough.

Key components:

| Component | Location | Purpose |
|---|---|---|
| `EntryType` | `apps/api/migrations/0001_baseline.sql` | Declares slug, cadence, payload/config JSON Schemas, aggregations spec, optional `skillSlug` |
| Schema cache | `apps/api/src/modules/entry-types/schema-cache.ts` | In-memory JSON Schema → Zod compiler; invalidated on type update |
| Entries | `apps/api/src/modules/entries/` | CRUD for entries; `config` validated at write time |
| Events | `apps/api/src/modules/events/` | Payload-validated event append; `EventMutation` immutable audit trail |
| Aggregations | `apps/api/src/modules/aggregations/` | Declarative SQL engine; sums/streaks/missing-days over any window |
| Legacy aliases | `apps/api/src/modules/habits/`, `today/` | Thin adapters over the new engine; `/api/habits/*` and `/api/today/*` continue to work |

## API Overview / API 概览

All endpoints require Bearer token authentication. Generate a personal API token from the web UI under API Access.

**Legacy habit endpoints (thin aliases over the generic engine):**

| Method  | Endpoint               | Description                         |
| ------- | ---------------------- | ----------------------------------- |
| `GET`   | `/api/today`           | Today's habits with status          |
| `POST`  | `/api/today/complete`  | Complete a boolean habit            |
| `POST`  | `/api/today/set-total` | Set value for a quantified habit    |
| `POST`  | `/api/today/undo`      | Undo the latest check-in            |
| `GET`   | `/api/habits`          | List habits (filterable)            |
| `POST`  | `/api/habits`          | Create a habit                      |
| `GET`   | `/api/habits/:id`      | Habit detail with stats and history |
| `PATCH` | `/api/habits/:id`      | Update a habit                      |
| `GET`   | `/api/stats/overview`  | Dashboard analytics                 |

**Generic entries API:**

| Method   | Endpoint                           | Description                                 |
| -------- | ---------------------------------- | ------------------------------------------- |
| `GET`    | `/api/entry-types`                 | List active entry types with schemas        |
| `GET`    | `/api/entry-types/:slug`           | Entry type detail                           |
| `GET`    | `/api/entries`                     | List entries (filterable by type, active)   |
| `POST`   | `/api/entries`                     | Create an entry (config validated)          |
| `GET`    | `/api/entries/:id`                 | Entry detail                                |
| `PATCH`  | `/api/entries/:id`                 | Update an entry                             |
| `POST`   | `/api/entries/:id/archive\|restore`| Toggle active state                         |
| `POST`   | `/api/entries/:id/events`          | Append an event (payload validated)         |
| `GET`    | `/api/events`                      | List events with cursor pagination          |
| `GET`    | `/api/events/:eventId`             | Event detail with mutations and attachments |
| `PATCH`  | `/api/events/:eventId`             | Partial payload edit (creates UPDATE mutation) |
| `DELETE` | `/api/events/:eventId`             | Soft-delete (creates DELETE mutation)       |
| `POST`   | `/api/events/:eventId/undo`        | Revert last non-UNDO mutation               |
| `GET`    | `/api/aggregations`                | Declarative aggregations (sum/streak/etc.)  |
| `GET`    | `/api/openapi.json`                | OpenAPI 3.1 spec                            |
| `GET`    | `/api/docs`                        | Interactive API documentation               |

Full request/response examples are available at `/api/docs`.

## OpenClaw Native Plugin / OpenClaw 原生插件

MikoshiTracker now ships a native OpenClaw plugin for the OpenClaw host:

- Package: [`@mikoshi-tracker/openclaw-plugin`](./packages/openclaw-plugin/README.md)
- Canonical OpenClaw setup asset: [`packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](./packages/openclaw-plugin/examples/openclaw-plugin.jsonc)
- Runtime env: `MIKOSHI_TRACKER_API_URL` + `MIKOSHI_TRACKER_API_TOKEN`
- Tool contract: direct `habits_*`, `today_*`, and `stats_get_overview` tools backed by the MikoshiTracker API
- Result contract: stable JSON envelopes shaped as `{ ok, toolName, summary, data }` on success and `{ ok, toolName, error }` on failure
- Optional workflow guidance: [`skills/mikoshi-tracker-mcp`](./skills/mikoshi-tracker-mcp/SKILL.md) and [`.agents/skills/mikoshi-tracker-mcp`](./.agents/skills/mikoshi-tracker-mcp/SKILL.md)

Recommended OpenClaw strategy:

1. Load the native plugin first with [`packages/openclaw-plugin/examples/openclaw-plugin.jsonc`](./packages/openclaw-plugin/examples/openclaw-plugin.jsonc).
2. Inject `MIKOSHI_TRACKER_API_URL` and `MIKOSHI_TRACKER_API_TOKEN` into the plugin runtime.
3. If the host also supports workspace Skills, add [`skills/mikoshi-tracker-mcp`](./skills/mikoshi-tracker-mcp/SKILL.md) as optional routing guidance. Do not treat the Skill as the transport layer.
4. If you only have account credentials, run `npx -y @mikoshi-tracker/mcp bootstrap-token --api-url <...> --email <...>` once, then store the returned personal API token as `MIKOSHI_TRACKER_API_TOKEN`.

## MCP Package / MCP 包

MikoshiTracker also ships a standalone MCP package for generic MCP clients:

- Package: [`@mikoshi-tracker/mcp`](./packages/mcp/README.md)
- Transport: local `stdio`
- Canonical generic-host setup: [`packages/mcp/README.md`](./packages/mcp/README.md)
- OpenClaw example: [`packages/mcp/examples/openclaw.jsonc`](./packages/mcp/examples/openclaw.jsonc)
- Built-in guidance: `mikoshi_tracker_assistant_workflow` prompt and `mikoshi-tracker://guides/workflow` resource
- Best fit: generic MCP clients, Claude Code MCP, Inspector, one-shot `bootstrap-token`

If the agent also supports repo-local Skills, invoke `$mikoshi-tracker-mcp` for stronger today-first guidance, including bilingual trigger phrases like `今天还剩哪些习惯没做？`, `撤销刚才的打卡。`, or `How am I doing this week?`.

See [`packages/openclaw-plugin/README.md`](./packages/openclaw-plugin/README.md) for the native OpenClaw path, [`packages/mcp/README.md`](./packages/mcp/README.md) for generic MCP hosts, [AI Agent Integration / AI 机器人接入](./docs/ai-agent-integration.md) for host-by-host guidance, and [OpenClaw Troubleshooting](./docs/openclaw-troubleshooting.md) for symptom-driven fixes.

## Project Structure / 项目结构

```
apps/
  api/          Fastify API server (also serves the built SPA in production)
    migrations/    Forward-only SQL migrations (0001_baseline.sql = full schema)
    src/db/        bun:sqlite client, migration runner, zod row coercions
    src/modules/
      entry-types/   EntryType catalog + JSON Schema → Zod compiler + schema cache
      entries/       Generic entry CRUD (config validated at write time)
      events/        Generic event CRUD (payload validated; EventMutation audit trail)
      aggregations/  Declarative aggregation engine (sum/streak/missing_days)
      habits/        Legacy alias over entries/ (preserves /api/habits/* contract)
      today/         Legacy alias over events/ (preserves /api/today/* contract)
      circles/       Habit Circles — social leaderboard + circle-token auth
      admin/         System-key provisioning for bot-operated circles
  web/          Vite + React SPA (built to dist/, served by the Bun API process)
    src/pages/
      entries        Generic entry list with EntryType dispatch
      food           Food log — timeline, event detail, insights heatmap
      circles        Circles management UI
packages/
  contracts/    Shared Zod schemas and TypeScript types
    src/
      entries.ts     Entry + create-event contracts
      events.ts      EntryEvent + EventMutation contracts
      entry-types.ts EntryType catalog contracts
      aggregations.ts Aggregation query + response contracts
      circles.ts     Circle + membership + token contracts
  openclaw-plugin/ Native OpenClaw plugin package
  mcp/          MCP server package for generic AI hosts
scripts/self-host/ systemd unit + health check
docs/
  architecture/ Architecture docs (generic-entries, performance)
  self-hosting.md, self-hosting-upgrades.md, PUBLIC-DEPLOYMENT.md
  ai-agent-integration.md, openclaw-*.md
```

## License / 许可证

[MIT](./LICENSE)
