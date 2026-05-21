import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { API_DOCS_PATH, API_SPEC_PATH } from "../auth/api-token";
import { adminApiRouteDefinitions } from "../modules/admin/admin.routes";
import { attachmentApiRouteDefinitions } from "../modules/attachments/attachment.routes";
import { circleApiRouteDefinitions } from "../modules/circles/circle.routes";
import { habitApiRouteDefinitions } from "../modules/habits/habit.routes";
import { statsApiRouteDefinitions } from "../modules/stats/stats.routes";
import { todayApiRouteDefinitions } from "../modules/today/today.routes";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type SupportedLocale = "en" | "zh-CN";

type ExampleDefinition = {
  summary: string;
  value: unknown;
};

type SchemaDefinition = {
  description: string;
  schema: z.ZodType;
  examples?: Record<string, ExampleDefinition>;
};

export type PublicApiRouteDefinition = {
  method: HttpMethod;
  path: string;
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  request?: {
    params?: z.ZodType;
    query?: z.ZodType;
    body?: z.ZodType;
    bodyExamples?: Record<string, ExampleDefinition>;
  };
  responses: Record<number, SchemaDefinition>;
};

const publicApiRouteDefinitions: PublicApiRouteDefinition[] = [
  ...habitApiRouteDefinitions,
  ...todayApiRouteDefinitions,
  ...statsApiRouteDefinitions,
  ...circleApiRouteDefinitions,
  ...adminApiRouteDefinitions,
  ...attachmentApiRouteDefinitions,
];

const localeCookieName = "mikoshi-tracker-locale";
const defaultLocale: SupportedLocale = "en";

type ApiDocsCopy = {
  title: string;
  eyebrow: string;
  localeHint: string;
  intro: string;
  operationIdLabel: string;
  requestExampleLabel: string;
  responseExampleLabel: (statusCode: string) => string;
  specLinkLabel: string;
};

const apiDocsCopy: Record<SupportedLocale, ApiDocsCopy> = {
  en: {
    title: "MikoshiTracker API Docs",
    eyebrow: "OpenAPI + Interactive Reference",
    localeHint: "This page follows your current app language. API contract items stay in English.",
    intro:
      "This reference is generated from the same route metadata that powers the bearer-authenticated habits, today, stats, and circles runtime.",
    operationIdLabel: "Operation ID",
    requestExampleLabel: "Request Example",
    responseExampleLabel: (statusCode) => `${statusCode} Example`,
    specLinkLabel: "OpenAPI JSON",
  },
  "zh-CN": {
    title: "MikoshiTracker API 文档",
    eyebrow: "OpenAPI + 交互式参考",
    localeHint: "当前页面会跟随你在应用中的语言。API 合同项保持英文。",
    intro:
      "这份参考页由同一套路由元数据生成，而这些元数据也驱动着 bearer-authenticated 的 habits、today、stats 和 circles 运行时。",
    operationIdLabel: "Operation ID",
    requestExampleLabel: "请求示例",
    responseExampleLabel: (statusCode) => `${statusCode} 示例`,
    specLinkLabel: "OpenAPI JSON",
  },
};

function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (normalized.startsWith("zh")) {
    return "zh-CN";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }

  return null;
}

function resolveLocaleFromAcceptLanguage(value: string | null | undefined): SupportedLocale | null {
  if (!value) {
    return null;
  }

  for (const part of value.split(",")) {
    const candidate = normalizeLocale(part.split(";")[0]?.trim());

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getCookieValue(header: string | null, name: string) {
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function resolveDocsLocale(request: FastifyRequest): SupportedLocale {
  const preferredLocale = normalizeLocale(getCookieValue(getHeaderValue(request.headers.cookie), localeCookieName));

  if (preferredLocale) {
    return preferredLocale;
  }

  return resolveLocaleFromAcceptLanguage(getHeaderValue(request.headers["accept-language"])) ?? defaultLocale;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function routePathToOpenApi(path: string) {
  return path.replaceAll(/:([a-zA-Z0-9_]+)/g, "{$1}");
}

function toExamples(examples?: Record<string, ExampleDefinition>) {
  if (!examples) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(examples).map(([name, example]) => [
      name,
      {
        summary: example.summary,
        value: example.value,
      },
    ]),
  );
}

function objectEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>);
}

function toJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema);
}

