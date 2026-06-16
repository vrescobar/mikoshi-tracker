/**
 * mikoshi-tracker-food — MikoshiTracker API client.
 *
 * Thin HTTP wrapper over the generic Entries/Events REST surface.
 * Handles ensuring the food_meal Entry exists (lazy creation) and
 * validating payloads client-side against the schema from the API.
 */

export interface FoodApiEnv {
  MIKOSHI_TRACKER_PERSONAL_TOKEN: string;
  MIKOSHI_TRACKER_API_URL: string;
}

export interface FoodPayload {
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  sugar_g?: number | null;
  portion_g?: number | null;
  mealSlot?: string | null;
  source: string;
  confidence: number;
  similarToEventId?: string | null;
  sources?: string[] | null;
  notes?: string | null;
}

export interface FoodEventItem {
  id: string;
  occurredAt: string;
  dateKey: string;
  payload: FoodPayload;
  createdAt: string;
}

interface ApiFetchOpts extends RequestInit {
  label?: string;
}

class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch(
  url: string,
  opts: ApiFetchOpts,
  label: string,
): Promise<unknown> {
  let res: Response;
  try {
    const { label: _label, ...fetchOpts } = opts;
    res = await fetch(url, fetchOpts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    throw new ApiError(`${label}: ${msg}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(`${label}: HTTP ${res.status} — ${body.slice(0, 200)}`, res.status);
  }
  if (res.status === 204) return null;
  return (await res.json()) as unknown;
}

interface EntryListResponse {
  items: Array<{ id: string; entryTypeId: string }>;
}

interface EntryTypeResponse {
  id: string;
  slug: string;
  payloadSchema: string;
}

/**
 * Returns the entryTypeId for food_meal, fetching it from the API.
 */
async function fetchFoodMealEntryTypeId(
  apiBase: string,
  headers: Record<string, string>,
): Promise<string> {
  const data = (await apiFetch(
    `${apiBase}/entry-types/food_meal`,
    { headers },
    "fetchFoodMealEntryType",
  )) as EntryTypeResponse;
  return data.id;
}

/**
 * Returns the user's food_meal Entry id. Creates one if it does not exist yet.
 * The Entry acts as the "diary" container; individual meals are EntryEvents.
 */
export async function ensureFoodEntry(env: FoodApiEnv): Promise<string> {
  const { MIKOSHI_TRACKER_PERSONAL_TOKEN: token, MIKOSHI_TRACKER_API_URL: apiBase } = env;
  const headers = authHeaders(token);

  // Look for an existing active food_meal entry
  const list = (await apiFetch(
    `${apiBase}/entries?entryTypeSlug=food_meal&isActive=true`,
    { headers },
    "listFoodEntries",
  )) as EntryListResponse;

  const existing = list.items[0];
  if (existing) return existing.id;

  // None yet — create one
  const today = new Date().toISOString().slice(0, 10);
  const created = (await apiFetch(
    `${apiBase}/entries`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        entryTypeSlug: "food_meal",
        name: "Food Diary",
        startDate: today,
        config: {},
      }),
    },
    "createFoodEntry",
  )) as { id: string };
  return created.id;
}

/**
 * Fetches the food_meal payload JSON Schema string from the API.
 * Used for client-side validation before posting.
 */
export async function fetchFoodPayloadSchema(env: FoodApiEnv): Promise<string> {
  const { MIKOSHI_TRACKER_PERSONAL_TOKEN: token, MIKOSHI_TRACKER_API_URL: apiBase } = env;
  const data = (await apiFetch(
    `${apiBase}/entry-types/food_meal`,
    { headers: authHeaders(token) },
    "fetchFoodPayloadSchema",
  )) as EntryTypeResponse;
  return data.payloadSchema;
}

/**
 * Validates required food_meal payload fields. Throws a descriptive error if
 * any required field is missing or out of range.
 */
export function validateFoodPayload(payload: FoodPayload): void {
  const errors: string[] = [];
  if (!payload.name || typeof payload.name !== "string") errors.push("name is required");
  if (typeof payload.kcal !== "number" || payload.kcal < 0) errors.push("kcal must be ≥ 0");
  if (typeof payload.protein_g !== "number" || payload.protein_g < 0)
    errors.push("protein_g must be ≥ 0");
  if (typeof payload.carbs_g !== "number" || payload.carbs_g < 0)
    errors.push("carbs_g must be ≥ 0");
  if (typeof payload.fat_g !== "number" || payload.fat_g < 0)
    errors.push("fat_g must be ≥ 0");
  if (!payload.source) errors.push("source is required");
  if (typeof payload.confidence !== "number" || payload.confidence < 0 || payload.confidence > 1)
    errors.push("confidence must be in [0,1]");
  if (errors.length > 0) throw new ApiError(`Invalid food payload: ${errors.join("; ")}`);
}

interface CreateEventBody {
  occurredAt?: string;
  payload: FoodPayload;
  source: string;
  note?: string;
}

/**
 * Posts a new food event to /api/entries/:entryId/events.
 * Returns the created event (with its id).
 */
export async function postFoodEvent(
  env: FoodApiEnv,
  entryId: string,
  payload: FoodPayload,
  note: string,
  occurredAt?: string,
): Promise<FoodEventItem> {
  const { MIKOSHI_TRACKER_PERSONAL_TOKEN: token, MIKOSHI_TRACKER_API_URL: apiBase } = env;
  validateFoodPayload(payload);

  // The events endpoint requires occurredAt; default to "now" so the skill can
  // honour "assume the current time" without the model having to pass one.
  const body: CreateEventBody = { payload, source: "AI", note, occurredAt: occurredAt ?? new Date().toISOString() };

  const data = (await apiFetch(
    `${apiBase}/entries/${encodeURIComponent(entryId)}/events`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    "postFoodEvent",
  )) as { item?: FoodEventItem } & Partial<FoodEventItem>;
  // The REST endpoint wraps the event as { item }. Unwrap it (tolerating an
  // un-wrapped shape) so callers get a real event id — required to attach a photo.
  return (data.item ?? (data as FoodEventItem)) as FoodEventItem;
}

interface EventListResponse {
  items: FoodEventItem[];
}

/**
 * Queries food events over a date range.
 */
export async function queryFoodEvents(
  env: FoodApiEnv,
  from: string,
  to: string,
  limit = 50,
): Promise<FoodEventItem[]> {
  const { MIKOSHI_TRACKER_PERSONAL_TOKEN: token, MIKOSHI_TRACKER_API_URL: apiBase } = env;
  const qs = new URLSearchParams({
    entryTypeSlug: "food_meal",
    from,
    to,
    limit: String(limit),
  });
  const data = (await apiFetch(
    `${apiBase}/events?${qs.toString()}`,
    { headers: authHeaders(token) },
    "queryFoodEvents",
  )) as EventListResponse;
  return data.items;
}

/**
 * Patches an existing food event's payload.
 */
export async function patchFoodEvent(
  env: FoodApiEnv,
  eventId: string,
  patch: Partial<FoodPayload>,
): Promise<FoodEventItem> {
  const { MIKOSHI_TRACKER_PERSONAL_TOKEN: token, MIKOSHI_TRACKER_API_URL: apiBase } = env;
  const data = (await apiFetch(
    `${apiBase}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ payload: patch }),
    },
    "patchFoodEvent",
  )) as { item?: FoodEventItem } & Partial<FoodEventItem>;
  return (data.item ?? (data as FoodEventItem)) as FoodEventItem;
}

