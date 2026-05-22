import type { MikoshiTrackerApiClient } from "../client/api-client.js";

import { createAggregationsReadOperations } from "./aggregations.js";
import { createAttachmentReadOperations, createAttachmentWriteOperations } from "./attachments.js";
import { createEntriesReadOperations, createEntriesWriteOperations } from "./entries.js";
import { createEntryTypesReadOperations } from "./entry-types.js";
import { createEventsReadOperations, createEventsWriteOperations } from "./events.js";
import { createHabitsReadOperations, createHabitsWriteOperations } from "./habits.js";
import type { ToolOperation } from "./operation-types.js";
import { createStatsReadOperations } from "./stats.js";
import { createTodayReadOperations, createTodayWriteOperations } from "./today.js";

export function createToolOperations(options: { client: MikoshiTrackerApiClient }): Record<string, ToolOperation> {
  return {
    ...createHabitsReadOperations(options.client),
    ...createHabitsWriteOperations(options.client),
    ...createTodayReadOperations(options.client),
    ...createTodayWriteOperations(options.client),
    ...createStatsReadOperations(options.client),
    ...createAttachmentReadOperations(options.client),
    ...createAttachmentWriteOperations(options.client),
    ...createEntryTypesReadOperations(options.client),
    ...createEntriesReadOperations(options.client),
    ...createEntriesWriteOperations(options.client),
    ...createEventsReadOperations(options.client),
    ...createEventsWriteOperations(options.client),
    ...createAggregationsReadOperations(options.client),
  };
}
