export type BroadcastQueueDisplayStatus =
  | "scheduled"
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "unknown";

export function isScheduledForFuture(
  status: string | null | undefined,
  scheduledAt: string | null | undefined,
  now = new Date()
): boolean {
  if (status !== "pending" || !scheduledAt) return false;
  const scheduledTime = new Date(scheduledAt).getTime();
  return Number.isFinite(scheduledTime) && scheduledTime > now.getTime();
}

export function broadcastQueueDisplayStatus(
  status: string | null | undefined,
  scheduledAt: string | null | undefined,
  now = new Date()
): BroadcastQueueDisplayStatus {
  if (isScheduledForFuture(status, scheduledAt, now)) return "scheduled";
  if (status === "pending") return "pending";
  if (status === "processing") return "processing";
  if (status === "completed") return "sent";
  if (status === "failed") return "failed";
  return "unknown";
}