function toParameters(schema: z.ZodType | undefined, location: "path" | "query") {
  if (!schema) {
    return [];
  }

  const jsonSchema = toJsonSchema(schema);
  const required = new Set(
    Array.isArray((jsonSchema as { required?: string[] }).required)
      ? ((jsonSchema as { required?: string[] }).required ?? [])
      : [],
  );

  return objectEntries((jsonSchema as { properties?: Record<string, unknown> }).properties).map(([name, value]) => ({
    name,
    in: location,
    required: location === "path" ? true : required.has(name),
    schema: value,
  }));
}

function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of publicApiRouteDefinitions) {
    const openApiPath = routePathToOpenApi(route.path);
    const operation = {
      operationId: route.operationId,
      summary: route.summary,
      description: route.description,
      tags: route.tags,
      security: route.security,
      parameters: [...toParameters(route.request?.params, "path"), ...toParameters(route.request?.query, "query")],
      requestBody: route.request?.body
        ? {
            required: true,
            content: {
              "application/json": {
                schema: toJsonSchema(route.request.body),
                examples: toExamples(route.request.bodyExamples),
              },
            },
          }
        : undefined,
      responses: Object.fromEntries(
        Object.entries(route.responses).map(([statusCode, response]) => [
          statusCode,
          {
            description: response.description,
            content: {
              "application/json": {
                schema: toJsonSchema(response.schema),
                examples: toExamples(response.examples),
              },
            },
          },
        ]),
      ),
    };

    paths[openApiPath] ??= {};
    paths[openApiPath][route.method.toLowerCase()] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "MikoshiTracker API",
      version: "1.0.0",
      description:
        "Bearer-authenticated REST API for habits, today's workflow, overview stats, and Habit Circles collaboration.",
    },
    servers: [
      {
        url: "/",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Personal API token",
          description: "Use the personal API token generated from the signed-in API Access page.",
        },
        CircleBearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Circle token",
          description:
            "A circle-scoped token (prefix: mikoshi_tracker_circle_). It is authorised to read shared habits and write check-ins for exactly one circle. Minted by the circle owner from the Circles management page.",
        },
        AdminKeyAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Admin API key",
          description:
            "The operator-configured system key set via the MIKOSHI_TRACKER_ADMIN_API_KEY environment variable. Required for all /api/admin/* provisioning routes. Distinct from personal tokens, circle tokens, and the User.isAdmin role.",
        },
      },
    },
    paths,
  };
}

function renderRequestExamples(route: PublicApiRouteDefinition, copy: ApiDocsCopy) {
  if (!route.request?.bodyExamples) {
    return "";
  }

  return Object.values(route.request.bodyExamples)
    .map(
      (example) => `
        <div class="example-block">
          <h4>${escapeHtml(copy.requestExampleLabel)}: ${escapeHtml(example.summary)}</h4>
          <pre>${escapeHtml(JSON.stringify(example.value, null, 2))}</pre>
        </div>
      `,
    )
    .join("");
}

function renderResponseExamples(route: PublicApiRouteDefinition, copy: ApiDocsCopy) {
  return Object.entries(route.responses)
    .map(([statusCode, response]) => {
      const examples = response.examples
        ? Object.values(response.examples)
            .map(
              (example) => `
                <div class="example-block">
                  <h4>${escapeHtml(copy.responseExampleLabel(statusCode))}: ${escapeHtml(example.summary)}</h4>
                  <pre>${escapeHtml(JSON.stringify(example.value, null, 2))}</pre>
                </div>
              `,
            )
            .join("")
        : "";

      return `
        <section class="response-block">
          <p><strong>${statusCode}</strong> ${escapeHtml(response.description)}</p>
          ${examples}
        </section>
      `;
    })
    .join("");
}

function renderOperation(route: PublicApiRouteDefinition, copy: ApiDocsCopy) {
  return `
    <details class="operation">
      <summary>
        <span class="method">${escapeHtml(route.method)}</span>
        <code>${escapeHtml(route.path)}</code>
        <span class="summary-text">${escapeHtml(route.summary)}</span>
      </summary>
      <div class="operation-body">
        <p>${escapeHtml(route.description)}</p>
        <p><strong>${escapeHtml(copy.operationIdLabel)}:</strong> ${escapeHtml(route.operationId)}</p>
        ${renderRequestExamples(route, copy)}
        ${renderResponseExamples(route, copy)}
      </div>
    </details>
  `;
}

