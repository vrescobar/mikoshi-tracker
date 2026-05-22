import { Badge } from "../ui";

type EntryTypeBadgeProps = {
  slug: string;
  displayName?: string;
};

const SLUG_DISPLAY: Record<string, string> = {
  habit_boolean: "Check-in",
  habit_quantity: "Quantity",
  food_meal: "Food",
};

export function EntryTypeBadge({ slug, displayName }: EntryTypeBadgeProps) {
  const label = displayName ?? SLUG_DISPLAY[slug] ?? slug;
  return (
    <Badge tone="neutral" data-entry-type-slug={slug}>
      {label}
    </Badge>
  );
}
