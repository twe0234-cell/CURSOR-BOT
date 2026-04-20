/**
 * Torah sheet workflow — pure transition rules (Phase 2 state machine).
 * No I/O. Callers: torah.service.ts, tests.
 */

/** DB values for torah_sheets.status (migration 069) */
export const TORAH_SHEET_STATUSES = [
  "not_started",
  "written",
  "reported_written",
  "received",
  "in_qa",
  "needs_fixing",
  "approved",
  "sewn",
] as const;

export type TorahSheetWorkflowStatus = (typeof TORAH_SHEET_STATUSES)[number];

function edgeKey(from: string, to: string): string {
  return `${from}→${to}`;
}

/**
 * Allowed one-step transitions.
 * Includes legacy paths (written→in_qa) so existing deployments keep working.
 */
const ALLOWED = new Set<string>([
  edgeKey("not_started", "reported_written"),
  /** קליטה מהסופר — legacy */
  edgeKey("not_started", "written"),
  edgeKey("written", "reported_written"),
  edgeKey("written", "received"),
  edgeKey("written", "in_qa"),
  edgeKey("reported_written", "received"),
  edgeKey("received", "in_qa"),
  /** סופר שולח מחדש אחרי תיקון */
  edgeKey("needs_fixing", "reported_written"),
  edgeKey("needs_fixing", "in_qa"),
  edgeKey("in_qa", "approved"),
  edgeKey("in_qa", "needs_fixing"),
  edgeKey("needs_fixing", "approved"),
  edgeKey("approved", "sewn"),
]);

export function isTorahSheetWorkflowStatus(s: string): s is TorahSheetWorkflowStatus {
  return (TORAH_SHEET_STATUSES as readonly string[]).includes(s);
}

export function canTransitionTorahSheet(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) return true;
  return ALLOWED.has(edgeKey(fromStatus, toStatus));
}

export function assertTorahSheetTransition(
  fromStatus: string,
  toStatus: string
): { ok: true } | { ok: false; error: string } {
  if (fromStatus === toStatus) return { ok: true };
  if (canTransitionTorahSheet(fromStatus, toStatus)) return { ok: true };
  return {
    ok: false,
    error: `מעבר לא חוקי: ${fromStatus} → ${toStatus}`,
  };
}

export type QaResolution = "approved" | "needs_fixing";

export function canResolveQaFromInQa(outcome: QaResolution): boolean {
  return outcome === "approved" || outcome === "needs_fixing";
}

/** After fix — back to QA, return to sofer queue, or straight approve */
export function canCompleteFixToSheetStatus(
  target: "in_qa" | "approved" | "reported_written"
): boolean {
  return target === "in_qa" || target === "approved" || target === "reported_written";
}
