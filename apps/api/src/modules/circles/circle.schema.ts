import {
  type AddCircleMemberInput,
  type CircleSetTotalInput,
  type CreateCircleInput,
  type CreateCircleTokenInput,
  type ShareHabitInput,
  type UpdateCircleMemberInput,
  addCircleMemberInputSchema,
  circleSetTotalInputSchema,
  createCircleInputSchema,
  createCircleTokenInputSchema,
  shareHabitInputSchema,
  updateCircleMemberInputSchema,
} from "@haaabit/contracts/circles";

export type {
  AddCircleMemberInput,
  CircleSetTotalInput,
  CreateCircleInput,
  CreateCircleTokenInput,
  ShareHabitInput,
  UpdateCircleMemberInput,
};

export function parseCreateCircleInput(input: unknown): CreateCircleInput {
  return createCircleInputSchema.parse(input);
}

export function parseAddCircleMemberInput(input: unknown): AddCircleMemberInput {
  return addCircleMemberInputSchema.parse(input);
}

export function parseUpdateCircleMemberInput(input: unknown): UpdateCircleMemberInput {
  return updateCircleMemberInputSchema.parse(input);
}

export function parseShareHabitInput(input: unknown): ShareHabitInput {
  return shareHabitInputSchema.parse(input);
}

export function parseCreateCircleTokenInput(input: unknown): CreateCircleTokenInput {
  return createCircleTokenInputSchema.parse(input);
}

export function parseCircleSetTotalInput(input: unknown): CircleSetTotalInput {
  return circleSetTotalInputSchema.parse(input);
}
