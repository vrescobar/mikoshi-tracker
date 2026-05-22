import { redirect } from "next/navigation";

import { routes } from "../../../lib/navigation";

export default function HabitsManagementPage() {
  redirect(routes.habitEntries);
}
