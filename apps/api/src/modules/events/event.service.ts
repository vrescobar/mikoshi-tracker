import type {
  EntryEventDetail,
  EntryEventRecord,
  EventDeleteResponse,
  EventListResponse,
  EventMutationRecord,
} from "@mikoshi-tracker/contracts/events";

import type { PrismaClient } from "../../generated/prisma/client";
import { normalizeUserTimeZone } from "../../shared/timezone";
import { resolveHabitDay } from "../today/today-clock";
import { getCompiledSchema } from "../entry-types/schema-cache";

import {
  type EntryWithTypeAndUser,
  type EventMutationWithAttachments,
  type EventWithMutations,
  createEventRecord,
  createMutationRecord,
  findEntryWithType,
  findEventForDate,
  findOwnedEvent,
  listOwnedEvents,
  updateEventRecord,
  wireAttachmentsToMutation,
} from "./event.repository";
import { parseEventListFilters, parseUpdateEventInput } from "./event.schema";

// ─── Error classes ─────────────────────────────────────────────────────────────

export class EventNotFoundError extends Error {
  constructor() {
    super("Event not found");
    this.name = "EventNotFoundError";
  }
}

export class EventAlreadyDeletedError extends Error {
  constructor() {
    super("Event has been deleted");
    this.name = "EventAlreadyDeletedError";
  }
}

export class EntryForEventNotFoundError extends Error {
  constructor() {
    super("Entry not found");
    this.name = "EntryForEventNotFoundError";
  }
}

export class EntryForEventInactiveError extends Error {
  constructor() {
    super("Archived entries cannot receive new events");
    this.name = "EntryForEventInactiveError";
  }
}

export class NothingToUndoError extends Error {
  constructor() {
    super("No mutation to undo");
    this.name = "NothingToUndoError";
  }
}

// ─── Internal types ────────────────────────────────────────────────────────────

type EventServiceDeps = { db: PrismaClient };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function latestMutation(
  mutations: EventMutationWithAttachments[],
): EventMutationWithAttachments | null {
  if (mutations.length === 0) return null;
  return [...mutations].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  )[0];
}

function isEventDeleted(event: EventWithMutations): boolean {
  const latest = latestMutation(event.mutations);
  return latest?.type === "DELETE";
}

function extractProjections(payload: unknown): { value: number | null; completed: boolean | null } {
  if (typeof payload !== "object" || payload === null) {
    return { value: null, completed: null };
  }
  const p = payload as Record<string, unknown>;
  return {
    value: typeof p.value === "number" ? p.value : null,
    completed: typeof p.completed === "boolean" ? p.completed : null,
  };
}

function resolveDateKey(timezone: string | null | undefined, occurredAt: Date): string {
  const tz = normalizeUserTimeZone(timezone);
  return resolveHabitDay({ timestamp: occurredAt, timeZone: tz }).todayKey;
}

function serializeAttachment(a: EventMutationWithAttachments["attachments"][number]) {
  return {
    id: a.id,
    mutationId: a.eventMutationId ?? a.mutationId ?? "",
    kind: a.kind as "image",
    mimeType: a.mimeType,
    size: a.size,
    width: a.width ?? null,
    height: a.height ?? null,
    originalName: a.originalName ?? null,
    createdAt: a.createdAt.toISOString(),
    url: `/api/attachments/${a.id}/file`,
  };
}

function serializeMutation(m: EventMutationWithAttachments): EventMutationRecord {
  return {
    id: m.id,
    entryId: m.entryId,
    eventId: m.eventId ?? null,
    userId: m.userId,
    dateKey: m.dateKey,
    type: m.type as EventMutationRecord["type"],
    source: m.source as EventMutationRecord["source"],
    note: m.note ?? null,
    previousPayload: m.previousPayload ? (JSON.parse(m.previousPayload) as unknown) : null,
    nextPayload: m.nextPayload ? (JSON.parse(m.nextPayload) as unknown) : null,
    createdAt: m.createdAt.toISOString(),
    attachments: m.attachments.map(serializeAttachment),
  };
}

