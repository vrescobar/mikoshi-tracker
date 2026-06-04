import type { AdminOperator } from "../../auth/admin-key";
import type { PrismaClient } from "../../generated/prisma/client";

type Deps = { db: PrismaClient };

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
  await deps.db.adminAuditLog.create({
    data: {
      actorType: params.operator.type,
      actorId: params.operator.id,
      actorLabel: params.operator.label,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      metadata: params.metadata !== undefined ? JSON.stringify(params.metadata) : null,
    },
  });
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
  const where = params.action ? { action: params.action } : {};
  const [rows, total] = await Promise.all([
    deps.db.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit ?? 100,
      skip: params.offset ?? 0,
    }),
    deps.db.adminAuditLog.count({ where }),
  ]);
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
      createdAt: r.createdAt.toISOString(),
    })),
    total,
  };
}
