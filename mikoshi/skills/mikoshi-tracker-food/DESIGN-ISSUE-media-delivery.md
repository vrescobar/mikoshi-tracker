# Open design issue — Mikoshi never delivers the photo to the food skill

**Status:** open · architectural · needs a Mikoshi-side rework
**Found:** 2026-06-16 (debugging "I send a meal photo on WhatsApp but it never shows")
**Scope:** `mikoshi-tracker-food` skill ⇄ Mikoshi kernel media contract

## Symptom

A user sends a meal photo over WhatsApp. The meal text is logged, but **no photo
is ever attached** (the tracker shows 0 attachments), and the label-OCR (Tier 1)
and vision-estimate (Tier 4) tiers never actually run on the image.

## Root cause — two incompatible media contracts

The food tool `food_log_from_input` declares its image input as a **base64
string**:

```yaml
image_base64:
  type: string
  description: "Imagen en base64 (para OCR ... o análisis visual)"
```

But Mikoshi does **not** hand images to skills as base64. Per
`mikoshi/src/tools/SkillToolExecutor.ts`, media is delivered as **workspace
files**:

- The model only ever sees an **opaque handle** (`att_1`, `att_2`, …) for an
  inbound attachment — never raw bytes.
- The `attachmentHandleResolver` maps that handle → `inputs[].{name, mediaFileId}`.
- The executor **pre-copies** each `inputs[].mediaFileId` into the skill's
  workspace as `<name>`; the skill is expected to read it from
  `MIKOSHI_WORKSPACE_DIR/<name>`.

Because the model has no way to produce base64 (it holds only the opaque handle),
the `image_base64` field is **always empty** when the kernel invokes the skill.
The image therefore never reaches the skill at all — so OCR, vision, **and** the
new photo-attach step silently no-op. Only the text-only tiers ever worked over
WhatsApp.

> This is not a bug in one function — it is a contract mismatch. The skill was
> written to an interface (`image_base64`) that Mikoshi does not implement for
> skill inputs.

## What is NOT the problem (already fixed on the tracker side)

The tracker/skill→API path is now correct and verified end-to-end (2026-06-16):
when the skill *is* given image bytes it attaches the photo to the meal. Fixes
landed in `lib/api-client.ts` / `lib/tiers.ts`:

- `uploadFoodPhoto()` posts to `POST /api/attachments/event` after the meal is
  created (best-effort); reported as `photo_attached`.
- `postFoodEvent()` now defaults `occurredAt` to "now" (the REST endpoint
  *requires* it) and **unwraps the `{ item }` response** so the event id is real
  — without this the photo upload ran with `eventId: undefined` and failed.

So the web "add food" flow (which *does* have the bytes) and any caller that
passes `image_base64` work today. The remaining gap is purely the kernel→skill
delivery.

## Proper fix (future rework)

Align the food tool with Mikoshi's media contract instead of inventing a parallel
one:

1. **Tool schema:** replace `image_base64` with a media input the agent can fill
   from an attachment handle (the `inputs[].{name, mediaFileId}` /
   `attachment_ref` mechanism the executor already supports). This is a manifest
   change → re-run `ext-install` with the breaking-change gate considered.
2. **Skill side:** in `run.ts`/`lib/tiers.ts`, read the pre-copied file from
   `MIKOSHI_WORKSPACE_DIR/<name>`, base64-encode it once, and feed it to the
   tier pipeline (OCR/vision) **and** `uploadFoodPhoto()`.
3. **Docs:** make the "skills receive media as workspace files, never base64"
   rule explicit in the skill-authoring guide so the next image-handling skill
   doesn't repeat this.

### Related architectural smells surfaced while debugging

- **Response-shape coupling.** The skill hand-rolls an HTTP client and assumed
  the events endpoint returns the event at the top level; it actually returns
  `{ item }`. A shared, typed tracker client (or contract-generated SDK) would
  have made this a compile error, not a silent `undefined`.
- **Required `occurredAt`.** The legacy `POST /api/entries/:id/events` *requires*
  `occurredAt`; "assume now" guidance that omits it 400s. Consider defaulting it
  server-side for event-log types so callers can omit it.
- **Install-copy drift.** Skills run from an **installed copy** in
  `~/projects/mikoshi/skills/` (populated by `ext-install`), not from the tracker
  repo source. Editing the source does nothing until re-synced — it is easy to
  ship a "fixed" skill that the kernel never actually runs.

## Acceptance test for the rework

Send a meal photo over WhatsApp → a `food_meal` event is created **and** an
`Attachment` row is linked to its mutation → the photo renders on the meal card
and the detail page. (The tracker-side half of this is already covered by
`apps/api/test/v1/food-day.test.ts` and the skill's `test/tiers.test.ts`.)
