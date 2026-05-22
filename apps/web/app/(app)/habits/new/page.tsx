import { redirect } from "next/navigation";

import { routes } from "../../../../lib/navigation";

export default function NewHabitPage() {
  redirect(routes.habitEntries);
}