function serializeEventRecord(event: EventWithMutations): EntryEventRecord {
  return {
    id: event.id,
    entryId: event.entryId,
    userId: event.userId,
    occurredAt: event.occurredAt.toISOString(),
    dateKey: event.dateKey,
    payload: JSON.parse(event.payload) as unknown,
    value: event.value !== null && event.value !== undefined ? Number(event.value) : null,
    completed: event.completed ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function serializeEventDetail(event: EventWithMutations): EntryEventDetail {
  const mutations = [...event.mutations]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map(serializeMutation);

  const attachments = mutations.flatMap((m) => m.attachments);

  return {
    ...serializeEventRecord(event),
    mutations,
    attachments,
  };
}

// ─── Guards ────────────────────────────────────────────────────────────────────

async function requireEntry(
  deps: EventServiceDeps,
  params: { entryId: string; userId: string },
): Promise<EntryWithTypeAndUser> {
  const entry = await findEntryWithType(deps.db, params);
  if (!entry) throw new EntryForEventNotFoundError();
  if (!entry.isActive) throw new EntryForEventInactiveError();
  return entry;
}

async function requireOwnedEvent(
  deps: EventServiceDeps,
  params: { eventId: string; userId: string },
): Promise<EventWithMutations> {
  const event = await findOwnedEvent(deps.db, params);
  if (!event) throw new EventNotFoundError();
  return event;
}

async function validatePayload(
  deps: EventServiceDeps,
  entryTypeId: string,
  payload: unknown,
): Promise<unknown> {
  const compiled = await getCompiledSchema(deps.db, entryTypeId);
  return compiled.payload.parse(payload);
}

async function reloadEvent(
  deps: EventServiceDeps,
  eventId: string,
  userId: string,
): Promise<EntryEventDetail> {
  const fresh = await findOwnedEvent(deps.db, { eventId, userId });
  if (!fresh) throw new EventNotFoundError();
  return serializeEventDetail(fresh);
}

// ─── Public service functions ──────────────────────────────────────────────────

/**
 * Single write path for all event creation. Validates payload against
 * EntryType.payloadSchema; upserts on (entryId, dateKey) for recurring entries.
 */
export async function persistEvent(
  deps: EventServiceDeps,
  params: {
    entryId: string;
    userId: string;
    occurredAt: Date;
    payload: unknown;
    source: string;
    note: string | null | undefined;
    attachmentIds: string[];
  },
): Promise<EntryEventDetail> {
  const entry = await requireEntry(deps, { entryId: params.entryId, userId: params.userId });
  const validatedPayload = await validatePayload(deps, entry.entryTypeId, params.payload);
  const payloadStr = JSON.stringify(validatedPayload);
  const { value, completed } = extractProjections(validatedPayload);
  const dateKey = resolveDateKey(entry.user.timezone, params.occurredAt);

  let event: EventWithMutations;
  let mutationType: string;
  let previousPayload: string | null;

  if (entry.entryType.cadence === "recurring") {
    const existing = await findEventForDate(deps.db, {
      entryId: params.entryId,
      dateKey,
    });

    if (existing) {
      previousPayload = existing.payload;
      event = await updateEventRecord(deps.db, {
        eventId: existing.id,
        payload: payloadStr,
        value,
        completed,
      });
      mutationType = "UPDATE";
    } else {
      previousPayload = null;
      event = await createEventRecord(deps.db, {
        entryId: params.entryId,
        userId: params.userId,
        occurredAt: params.occurredAt,
        dateKey,
        payload: payloadStr,
        value,
        completed,
      });
      mutationType = "CREATE";
    }
  } else {
    previousPayload = null;
    event = await createEventRecord(deps.db, {
      entryId: params.entryId,
      userId: params.userId,
      occurredAt: params.occurredAt,
      dateKey,
      payload: payloadStr,
      value,
      completed,
    });
    mutationType = "CREATE";
  }

  const mutation = await createMutationRecord(deps.db, {
    entryId: params.entryId,
    eventId: event.id,
    userId: params.userId,
    dateKey,
    type: mutationType,
    source: params.source,
    note: params.note ?? null,
    previousPayload,
    nextPayload: payloadStr,
  });

  if (params.attachmentIds.length > 0) {
    await wireAttachmentsToMutation(deps.db, {
      eventMutationId: mutation.id,
      attachmentIds: params.attachmentIds,
      userId: params.userId,
    });
  }

  return reloadEvent(deps, event.id, params.userId);
}

export async function getEvent(
  deps: EventServiceDeps,
  params: { eventId: string; userId: string },
): Promise<EntryEventDetail> {
  const event = await requireOwnedEvent(deps, params);
  return serializeEventDetail(event);
}

export async function listEvents(
  deps: EventServiceDeps,
  params: { userId: string; filters?: unknown },
): Promise<EventListResponse> {
  const filters = parseEventListFilters(params.filters ?? {});
  const limit = filters.limit ?? 50;

  const rows = await listOwnedEvents(deps.db, {
    userId: params.userId,
    entryId: filters.entryId,
    entryTypeSlug: filters.entryTypeSlug,
    from: filters.from,
    to: filters.to,
    limit,
    cursor: filters.cursor,
  });

  const hasMore = rows.length > limit;
  const active = rows.filter((e) => !isEventDeleted(e)).slice(0, limit);
  const lastItem = hasMore && active.length > 0 ? active[active.length - 1] : null;

  return {
    items: active.map(serializeEventRecord),
    cursor: lastItem ? lastItem.id : null,
    hasMore,
  };
}

export async function updateEvent(
  deps: EventServiceDeps,
  params: { eventId: string; userId: string; input: unknown },
): Promise<EntryEventDetail> {
  const patch = parseUpdateEventInput(params.input);
  const event = await requireOwnedEvent(deps, params);
  if (isEventDeleted(event)) throw new EventAlreadyDeletedError();

  const entry = await findEntryWithType(deps.db, {
    entryId: event.entryId,
    userId: params.userId,
  });
  if (!entry) throw new EntryForEventNotFoundError();

  const currentPayloadStr = event.payload;
  let newPayloadStr = currentPayloadStr;
  let newValue: number | null = event.value !== null && event.value !== undefined
    ? Number(event.value)
    : null;
  let newCompleted: boolean | null = event.completed ?? null;

  if (patch.payload !== undefined) {
    const validated = await validatePayload(deps, entry.entryTypeId, patch.payload);
    newPayloadStr = JSON.stringify(validated);
    const projections = extractProjections(validated);
    newValue = projections.value;
    newCompleted = projections.completed;

    await updateEventRecord(deps.db, {
      eventId: event.id,
      payload: newPayloadStr,
      value: newValue,
      completed: newCompleted,
    });
  }

  await createMutationRecord(deps.db, {
    entryId: event.entryId,
    eventId: event.id,
    userId: params.userId,
    dateKey: event.dateKey,
    type: "UPDATE",
    source: "WEB",
    note: patch.note ?? null,
    previousPayload: currentPayloadStr,
    nextPayload: newPayloadStr,
  });

  return reloadEvent(deps, event.id, params.userId);
}

export async function deleteEvent(
  deps: EventServiceDeps,
  params: { eventId: string; userId: string },
): Promise<EventDeleteResponse> {
  const event = await requireOwnedEvent(deps, params);
  if (isEventDeleted(event)) throw new EventAlreadyDeletedError();

  const mutation = await createMutationRecord(deps.db, {
    entryId: event.entryId,
    eventId: event.id,
    userId: params.userId,
    dateKey: event.dateKey,
    type: "DELETE",
    source: "WEB",
    note: null,
    previousPayload: event.payload,
    nextPayload: null,
  });

  return { eventId: event.id, mutationId: mutation.id };
}

export async function undoEvent(
  deps: EventServiceDeps,
  params: { eventId: string; userId: string },
): Promise<EntryEventDetail> {
  const event = await requireOwnedEvent(deps, params);

  const sorted = [...event.mutations].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  );

  const latestNonUndo = sorted.find((m) => m.type !== "UNDO");
  if (!latestNonUndo) throw new NothingToUndoError();

  const currentPayloadStr = event.payload;

  if (latestNonUndo.type === "DELETE") {
    // Undo delete: event payload is already correct; just add UNDO mutation to un-mark it deleted
    await createMutationRecord(deps.db, {
      entryId: event.entryId,
      eventId: event.id,
      userId: params.userId,
      dateKey: event.dateKey,
      type: "UNDO",
      source: "WEB",
      note: null,
      previousPayload: null,
      nextPayload: currentPayloadStr,
    });
  } else if (latestNonUndo.type === "UPDATE" && latestNonUndo.previousPayload) {
    // Undo update: restore to the state before the update
    const restoredPayloadStr = latestNonUndo.previousPayload;
    const restoredPayload = JSON.parse(restoredPayloadStr) as unknown;
    const { value, completed } = extractProjections(restoredPayload);

    await updateEventRecord(deps.db, {
      eventId: event.id,
      payload: restoredPayloadStr,
      value,
      completed,
    });

    await createMutationRecord(deps.db, {
      entryId: event.entryId,
      eventId: event.id,
      userId: params.userId,
      dateKey: event.dateKey,
      type: "UNDO",
      source: "WEB",
      note: null,
      previousPayload: currentPayloadStr,
      nextPayload: restoredPayloadStr,
    });
  } else {
    throw new NothingToUndoError();
  }

  return reloadEvent(deps, event.id, params.userId);
}