function renderDocsPage(locale: SupportedLocale) {
  const copy = apiDocsCopy[locale];

  const grouped = new Map<string, PublicApiRouteDefinition[]>();
  for (const route of publicApiRouteDefinitions) {
    const tag = route.tags[0] ?? "Other";
    const bucket = grouped.get(tag);
    if (bucket) {
      bucket.push(route);
    } else {
      grouped.set(tag, [route]);
    }
  }

  const sections = [...grouped.entries()]
    .map(
      ([tag, routes]) => `
        <section class="tag-section">
          <h2 class="tag-heading">${escapeHtml(tag)}</h2>
          ${routes.map((r) => renderOperation(r, copy)).join("")}
        </section>
      `,
    )
    .join("");

  const operations = sections;

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
      }
      body {
        margin: 0;
        background: linear-gradient(180deg, #f7f1e7 0%, #efe6d8 100%);
        color: #2f241a;
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 3rem 1.5rem 4rem;
      }
      .hero {
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(84, 58, 31, 0.12);
        border-radius: 2rem;
        padding: 2rem;
        box-shadow: 0 24px 80px rgba(56, 38, 17, 0.08);
      }
      .hero p, .operation-body p {
        line-height: 1.6;
      }
      .meta-links {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        margin-top: 1rem;
      }
      .meta-links a {
        color: #173d35;
        font-weight: 700;
      }
      .operation {
        margin-top: 1rem;
        border: 1px solid rgba(84, 58, 31, 0.12);
        border-radius: 1.25rem;
        background: rgba(255, 255, 255, 0.78);
        overflow: hidden;
      }
      .operation summary {
        cursor: pointer;
        list-style: none;
        padding: 1rem 1.25rem;
        display: flex;
        gap: 0.75rem;
        align-items: center;
        flex-wrap: wrap;
      }
      .operation summary::-webkit-details-marker {
        display: none;
      }
      .operation-body {
        padding: 0 1.25rem 1.25rem;
      }
      .method {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 3.75rem;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        background: #173d35;
        color: #f8f3eb;
        font-family: ui-monospace, monospace;
        font-size: 0.85rem;
        font-weight: 700;
      }
      .summary-text {
        color: #5a4d40;
      }
      pre, code {
        font-family: ui-monospace, "SFMono-Regular", monospace;
      }
      pre {
        margin: 0.4rem 0 0;
        padding: 1rem;
        border-radius: 1rem;
        overflow-x: auto;
        background: #1d1f21;
        color: #f2efe9;
      }
      .example-block + .example-block, .response-block + .response-block {
        margin-top: 1rem;
      }
      .tag-section {
        margin-top: 2rem;
      }
      .tag-heading {
        margin: 0 0 0.5rem;
        font-size: 1.1rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #756858;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p style="margin:0; letter-spacing:0.08em; text-transform:uppercase; color:#756858; font-size:0.8rem;">${escapeHtml(copy.eyebrow)}</p>
        <h1 style="margin:0.4rem 0 0; font-size:2.4rem;">MikoshiTracker API</h1>
        <p>Authorization: Bearer <code>&lt;personal-token&gt;</code> or <code>&lt;circle-token&gt;</code></p>
        <p>${escapeHtml(copy.localeHint)}</p>
        <p>${escapeHtml(copy.intro)}</p>
        <div class="meta-links">
          <a href="${API_SPEC_PATH}">${escapeHtml(copy.specLinkLabel)}: ${API_SPEC_PATH}</a>
        </div>
      </section>
      <section style="margin-top:1.5rem;">
        ${operations}
      </section>
    </main>
  </body>
</html>`;
}

export async function registerOpenApi(app: FastifyInstance) {
  app.get(API_SPEC_PATH, async () => buildOpenApiDocument());
  app.get(API_DOCS_PATH, async (request, reply) => {
    const locale = resolveDocsLocale(request);

    reply.type("text/html; charset=utf-8");
    reply.header("Vary", "Accept-Language, Cookie");
    return renderDocsPage(locale);
  });
}
