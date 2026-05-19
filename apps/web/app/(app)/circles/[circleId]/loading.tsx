import { PageFrame, SkeletonBlock, Surface } from "../../../../components/ui";
import detailStyles from "../../../../components/circles/circle-detail-page.module.css";
import pageStyles from "../../../../components/circles/circles-page.module.css";

export default function CircleDetailLoading() {
  return (
    <div className={detailStyles.stack} aria-hidden="true">
      <Surface variant="hero">
        <PageFrame>
          <div style={{ marginBottom: "0.65rem" }}>
            <SkeletonBlock height="0.88rem" width="7rem" />
          </div>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <SkeletonBlock height="0.8rem" width="3.5rem" />
            <SkeletonBlock height="2.4rem" width="14rem" />
          </div>
          <div className={detailStyles.heroToolbar}>
            <SkeletonBlock height="1.4rem" width="4rem" />
            <SkeletonBlock height="1rem" width="5rem" />
          </div>
        </PageFrame>
      </Surface>

      <div className={detailStyles.contentGrid}>
        <section className={detailStyles.panel}>
          <SkeletonBlock height="1.15rem" width="6rem" />
          <SkeletonBlock height="0.88rem" width="12rem" />
          <div className={detailStyles.memberList}>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className={detailStyles.memberCard}>
                <SkeletonBlock height="1rem" width="9rem" />
                <SkeletonBlock height="0.84rem" width="6rem" />
              </div>
            ))}
          </div>
        </section>

        <section className={detailStyles.panel}>
          <SkeletonBlock height="1.15rem" width="7rem" />
          <SkeletonBlock height="0.88rem" width="16rem" />
          <div className={detailStyles.rankingItems}>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className={detailStyles.rankingItem}>
                <div className={detailStyles.rankingTop}>
                  <SkeletonBlock height="1rem" width="8rem" />
                  <SkeletonBlock height="1.2rem" width="4rem" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={detailStyles.panel}>
        <SkeletonBlock height="1.15rem" width="6rem" />
        <SkeletonBlock height="0.88rem" width="20rem" />
        <div className={pageStyles.list} style={{ gap: "0" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={detailStyles.habitRow}>
              <SkeletonBlock height="0.95rem" width="12rem" />
              <SkeletonBlock height="2rem" width="4.8rem" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
