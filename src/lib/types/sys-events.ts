// sys_events — domain audit / timeline (migration 069_torah_phase2_workflow_audit.sql)
// Append-style events for state transitions; distinct from sys_logs (technical).

export type SysEventSource = "torah" | string;

/** sys_events row */
export interface SysEvent {
  id: string;
  user_id: string;
  source: SysEventSource;
  /** e.g. torah_project | torah_sheet | torah_qa_batch | torah_fix_task */
  entity_type: string;
  entity_id: string;
  project_id: string | null;
  action: string;
  from_state: string | null;
  to_state: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