interface AttachmentUploadResponse {
  attachment: { id: string; url: string; mimeType: string; size: number };
}

/**
 * Uploads a meal photo and pins it to a food event, so the picture the user
 * sent over WhatsApp shows up next to the meal in the tracker. Best-effort by
 * design: the caller treats a failure here as non-fatal (the meal is already
 * logged). `data` is raw base64 (a data-URL prefix is tolerated server-side).
 */
export async function uploadFoodPhoto(
  env: FoodApiEnv,
  eventId: string,
  data: string,
  originalName?: string | null,
): Promise<AttachmentUploadResponse["attachment"]> {
  const { MIKOSHI_TRACKER_PERSONAL_TOKEN: token, MIKOSHI_TRACKER_API_URL: apiBase } = env;
  const res = (await apiFetch(
    `${apiBase}/attachments/event`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ eventId, data, originalName: originalName ?? "meal.jpg" }),
    },
    "uploadFoodPhoto",
  )) as AttachmentUploadResponse;
  return res.attachment;
}

/**
 * Soft-deletes a food event (creates a DELETE mutation; row stays for audit).
 */
export async function deleteFoodEvent(env: FoodApiEnv, eventId: string): Promise<void> {
  const { MIKOSHI_TRACKER_PERSONAL_TOKEN: token, MIKOSHI_TRACKER_API_URL: apiBase } = env;
  await apiFetch(
    `${apiBase}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: authHeaders(token) },
    "deleteFoodEvent",
  );
}

export { ApiError, fetchFoodMealEntryTypeId };
