/**
 * Test-only Prisma-compatible shim over the bun:sqlite layer.
 *
 * The production code no longer uses Prisma; only the test suite still reaches
 * for `context.app.db.<model>.<method>(...)` to seed/assert. Rather than rewrite
 * ~140 call sites, this shim re-implements the handful of Prisma Client methods
 * those tests use (findUnique/findFirst/findMany/create/update/updateMany/
 * delete/count + the OrThrow variants) on top of `app.sqlite`, with the same
 * type-coerced row shape Prisma returned (0/1 → boolean, ISO text → Date). This
 * lets the Prisma dependency be dropped entirely.
 */
import type { Db } from "../../src/db/client";
import { newId } from "../../src/db/rows";

type TableSpec = { table: string; bool: string[]; date: string[] };

const SPECS: Record<string, TableSpec> = {
  user: { table: "User", bool: ["emailVerified", "isAdmin"], date: ["createdAt", "updatedAt"] },
  session: { table: "Session", bool: [], date: ["expiresAt", "createdAt", "updatedAt"] },
  account: {
    table: "Account",
    bool: [],
    date: ["accessTokenExpiresAt", "refreshTokenExpiresAt", "createdAt", "updatedAt"],
  },
  verification: { table: "Verification", bool: [], date: ["expiresAt", "createdAt", "updatedAt"] },
  appSettings: { table: "AppSettings", bool: ["registrationEnabled"], date: ["createdAt", "updatedAt"] },
  apiToken: { table: "ApiToken", bool: [], date: ["createdAt", "updatedAt"] },
  circle: {
    table: "Circle",
    bool: [],
    date: ["createdAt", "updatedAt", "contestStartAt", "contestEndAt"],
  },
  circleMembership: { table: "CircleMembership", bool: [], date: ["joinedAt"] },
  circleToken: { table: "CircleToken", bool: [], date: ["createdAt", "updatedAt"] },
  circleEntryShare: { table: "CircleEntryShare", bool: [], date: ["createdAt"] },
  circleLeaderboardSnapshot: { table: "CircleLeaderboardSnapshot", bool: [], date: ["createdAt"] },
  entryType: { table: "EntryType", bool: ["isBuiltIn", "isActive"], date: ["createdAt", "updatedAt"] },
  entry: { table: "Entry", bool: ["isActive"], date: ["createdAt", "updatedAt"] },
  entryWeekday: { table: "EntryWeekday", bool: [], date: [] },
  entryEvent: { table: "EntryEvent", bool: ["completed"], date: ["occurredAt", "createdAt", "updatedAt"] },
  eventMutation: { table: "EventMutation", bool: [], date: ["createdAt"] },
  attachment: { table: "Attachment", bool: [], date: ["createdAt", "updatedAt"] },
  magicLink: { table: "MagicLink", bool: [], date: ["expiresAt", "consumedAt", "createdAt"] },
  adminToken: { table: "AdminToken", bool: ["revoked"], date: ["lastUsedAt", "createdAt", "updatedAt"] },
  adminAuditLog: { table: "AdminAuditLog", bool: [], date: ["createdAt"] },
};

type Row = Record<string, unknown>;

function coerce(spec: TableSpec, row: Row | null): Row | null {
  if (!row) return null;
  const out: Row = { ...row };
  for (const b of spec.bool) if (out[b] !== null && out[b] !== undefined) out[b] = out[b] !== 0;
  for (const d of spec.date) if (out[d] !== null && out[d] !== undefined) out[d] = new Date(out[d] as string);
  return out;
}

function toDb(spec: TableSpec, key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (spec.bool.includes(key)) return value ? 1 : 0;
  if (spec.date.includes(key)) return value instanceof Date ? value.toISOString() : value;
  return value;
}

