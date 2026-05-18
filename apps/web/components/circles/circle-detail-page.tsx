"use client";

import type { CircleDetailResponse, CircleMember } from "@haaabit/contracts/circles";
import Link from "next/link";

import { getCirclesCopy } from "../../lib/i18n/circles";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import { Badge, PageFrame, PageHeader, Surface } from "../ui";
import styles from "./circle-detail-page.module.css";

type CircleDetailPageProps = {
  initialDetail: CircleDetailResponse;
  currentUserId: string;
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

export function CircleDetailPage({ initialDetail, currentUserId }: CircleDetailPageProps) {
  const { locale } = useLocale();
  const copy = getCirclesCopy(locale);
  const { circle, members } = initialDetail;
  const isOwner = circle.ownerId === currentUserId;
  const rankedMembers = sortMembersForLeaderboard(members);

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
