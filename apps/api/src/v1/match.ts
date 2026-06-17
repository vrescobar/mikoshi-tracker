import type { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { PrismaClient } from "../generated/prisma/client";
import type { Db } from "../db/client";
import type { AdminOperator } from "../auth/admin-key";
import type { AuthenticatedUser } from "../auth/session";

export type V1Auth = "bearer" | "admin-key" | "circle" | "public";

/**
 * Injectable dependency bag. Today it only carries `db`, but everything the v1
 * handlers need flows through here so `buildV1RouteTable(deps)` is constructable
 * in tests over a throwaway database without a live Fastify instance.
 */
export interface ApiV1Deps {
  db: PrismaClient;
  /** Native bun:sqlite layer, progressively replacing `db` (Prisma). */
  sqlite: Db;
}

/** Auth principal resolved by the pipeline before the handler runs. */
export type V1Principal =
  | { kind: "user"; user: AuthenticatedUser }
  | { kind: "admin"; operator: AdminOperator }
  | { kind: "circle"; circleId: string }
  | { kind: "public" };

export interface V1Context<Input = unknown, Query = unknown, Params = unknown> {
  deps: ApiV1Deps;
  request: FastifyRequest;
  reply: FastifyReply;
  principal: V1Principal;
  input: Input;
  query: Query;
  params: Params;
}

export type V1Handler = (ctx: V1Context) => unknown;

export interface V1RouteMeta {
  method: "GET" | "POST";
  /** Logical resource (used for tags + discovery), e.g. "circles". */
  resource: string;
  /** Path relative to `/api/v1`, e.g. "/circles" or "/circles/snapshot/create". */
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  auth: V1Auth;
  /** True for POST mutations/actions; the ratchet requires these to carry an inputSchema. */
  mutating: boolean;
  /** Marks a GET that returns a list; the ratchet requires query + output schemas. */
  list?: boolean;
  /** Excluded from contract coverage (binary streams, meta endpoints). */
  internal?: boolean;
  deprecated?: boolean;
  deprecationSuccessor?: string;
  successStatus?: number;
  paramsSchema?: z.ZodType;
  querySchema?: z.ZodType;
  inputSchema?: z.ZodType;
  outputSchema?: z.ZodType;
  handler: V1Handler;
}

/** Full path including the namespace prefix, e.g. "/api/v1/circles". */
export function v1FullPath(route: Pick<V1RouteMeta, "path">): string {
  return `/api/v1${route.path}`;
}
