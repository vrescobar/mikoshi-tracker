import type { AttachmentMetadata } from "@mikoshi-tracker/contracts/attachments";
import { useCallback, useEffect, useRef, useState } from "react";

import { attachmentFileUrl, deleteAttachment, listHabitAttachments, uploadHabitAttachments } from "../../lib/auth-client";
import { getHabitsCopy } from "../../lib/i18n/habits";
import { useLocale } from "../locale";
import { Button, Notice } from "../ui";
import styles from "./habit-attachments-gallery.module.css";

type GalleryCopy = ReturnType<typeof getHabitsCopy>["detail"]["attachments"];

function AttachmentTile({
  attachment,
  copy,
  busy,
  onDelete,
}: {
  attachment: AttachmentMetadata;
  copy: GalleryCopy;
  busy: boolean;
  onDelete: (id: string) => void;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <div className={styles.tile} data-testid="habit-attachment-tile">
      {broken ? (
        <div className={styles.unavailable}>{copy.unavailable}</div>
      ) : (
        <a href={attachmentFileUrl(attachment.id)} target="_blank" rel="noreferrer">
          <img
            className={styles.thumb}
            src={attachmentFileUrl(attachment.id)}
            alt={attachment.originalName ?? ""}
            onError={() => setBroken(true)}
          />
        </a>
      )}
      <button
        type="button"
        className={styles.deleteButton}
        aria-label={copy.deleteLabel}
        title={copy.deleteLabel}
        disabled={busy}
        onClick={() => onDelete(attachment.id)}
      >
        ×
      </button>
    </div>
  );
}

export function HabitAttachmentsGallery({ habitId }: { habitId: string }) {
  const { locale } = useLocale();
  const copy = getHabitsCopy(locale).detail.attachments;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachments, setAttachments] = useState<AttachmentMetadata[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listHabitAttachments(habitId);
      setAttachments(result.attachments);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, [habitId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await uploadHabitAttachments(habitId, Array.from(fileList));
        await refresh();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
      } finally {
        setBusy(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [habitId, refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        await deleteAttachment(id);
        await refresh();
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return (
    <div className={styles.gallery} data-testid="habit-attachments-gallery">
      <p className={styles.description}>{copy.description}</p>

      {error ? (
        <Notice tone="warning" title={copy.errorTitle}>
          {error}
        </Notice>
      ) : null}

      {attachments.length === 0 ? (
        <p className={styles.empty}>{copy.empty}</p>
      ) : (
        <div className={styles.grid}>
          {attachments.map((attachment) => (
            <AttachmentTile
              key={attachment.id}
              attachment={attachment}
              copy={copy}
              busy={busy}
              onDelete={(id) => {
                void handleDelete(id);
              }}
            />
          ))}
        </div>
      )}

      <div className={styles.actions}>
        <input
          ref={fileInputRef}
          className={styles.fileInput}
          type="file"
          accept="image/*"
          multiple
          data-testid="habit-attachment-input"
          onChange={(event) => {
            void handleUpload(event.target.files);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? copy.uploading : copy.add}
        </Button>
      </div>
    </div>
  );
}
