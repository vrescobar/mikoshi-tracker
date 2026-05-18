import { notFound } from "next/navigation";

import { CircleDetailPage } from "../../../../components/circles/circle-detail-page";
import {
  buildCookieHeader,
  getCircleDetailFromCookieHeader,
  getSessionFromCookieHeader,
  listHabitsFromCookieHeader,
} from "../../../../lib/server-auth";

export default async function CircleDetailServerPage({ params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  const cookieHeader = await buildCookieHeader();
  const [detail, session, habits] = await Promise.all([
    getCircleDetailFromCookieHeader(cookieHeader, circleId),
    getSessionFromCookieHeader(cookieHeader),
    listHabitsFromCookieHeader(cookieHeader),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <CircleDetailPage
      initialDetail={detail}
      currentUserId={session?.user.id ?? ""}
      initialHabits={habits.map((h) => ({ id: h.id, name: h.name }))}
    />
  );
}
