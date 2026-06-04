/**
 * Cross-module domain errors. Kept here (rather than duplicated per module) so a
 * single class is shared — `instanceof` works across the events, checkins, and
 * today modules, and the v1 error mapper can match it by a stable `name`.
 */
export class NothingToUndoError extends Error {
  constructor(message = "No mutation to undo") {
    super(message);
    this.name = "NothingToUndoError";
  }
}
