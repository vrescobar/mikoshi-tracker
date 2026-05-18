"use client";

import type { CircleMember, CircleTokenMeta } from "@haaabit/contracts/circles";
import { type FormEvent, useEffect, useId, useState } from "react";

import {
  addCircleMember,
  listCircleTokens,
  mintCircleToken,
  removeCircleMember,
  revokeCircleToken,
  updateCircleMember,
} from "../../lib/circles-client";
import { getCirclesCopy } from "../../lib/i18n/circles";
import { useLocale } from "../locale";
import { Badge, Button, Field, Input, Notice, SkeletonBlock } from "../ui";
import styles from "./circle-owner-panel.module.css";

type Props = {
  circleId: string;
  currentUserId: string;
  members: CircleMember[];
  onMembersChange: (members: CircleMember[]) => void;
};

function fallbackCopyText(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Copy unavailable in this browser context.");
}

function formatTokenDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function CircleOwnerPanel({ circleId, currentUserId, members, onMembersChange }: Props) {
  const { locale } = useLocale();
  const copy = getCirclesCopy(locale).detail.ownerPanel;
  const emailId = useId();
  const extIdId = useId();

  // ─── Add member state ─────────────────────────────────────────────────────
  const [addEmail, setAddEmail] = useState("");
  const [addExternalId, setAddExternalId] = useState("");
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // ─── Edit externalId state ────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ─── Remove member state ──────────────────────────────────────────────────
  const [removePendingId, setRemovePendingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // ─── Token state ──────────────────────────────────────────────────────────
  const [tokens, setTokens] = useState<CircleTokenMeta[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [freshTokenId, setFreshTokenId] = useState<string | null>(null);
  const [freshRevealed, setFreshRevealed] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [showMintForm, setShowMintForm] = useState(false);
  const [mintLabel, setMintLabel] = useState("");
  const [mintPending, setMintPending] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [revokePendingId, setRevokePendingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // ─── Load tokens on mount ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    listCircleTokens(circleId)
      .then((t) => {
        if (!cancelled) setTokens(t);
      })
      .catch(() => {
        // non-fatal: tokens list stays empty
      })
      .finally(() => {
        if (!cancelled) setTokensLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [circleId]);

  // ─── Add member ───────────────────────────────────────────────────────────
  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAddPending(true);
    setAddError(null);
    try {
      const membership = await addCircleMember(circleId, {
        email: addEmail.trim(),
        externalId: addExternalId.trim() || undefined,
      });
      onMembersChange([...members, membership]);
      setAddEmail("");
      setAddExternalId("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : copy.errorTitle);
    } finally {
      setAddPending(false);
    }
  }

  // ─── Edit externalId ──────────────────────────────────────────────────────
  function startEdit(member: CircleMember) {
    setEditingId(member.membershipId);
    setEditValue(member.externalId ?? "");
    setEditError(null);
  }

  async function handleSaveEdit(membershipId: string) {
    setEditPending(true);
    setEditError(null);
    try {
      const updated = await updateCircleMember(circleId, membershipId, {
        externalId: editValue.trim() || null,
      });
      onMembersChange(members.map((m) => (m.membershipId === membershipId ? updated : m)));
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : copy.errorTitle);
    } finally {
      setEditPending(false);
    }
  }

  // ─── Remove member ────────────────────────────────────────────────────────
  async function handleRemove(member: CircleMember) {
    if (!window.confirm(copy.removeConfirm(member.displayName))) return;
    setRemovePendingId(member.membershipId);
    setRemoveError(null);
    try {
      await removeCircleMember(circleId, member.membershipId);
      onMembersChange(members.filter((m) => m.membershipId !== member.membershipId));
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : copy.errorTitle);
    } finally {
      setRemovePendingId(null);
    }
  }

  // ─── Mint token ───────────────────────────────────────────────────────────
  async function handleMint(e: FormEvent) {
    e.preventDefault();
    setMintPending(true);
    setMintError(null);
    try {
      const result = await mintCircleToken(circleId, {
        label: mintLabel.trim() || undefined,
      });
      setFreshToken(result.token);
      setFreshTokenId(result.tokenId);
      setFreshRevealed(false);
      setTokens((prev) => [
        ...prev,
        {
          tokenId: result.tokenId,
          label: result.label,
          createdAt: result.createdAt,
          updatedAt: result.createdAt,
        },
      ]);
      setShowMintForm(false);
      setMintLabel("");
    } catch (err) {
      setMintError(err instanceof Error ? err.message : copy.errorTitle);
    } finally {
      setMintPending(false);
    }
  }

  // ─── Copy fresh token ─────────────────────────────────────────────────────
  async function handleCopyToken() {
    if (!freshToken) return;
    try {
      try {
        await navigator.clipboard.writeText(freshToken);
      } catch {
        fallbackCopyText(freshToken);
      }
      setCopyFeedback(copy.copySuccess);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      // ignore: copy failure is not critical
    }
  }

  // ─── Revoke token ─────────────────────────────────────────────────────────
  async function handleRevoke(tokenId: string, label: string | null) {
    const displayName = label ?? tokenId.slice(0, 8);
    if (!window.confirm(copy.revokeConfirm(displayName))) return;
    setRevokePendingId(tokenId);
    setRevokeError(null);
    try {
      await revokeCircleToken(circleId, tokenId);
      setTokens((prev) => prev.filter((t) => t.tokenId !== tokenId));
      if (freshTokenId === tokenId) {
        setFreshToken(null);
        setFreshTokenId(null);
      }
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : copy.errorTitle);
    } finally {
      setRevokePendingId(null);
    }
  }

  const tokenDisplayValue = freshRevealed
    ? (freshToken ?? "")
    : "••••••••••••••••••••••••••••••••••••";

  return (
    <>
      {/* ── Member management ────────────────────────────────────────────── */}
      <section className={styles.section} data-testid="circle-owner-members-panel">
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>{copy.addMemberTitle}</h2>
          <p className={styles.panelDesc}>{copy.addMemberDescription}</p>
        </div>

        <form className={styles.form} onSubmit={(e) => void handleAddMember(e)}>
          <Field label={copy.emailLabel} htmlFor={emailId} required>
            <Input
              id={emailId}
              type="email"
              placeholder={copy.emailPlaceholder}
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              disabled={addPending}
              required
            />
          </Field>

          <Field
            label={copy.externalIdLabel}
            htmlFor={extIdId}
            description={copy.externalIdDescription}
          >
            <Input
              id={extIdId}
              type="text"
              placeholder={copy.externalIdPlaceholder}
              value={addExternalId}
              onChange={(e) => setAddExternalId(e.target.value)}
              disabled={addPending}
            />
          </Field>

          {addError ? (
            <Notice tone="danger" title={copy.errorTitle}>
              {addError}
            </Notice>
          ) : null}

          <div className={styles.actions}>
            <Button type="submit" disabled={addPending || !addEmail.trim()}>
              {addPending ? copy.addMemberPending : copy.addMemberSubmit}
            </Button>
          </div>
        </form>

        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>{copy.manageMembersTitle}</h2>
          <p className={styles.panelDesc}>{copy.manageMembersDescription}</p>
        </div>

        {removeError ? (
          <Notice tone="danger" title={copy.errorTitle}>
            {removeError}
          </Notice>
        ) : null}

        {editError ? (
          <Notice tone="danger" title={copy.errorTitle}>
            {editError}
          </Notice>
        ) : null}

        {members.length > 0 ? (
          <div className={styles.manageList} data-testid="owner-manage-members-list">
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const isEditing = editingId === member.membershipId;
              const isRemoving = removePendingId === member.membershipId;

              return (
                <div key={member.membershipId} className={styles.manageRow}>
                  <div className={styles.manageRowHeader}>
                    <span className={styles.memberName}>{member.displayName}</span>
                    <Badge tone={member.role === "owner" ? "info" : "neutral"}>
                      {member.role}
                    </Badge>
                  </div>

                  <div className={styles.externalIdRow}>
                    <span className={styles.metaLabel}>{copy.editExternalIdLabel}:</span>
                    {isEditing ? (
                      <div className={styles.inlineEditRow}>
                        <Input
                          className={styles.inlineInput}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          disabled={editPending}
                          placeholder={copy.externalIdPlaceholder}
                          aria-label={copy.editExternalIdLabel}
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={editPending}
                          onClick={() => void handleSaveEdit(member.membershipId)}
                        >
                          {copy.saveLabel}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={editPending}
                          onClick={() => setEditingId(null)}
                        >
                          {copy.cancelLabel}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className={styles.metaValue}>
                          {member.externalId ?? copy.externalIdNone}
                        </span>
                        <div className={styles.memberActions}>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => startEdit(member)}
                          >
                            {copy.editExternalIdLabel}
                          </Button>
                          {!isSelf ? (
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              disabled={isRemoving}
                              onClick={() => void handleRemove(member)}
                            >
                              {isRemoving ? "…" : copy.removeLabel}
                            </Button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyText}>{copy.manageMembersDescription}</p>
        )}
      </section>

      {/* ── Circle tokens ─────────────────────────────────────────────────── */}
      <section className={styles.section} data-testid="circle-owner-tokens-panel">
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>{copy.tokensTitle}</h2>
          <p className={styles.panelDesc}>{copy.tokensDescription}</p>
        </div>

        {freshToken ? (
          <div className={styles.freshTokenBlock} data-testid="fresh-token-block">
            <p className={styles.freshTokenTitle}>{copy.freshTokenTitle}</p>
            <p className={styles.freshTokenWarning}>{copy.freshTokenWarning}</p>
            <Input readOnly value={tokenDisplayValue} aria-label="circle token" />
            <div className={styles.freshTokenActions}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setFreshRevealed((v) => !v)}
              >
                {freshRevealed ? copy.hideLabel : copy.revealLabel}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopyToken()}>
                {copy.copyLabel}
              </Button>
              {copyFeedback ? (
                <span className={styles.copyFeedback} role="status">
                  {copyFeedback}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {showMintForm ? (
          <form className={styles.form} onSubmit={(e) => void handleMint(e)} data-testid="mint-token-form">
            <Field label={copy.tokenLabelLabel}>
              <Input
                type="text"
                placeholder={copy.tokenLabelPlaceholder}
                value={mintLabel}
                onChange={(e) => setMintLabel(e.target.value)}
                disabled={mintPending}
              />
            </Field>

            {mintError ? (
              <Notice tone="danger" title={copy.errorTitle}>
                {mintError}
              </Notice>
            ) : null}

            <div className={styles.actions}>
              <Button type="submit" disabled={mintPending}>
                {mintPending ? copy.mintPending : copy.mintSubmit}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={mintPending}
                onClick={() => {
                  setShowMintForm(false);
                  setMintError(null);
                  setMintLabel("");
                }}
              >
                {copy.mintCancel}
              </Button>
            </div>
          </form>
        ) : (
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowMintForm(true)}
              data-testid="mint-token-button"
            >
              {copy.mintNewToken}
            </Button>
          </div>
        )}

        {revokeError ? (
          <Notice tone="danger" title={copy.errorTitle}>
            {revokeError}
          </Notice>
        ) : null}

        {tokensLoading ? (
          <SkeletonBlock height="3rem" />
        ) : tokens.length > 0 ? (
          <div className={styles.tokenList} data-testid="token-list">
            {tokens.map((token) => (
              <div key={token.tokenId} className={styles.tokenRow}>
                <div className={styles.tokenMeta}>
                  <span className={styles.tokenLabel}>{token.label ?? token.tokenId.slice(0, 8)}</span>
                  <span className={styles.tokenDate}>
                    {copy.tokenCreatedLabel} {formatTokenDate(token.createdAt)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={revokePendingId === token.tokenId}
                  onClick={() => void handleRevoke(token.tokenId, token.label)}
                >
                  {revokePendingId === token.tokenId ? "…" : copy.revokeLabel}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>{copy.noTokens}</p>
        )}
      </section>
    </>
  );
}