function buildWhere(spec: TableSpec, where: Row | undefined): { sql: string; args: unknown[] } {
  if (!where || Object.keys(where).length === 0) return { sql: "", args: [] };
  const clauses: string[] = [];
  const args: unknown[] = [];
  for (const [key, raw] of Object.entries(where)) {
    if (raw && typeof raw === "object" && !(raw instanceof Date)) {
      const op = raw as Row;
      if ("in" in op) {
        const list = op.in as unknown[];
        clauses.push(`"${key}" IN (${list.map(() => "?").join(", ")})`);
        args.push(...list.map((v) => toDb(spec, key, v)));
        continue;
      }
      if ("not" in op) {
        if (op.not === null) clauses.push(`"${key}" IS NOT NULL`);
        else {
          clauses.push(`"${key}" != ?`);
          args.push(toDb(spec, key, op.not));
        }
        continue;
      }
      for (const [cmp, sym] of [
        ["gte", ">="],
        ["lte", "<="],
        ["gt", ">"],
        ["lt", "<"],
      ] as const) {
        if (cmp in op) {
          clauses.push(`"${key}" ${sym} ?`);
          args.push(toDb(spec, key, op[cmp]));
        }
      }
      continue;
    }
    if (raw === null) {
      clauses.push(`"${key}" IS NULL`);
    } else {
      clauses.push(`"${key}" = ?`);
      args.push(toDb(spec, key, raw));
    }
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", args };
}

function buildOrderBy(orderBy: unknown): string {
  if (!orderBy) return "";
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts = list.flatMap((o) => Object.entries(o as Row).map(([k, dir]) => `"${k}" ${dir === "desc" ? "DESC" : "ASC"}`));
  return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
}

function applyInclude(db: Db, model: string, row: Row | null, include: Row | undefined): Row | null {
  if (!row || !include) return row;
  if (model === "entry") {
    if (include.entryType) {
      const et = coerce(SPECS.entryType, db.get<Row>(`SELECT * FROM "EntryType" WHERE "id" = ?`, [row.entryTypeId]));
      row.entryType = et;
    }
    if (include.weekdays) {
      row.weekdays = db.all<Row>(`SELECT * FROM "EntryWeekday" WHERE "entryId" = ?`, [row.id]);
    }
  }
  return row;
}

function makeModel(db: Db, model: string) {
  const spec = SPECS[model];
  if (!spec) throw new Error(`prisma-shim: unknown model ${model}`);
  const t = `"${spec.table}"`;

  function project(row: Row | null, select: Row | undefined): Row | null {
    if (!row || !select) return row;
    const out: Row = {};
    for (const [k, v] of Object.entries(select)) if (v) out[k] = row[k];
    return out;
  }
  function findMany(args?: {
    where?: Row;
    orderBy?: unknown;
    take?: number;
    skip?: number;
    include?: Row;
    select?: Row;
  }): Row[] {
    const { sql, args: wargs } = buildWhere(spec, args?.where);
    const order = buildOrderBy(args?.orderBy);
    const limit = args?.take !== undefined ? ` LIMIT ${Number(args.take)}` : "";
    const offset = args?.skip !== undefined ? ` OFFSET ${Number(args.skip)}` : "";
    const rows = db.all<Row>(`SELECT * FROM ${t} ${sql} ${order}${limit}${offset}`, wargs);
    return rows.map((r) => {
      const withInc = applyInclude(db, model, coerce(spec, r), args?.include) as Row;
      return project(withInc, args?.select) as Row;
    });
  }
  function findFirst(args?: { where?: Row; orderBy?: unknown; include?: Row }): Row | null {
    return findMany({ ...args, take: 1 })[0] ?? null;
  }
  function findUnique(args: { where: Row; include?: Row }): Row | null {
    return findFirst(args);
  }

  return {
    findMany: async (args?: Parameters<typeof findMany>[0]) => findMany(args),
    findFirst: async (args?: Parameters<typeof findFirst>[0]) => findFirst(args),
    findUnique: async (args: Parameters<typeof findUnique>[0]) => findUnique(args),
    findUniqueOrThrow: async (args: Parameters<typeof findUnique>[0]) => {
      const r = findUnique(args);
      if (!r) throw new Error(`${spec.table} not found`);
      return r;
    },
    findFirstOrThrow: async (args?: Parameters<typeof findFirst>[0]) => {
      const r = findFirst(args);
      if (!r) throw new Error(`${spec.table} not found`);
      return r;
    },
    count: async (args?: { where?: Row }) => {
      const { sql, args: wargs } = buildWhere(spec, args?.where);
      return db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t} ${sql}`, wargs)?.c ?? 0;
    },
    createMany: async (args: { data: Row[] }) => {
      let count = 0;
      for (const item of args.data) {
        const data = { ...item };
        if (!("id" in data)) data.id = newId();
        const nowIso = new Date().toISOString();
        if (spec.date.includes("createdAt") && !("createdAt" in data)) data.createdAt = nowIso;
        if (spec.date.includes("updatedAt") && !("updatedAt" in data)) data.updatedAt = nowIso;
        const cols = Object.keys(data).map((k) => `"${k}"`).join(", ");
        const placeholders = Object.keys(data).map(() => "?").join(", ");
        const vals = Object.entries(data).map(([k, v]) => toDb(spec, k, v));
        db.run(`INSERT INTO ${t} (${cols}) VALUES (${placeholders})`, vals);
        count++;
      }
      return { count };
    },
    create: async (args: { data: Row; include?: Row }) => {
      const data = { ...args.data };
      if (!("id" in data)) data.id = newId();
      const nowIso = new Date().toISOString();
      if (spec.date.includes("createdAt") && !("createdAt" in data)) data.createdAt = nowIso;
      if (spec.date.includes("updatedAt") && !("updatedAt" in data)) data.updatedAt = nowIso;
      // Nested relation writes (e.g. memberships.create) are handled by callers
      // that use the real repositories; the shim only supports scalar columns.
      const scalar = Object.entries(data).filter(([, v]) => !(v && typeof v === "object" && !(v instanceof Date)));
      const cols = scalar.map(([k]) => `"${k}"`).join(", ");
      const placeholders = scalar.map(() => "?").join(", ");
      const vals = scalar.map(([k, v]) => toDb(spec, k, v));
      db.run(`INSERT INTO ${t} (${cols}) VALUES (${placeholders})`, vals);
      return applyInclude(db, model, findUnique({ where: { id: data.id } } as { where: Row }), args.include);
    },
    update: async (args: { where: Row; data: Row; include?: Row }) => {
      const sets = Object.keys(args.data).map((k) => `"${k}" = ?`);
      const vals = Object.entries(args.data).map(([k, v]) => toDb(spec, k, v));
      if (spec.date.includes("updatedAt") && !("updatedAt" in args.data)) {
        sets.push(`"updatedAt" = ?`);
        vals.push(new Date().toISOString());
      }
      const { sql, args: wargs } = buildWhere(spec, args.where);
      db.run(`UPDATE ${t} SET ${sets.join(", ")} ${sql}`, [...vals, ...wargs]);
      return applyInclude(db, model, findFirst({ where: args.where }), args.include);
    },
    updateMany: async (args: { where?: Row; data: Row }) => {
      const sets = Object.keys(args.data).map((k) => `"${k}" = ?`);
      const vals = Object.entries(args.data).map(([k, v]) => toDb(spec, k, v));
      const { sql, args: wargs } = buildWhere(spec, args.where);
      const res = db.run(`UPDATE ${t} SET ${sets.join(", ")} ${sql}`, [...vals, ...wargs]);
      return { count: res.changes };
    },
    delete: async (args: { where: Row }) => {
      const { sql, args: wargs } = buildWhere(spec, args.where);
      db.run(`DELETE FROM ${t} ${sql}`, wargs);
      return {};
    },
    deleteMany: async (args?: { where?: Row }) => {
      const { sql, args: wargs } = buildWhere(spec, args?.where);
      const res = db.run(`DELETE FROM ${t} ${sql}`, wargs);
      return { count: res.changes };
    },
  };
}

export type PrismaShim = Record<string, ReturnType<typeof makeModel>>;

export function makePrismaShim(db: Db): PrismaShim {
  const cache: Record<string, unknown> = {
    $queryRawUnsafe: async <T>(sql: string, ...params: unknown[]): Promise<T> => db.all(sql, params) as T,
    $executeRawUnsafe: async (sql: string, ...params: unknown[]): Promise<number> => db.run(sql, params).changes,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(makePrismaShim(db)),
    $disconnect: async () => {},
  };
  return new Proxy(cache, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = makeModel(db, prop);
      return target[prop];
    },
  }) as unknown as PrismaShim;
}
