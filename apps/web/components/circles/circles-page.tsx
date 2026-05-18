"use client";

import type { CircleRecord } from "@haaabit/contracts/circles";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { createCircle, listCircles } from "../../lib/circles-client";
import { getCirclesCopy } from "../../lib/i18n/circles";
import { routes } from "../../lib/navigation";
import { useLocale } from "../locale";
import {
  Badge,
  Button,
  Field,
  InlineStatus,
  Input,
  Notice,
  OverlayPanel,
  PageFrame,
  PageHeader,
  StatePanel,
  Surface,
} from "../ui";
import styles from "./circles-page.module.css";

type CirclesPageProps = {
  initialItems: CircleRecord[];
  currentUserId: string;
};

type Feedback = {
  tone: "neutral" | "success" | "danger";
  title: string;
  message: string;
};

function formatDate(isoString: string, locale: string) {
  return new Date(isoString).toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CirclesPage({ initialItems, currentUserId }: CirclesPageProps) {
  const { locale } = useLocale();
  const copy = getCirclesCopy(locale);
  const [items, setItems] = useState(initialItems);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const overlayTriggerRef = useRef<HTMLElement | null>(null);

  function openOverlay(trigger: HTMLElement) {
    overlayTriggerRef.current = trigger;
    setNameValue("");
    setFormError(null);
    setIsOverlayOpen(true);
  }

  function closeOverlay() {
    setIsOverlayOpen(false);
    const trigger = overlayTriggerRef.current;
    if (trigger) {
      requestAnimationFrame(() => {
        trigger.focus();
      });
    }
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setFormError(copy.page.overlay.nameRequired);
      return;
    }

    setFormError(null);

    startTransition(async () => {
      setFeedback({
        tone: "neutral",
        title: copy.page.feedback.createPendingTitle,
        message: copy.page.feedback.createPendingMessage,
      });

      try {
        await createCircle({ name: trimmed });
        const nextItems = await listCircles();
        setItems(nextItems);
        setIsOverlayOpen(false);
        overlayTriggerRef.current = null;
        setNameValue("");
        setFeedback({
          tone: "success",
          title: copy.page.feedback.createSuccessTitle,
          message: copy.page.feedback.createSuccessMessage,
        });
      } catch (err) {
        setFeedback(null);
        setFormError(err instanceof Error ? err.message : copy.page.overlay.errorTitle);
      }
    });
  }

  return (
    <div className={styles.stack} data-testid="circles-page">
      <Surface variant="hero">
        <PageFrame>
          <PageHeader
            eyebrow={copy.page.header.eyebrow}
            title={copy.page.header.title}
            description={copy.page.header.description}
          />

          <div className={styles.toolbar}>
            <Surface variant="soft" padding="md" className={styles.toolbarPanel}>
              <div className={styles.toolbarTop}>
                <div className={styles.toolbarIntro}>
                  <span className={styles.toolbarLabel}>{copy.page.toolbar.label}</span>
                  <strong className={styles.toolbarValue}>{copy.page.toolbar.summary(items.length)}</strong>
                </div>

                <div className={styles.toolbarActions}>
                  <Button
                    type="button"
                    size="lg"
                    onClick={(event) => {
                      openOverlay(event.currentTarget);
                    }}
                  >
                    {copy.page.toolbar.newCircle}
                  </Button>
                </div>
              </div>
            </Surface>
          </div>

          {feedback ? (
            <InlineStatus tone={feedback.tone} title={feedback.title} testId="circles-feedback">
              {feedback.message}
            </InlineStatus>
          ) : null}
        </PageFrame>
      </Surface>

      <div className={styles.list}>
        {items.length > 0 ? (
          items.map((circle) => {
            const isOwner = circle.ownerId === currentUserId;
            return (
              <article key={circle.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    <div className={styles.badgeRow}>
                      <h2 className={styles.heading}>{circle.name}</h2>
                      <Badge tone={isOwner ? "info" : "neutral"}>
                        {isOwner ? copy.page.card.ownerRole : copy.page.card.memberRole}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className={styles.metaGrid}>
                  <div>
                    <strong className={styles.metaLabel}>{copy.page.card.createdLabel}</strong>
                    {formatDate(circle.createdAt, locale)}
                  </div>
                </div>

                <div className={styles.actions}>
                  <Link href={routes.circleDetail(circle.id)} className={styles.primaryAction}>
                    {copy.page.card.viewDetails}
                  </Link>
                </div>
              </article>
            );
          })
        ) : (
          <StatePanel title={copy.page.emptyState.title} description={copy.page.emptyState.description} />
        )}
      </div>

      {isOverlayOpen ? (
        <OverlayPanel
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closeOverlay();
            }
          }}
          variant="dialog"
          title={copy.page.overlay.createTitle}
          description={copy.page.overlay.createDescription}
          closeLabel={copy.page.overlay.closeLabel}
          testId="circle-create-overlay"
        >
          <form onSubmit={handleCreate} className={styles.formBody} noValidate>
            {formError ? (
              <Notice tone="danger" title={copy.page.overlay.errorTitle}>
                {formError}
              </Notice>
            ) : null}

            <Field label={copy.page.overlay.nameLabel} htmlFor="circle-name">
              <Input
                id="circle-name"
                type="text"
                value={nameValue}
                onChange={(event) => setNameValue(event.target.value)}
                placeholder={copy.page.overlay.namePlaceholder}
                autoFocus
                disabled={isPending}
              />
            </Field>

            <div className={styles.formActions}>
              <Button type="button" variant="secondary" onClick={closeOverlay} disabled={isPending}>
                {copy.page.overlay.cancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? copy.page.overlay.pendingSubmit : copy.page.overlay.createSubmit}
              </Button>
            </div>
          </form>
        </OverlayPanel>
      ) : null}
    </div>
  );
}
