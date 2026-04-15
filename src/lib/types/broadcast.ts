// broadcast_logs — תואם supabase/migrations/065_broadcast_schedule.sql + 070_broadcast_logs_ensure_message_text.sql

export type BroadcastLogRow = {
  id: string;
  sent: number;
  failed: number;
  errors: string[];
  tags: string[];
  scribe_code: string | null;
  internal_notes: string | null;
  message_snippet: string | null;
  message_text: string | null;
  created_at: string;
  status?: string;
  log_details?: unknown;
};
