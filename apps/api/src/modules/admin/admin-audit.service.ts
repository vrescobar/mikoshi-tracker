import type { AdminOperator } from "../../auth/admin-key";
import type { Db } from "../../db/client";
import { newId, nowDb } from "../../db/rows";

type Deps = { sqlite: Db };

/**
 * Append a row to the god-mode audit trail. Best-effort by design at the call
 * site (an audit write must never fail the action it records), but kept simple
 * here — callers decide whether to await or fire-and-forget.
 */
export async function recordAdminAction(
  deps: Deps,
  params: {
    operator: AdminOperator;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: unknown;
  },
): Promise<void> {
  deps.sqlite.run(
    `INSERT INTO "AdminAuditLog"
       ("id", "actorType", "actorId", "actorLabel", "action", "targetType", "targetId", "metadata", "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      params.operator.type,
      params.operator.id,
      params.operator.label,
      params.action,
      params.targetType ?? null,
      params.targetId ?? null,
      params.metadata !== undefined ? JSON.stringify(params.metadata) : null,
      nowDb(),
    ],
  );
}

export async function listAdminAuditLog(
  deps: Deps,
  params: { limit?: number; offset?: number; action?: string },
): Promise<{
  items: {
    id: string;
    actorType: string;
    actorId: string | null;
    actorLabel: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: unknown;
    createdAt: string;
  }[];
  total: number;
}> {
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;

  const rows = params.action
    ? deps.sqlite.all<AuditRow>(
        `SELECT * FROM "AdminAuditLog" WHERE "action" = ? ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
        [params.action, limit, offset],
      )
    : deps.sqlite.all<AuditRow>(`SELECT * FROM "AdminAuditLog" ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`, [
        limit,
        offset,
      ]);

  const total = params.action
    ? (deps.sqlite.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "AdminAuditLog" WHERE "action" = ?`, [params.action])
        ?.c ?? 0)
    : (deps.sqlite.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "AdminAuditLog"`)?.c ?? 0);

  return {
    items: rows.map((r) => ({
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      actorLabel: r.actorLabel,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata != null ? (JSON.parse(r.metadata) as unknown) : null,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
    total,
  };
}

type AuditRow = {
  id: string;
  actorType: string;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: string | null;
  createdAt: string;
};
