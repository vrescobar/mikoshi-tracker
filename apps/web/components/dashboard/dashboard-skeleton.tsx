import { SkeletonBlock, Surface } from "../ui";
import styles from "./dashboard-skeleton.module.css";

/**
 * Loading placeholder mirroring the live dashboard layout: greeting, the
 * progress + streak top grid, a statistics card, and the "today's habits"
 * list. Kept structurally in sync with today-board + habits-today-card so the
 * skeleton→content swap doesn't jump.
 */
export function DashboardSkeleton() {
  return (
    <div className={styles.stack} aria-hidden="true">
      <header className={styles.greeting}>
        <div className={styles.greetingCopy}>
          <SkeletonBlock height="2rem" width="14rem" />
          <SkeletonBlock height="1rem" width="10rem" />
        </div>
        <SkeletonBlock height="2.6rem" width="2.6rem" style={{ borderRadius: "var(--radius-pill)" }} />
      </header>

      <div className={styles.topGrid}>
        <Surface variant="panel" padding="md" className={styles.card}>
          <SkeletonBlock height="0.9rem" width="7rem" />
          <div className={styles.ring}>
            <SkeletonBlock height="8.5rem" width="8.5rem" style={{ borderRadius: "var(--radius-pill)" }} />
          </div>
        </Surface>
        <Surface variant="panel" padding="md" className={styles.card}>
          <SkeletonBlock height="0.9rem" width="6rem" />
          <div className={styles.weekRow}>
            {Array.from({ length: 7 }).map((_, index) => (
              <SkeletonBlock key={index} height="2rem" width="2rem" style={{ borderRadius: "var(--radius-pill)" }} />
            ))}
          </div>
          <SkeletonBlock height="0.8rem" width="8rem" />
        </Surface>
      </div>

      <Surface variant="panel" padding="md" className={styles.card}>
        <SkeletonBlock height="0.9rem" width="7rem" />
        <div className={styles.statsRow}>
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} height="5.5rem" />
          ))}
        </div>
      </Surface>

      <Surface variant="panel" padding="md" className={styles.card}>
        <SkeletonBlock height="1.2rem" width="9rem" />
        <div className={styles.listRow}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} height="3rem" />
          ))}
        </div>
      </Surface>
    </div>
  );
}
