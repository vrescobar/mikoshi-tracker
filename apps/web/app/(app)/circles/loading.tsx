import { PageFrame, SkeletonBlock, Surface } from "../../../components/ui";
import styles from "../../../components/circles/circles-page.module.css";

export default function CirclesLoading() {
  return (
    <div className={styles.stack} aria-hidden="true">
      <Surface variant="hero">
        <PageFrame>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <SkeletonBlock height="0.8rem" width="5rem" />
            <SkeletonBlock height="2.4rem" width="8rem" />
            <SkeletonBlock height="1rem" width="22rem" />
          </div>
          <div className={styles.toolbar} style={{ marginTop: "1.25rem" }}>
            <Surface variant="soft" padding="md">
              <div className={styles.toolbarTop}>
                <div className={styles.toolbarIntro}>
                  <SkeletonBlock height="0.75rem" width="5rem" />
                  <SkeletonBlock height="1.5rem" width="9rem" />
                </div>
                <SkeletonBlock height="2.9rem" width="8rem" />
              </div>
            </Surface>
          </div>
        </PageFrame>
      </Surface>

      <div className={styles.list}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.badgeRow}>
                <SkeletonBlock height="1.45rem" width="12rem" />
                <SkeletonBlock height="1.2rem" width="4rem" />
              </div>
            </div>
            <SkeletonBlock height="1rem" width="8rem" />
            <SkeletonBlock height="2.9rem" width="7.5rem" />
          </div>
        ))}
      </div>
    </div>
  );
}
