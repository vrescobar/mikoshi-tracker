"use client";

import type { CircleDetailResponse, CircleMember } from "@haaabit/contracts/circles";
import Link from "next/link";
import { useState } from "react";

import { shareHabit, unshareHabit } from "../../lib/circles-client";
import { getCirclesCopy } from "../../lib/i18n/circles";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Badge, Notice, PageFrame, PageHeader, Surface } from "../ui";
import { CircleOwnerPanel } from "./circle-owner-panel";
import styles from "./circle-detail-page.module.css";

type HabitItem = {
  id: string;
  name: string;
};

type CircleDetailPageProps = {
  initialDetail: CircleDetailResponse;
  currentUserId: string;
  initialHabits: HabitItem[];
};

function formatDate(isoString: string, locale: string) {
  return new Date(isoString).toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sortMembersForLeaderboard(members: CircleMember[]): CircleMember[] {
  return [...members].sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (a.role !== "owner" && b.role === "owner") return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function CircleDetailPage({ initialDetail, currentUserId, initialHabits }: CircleDetailPageProps) {
  const { locale } = useLocale();
  const copy = getCirclesCopy(locale);
  const { circle } = initialDetail;
  const isOwner = circle.ownerId === currentUserId;

  const [members, setMembers] = useState<CircleMember[]>(initialDetail.members);
  const rankedMembers = sortMembersForLeaderboard(members);

  const [sharedHabitIds, setSharedHabitIds] = useState<Set<string>>(
    () => new Set(initialDetail.mySharedHabits.map((h) => h.habitId)),
  );
  const [pendingHabitIds, setPendingHabitIds] = useState<Set<string>>(new Set());
  const [shareError, setShareError] = useState<string | null>(null);

  async function handleToggle(habitId: string) {
    if (pendingHabitIds.has(habitId)) return;
    const isShared = sharedHabitIds.has(habitId);

    setShareError(null);
    setPendingHabitIds((prev) => new Set([...prev, habitId]));
    setSharedHabitIds((prev) => {
      const next = new Set(prev);
      if (isShared) next.delete(habitId);
      else next.add(habitId);
      return next;
    });

    try {
      if (isShared) {
        await unshareHabit(circle.id, habitId);
      } else {
        await shareHabit(circle.id, { habitId });
      }
    } catch (err) {
      setSharedHabitIds((prev) => {
        const next = new Set(prev);
        if (isShared) next.add(habitId);
        else next.delete(habitId);
        return next;
      });
      setShareError(err instanceof Error ? err.message : copy.detail.habitShares.errorTitle);
    } finally {
      setPendingHabitIds((prev) => {
        const next = new Set(prev);
        next.delete(habitId);
        return next;
      });
    }
  }

  return (
    <div className={styles.stack} data-testid="circle-detail-page">
      <Surface variant="hero">
        <PageFrame>
          <div className={styles.backNav}>
            <Link href={routes.circles} className={styles.backLink}>
              {copy.detail.backToCircles}
            </Link>
          </div>

          <PageHeader eyebrow={copy.detail.header.eyebrow} title={circle.name} />

          <div className={styles.heroToolbar}>
            <Badge tone={isOwner ? "info" : "neutral"}>
              {isOwner ? copy.detail.members.ownerRole : copy.detail.members.memberRole}
            </Badge>
            <span className={styles.memberCount}>
              {copy.detail.summary.membersCount(members.length)}
            </span>
          </div>
        </PageFrame>
      </Surface>

      <div className={styles.contentGrid}>
        <section className={styles.panel} data-testid="circle-members-panel">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{copy.detail.members.title}</h2>
            <p className={styles.panelDesc}>{copy.detail.members.description}</p>
          </div>

          <div className={styles.memberList}>
            {members.length > 0 ? (
              members.map((member) => (
                <MemberCard
                  key={member.membershipId}
                  member={member}
                  isCurrentUser={member.userId === currentUserId}
                  copy={copy}
                  locale={locale}
                />
              ))
            ) : (
              <p className={styles.emptyText}>{copy.detail.members.emptyState}</p>
            )}
          </div>
        </section>

        <section className={styles.panel} data-testid="circle-leaderboard-panel">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{copy.detail.leaderboard.title}</h2>
            <p className={styles.panelDesc}>{copy.detail.leaderboard.description}</p>
          </div>

          <div className={styles.rankingItems}>
            {rankedMembers.length > 0 ? (
              rankedMembers.map((member, index) => (
                <div key={member.membershipId} className={styles.rankingItem}>
                  <div className={styles.rankingTop}>
                    <span className={styles.rankingName}>
                      <strong>
                        {index + 1}.&nbsp;{member.displayName}
                      </strong>
                      {member.userId === currentUserId ? (
                        <span className={styles.youBadge}>{copy.detail.members.youBadge}</span>
                      ) : null}
                    </span>
                    <Badge tone={member.role === "owner" ? "info" : "neutral"}>
                      {member.role === "owner"
                        ? copy.detail.members.ownerRole
                        : copy.detail.members.memberRole}
                    </Badge>
                  </div>
                  <span className={styles.rankingMeta}>{copy.detail.leaderboard.statsNote}</span>
                </div>
              ))
            ) : (
              <p className={styles.emptyText}>{copy.detail.leaderboard.emptyState}</p>
            )}
          </div>
        </section>
      </div>

      <section className={styles.panel} data-testid="circle-habit-shares-panel">
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>{copy.detail.habitShares.title}</h2>
          <p className={styles.panelDesc}>{copy.detail.habitShares.description}</p>
          <p className={styles.panelDesc}>{copy.detail.habitShares.unshareNote}</p>
        </div>

        {shareError ? (
          <Notice tone="danger" title={copy.detail.habitShares.errorTitle}>
            {shareError}
          </Notice>
        ) : null}

        {initialHabits.length > 0 ? (
          <div className={styles.habitList}>
            {initialHabits.map((habit) => {
              const isShared = sharedHabitIds.has(habit.id);
              const isPending = pendingHabitIds.has(habit.id);
              return (
                <div key={habit.id} className={styles.habitRow}>
                  <div className={styles.habitNameStack}>
                    <span className={styles.habitName}>{habit.name}</span>
                    {isShared && !isPending ? (
                      <span className={styles.habitNote}>
                        {copy.detail.habitShares.unshareNote}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={styles.toggleBtn}
                    data-shared={String(isShared)}
                    disabled={isPending}
                    onClick={() => void handleToggle(habit.id)}
                    aria-pressed={isShared}
                  >
                    {isPending
                      ? copy.detail.habitShares.pendingLabel
                      : isShared
                        ? copy.detail.habitShares.sharedLabel
                        : copy.detail.habitShares.shareLabel}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyText}>{copy.detail.habitShares.emptyState}</p>
        )}
      </section>

      {isOwner ? (
        <CircleOwnerPanel
          circleId={circle.id}
          currentUserId={currentUserId}
          members={members}
          onMembersChange={setMembers}
        />
      ) : null}
    </div>
  );
}

function MemberCard({
  member,
  isCurrentUser,
  copy,
  locale,
}: {
  member: CircleMember;
  isCurrentUser: boolean;
  copy: ReturnType<typeof getCirclesCopy>;
  locale: string;
}) {
  return (
    <div className={styles.memberCard}>
      <div className={styles.memberCardHeader}>
        <span className={styles.memberName}>
          {member.displayName}
          {isCurrentUser ? (
            <span className={styles.youBadge}>{copy.detail.members.youBadge}</span>
          ) : null}
        </span>
        <Badge tone={member.role === "owner" ? "info" : "neutral"}>
          {member.role === "owner" ? copy.detail.members.ownerRole : copy.detail.members.memberRole}
        </Badge>
      </div>
      <div className={styles.memberMeta}>
        <span className={styles.metaLabel}>{copy.detail.members.joinedLabel}</span>
        {formatDate(member.joinedAt, locale)}
      </div>
    </div>
  );
}
