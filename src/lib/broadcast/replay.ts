/**
 * Pure helper for cloning a past WhatsApp broadcast into a fresh draft
 * payload. No I/O, no Supabase. Safe to use both client-side (to prefill
 * the compose form) and server-side (when wiring future draft persistence).
 *
 * Hard rule: this helper produces a *draft*, never a queued or sent
 * broadcast. Callers must persist + send through the existing send/queue
 * flow under explicit user action.
 */

import type { BroadcastLogRow } from "@/src/lib/types/broadcast";

export type BroadcastReplayDraft = {
  /** Free-text body that goes into the compose textarea */
  messageText: string;
  /** Tags carried over from the original broadcast (audience hint) */
  tags: string[];
  /** Original scribe code if present — kept so the user can reuse or clear */
  scribeCode: string | null;
  /** Original internal notes — informational copy */
  internalNotes: string | null;
  /**
   * Reference to the original broadcast_logs.id. Stored on the draft so a
   * future persisted draft / queue insertion can keep `replay_of_log_id`
   * traceability (column already exists in 096_broadcast_queue_replay_of_log_id).
   */
  replayOfLogId: string;
  /**
   * Best-effort note when the original carried media. We do **not**
   * attempt to recover the original media URL — `broadcast_logs` does not
   * persist it. Caller surfaces this hint so the user re-uploads if
   * desired.
   */
  mediaNotice: string | null;
};

/** Inputs we actually consume from a broadcast log row. Loose type so
 * callers can pass partial fetched rows without recasting. */
export type ReplaySource = Pick<
  BroadcastLogRow,
  | "id"
  | "tags"
  | "scribe_code"
  | "internal_notes"
  | "message_snippet"
  | "message_text"
> & {
  /** Optional metadata blob — some surfaces stash media hints here. */
  log_details?: unknown;
};

function pickMessage(src: ReplaySource): string {
  const a = (src.message_text ?? "").trim();
  if (a) return a;
  const b = (src.message_snippet ?? "").trim();
  return b;
}

function detectMediaNotice(src: ReplaySource): string | null {
  // log_details is jsonb — best-effort sniff for media markers without
  // claiming we recovered the URL.
  const d = src.log_details;
  if (d && typeof d === "object") {
    const rec = d as Record<string, unknown>;
    if (
      typeof rec.imageUrl === "string" ||
      typeof rec.image_url === "string" ||
      typeof rec.mediaUrl === "string" ||
      rec.hadImage === true
    ) {
      return "השידור המקורי כלל תמונה — נדרשת העלאה מחדש";
    }
  }
  return null;
}

/**
 * Build a draft payload from a past broadcast log. Pure. Returns a draft —
 * never a queued or sent record.
 */
export function buildReplayDraft(src: ReplaySource): BroadcastReplayDraft {
  return {
    messageText: pickMessage(src),
    tags: Array.isArray(src.tags) ? [...src.tags] : [],
    scribeCode: src.scribe_code ?? null,
    internalNotes: src.internal_notes ?? null,
    replayOfLogId: src.id,
    mediaNotice: detectMediaNotice(src),
  };
}

/** Quick predicate for UI: should the replay button even be enabled? */
export function isReplayable(src: ReplaySource): boolean {
  return pickMessage(src).length > 0;
}
