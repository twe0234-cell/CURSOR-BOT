// ============================================================
// Torah Projects Engine — TypeScript types
// Mirrors supabase/migrations/044_torah_projects_engine.sql
// 045 — total_agreed_price, columns_count
// 046 — amount_paid_by_client, amount_paid_to_scribe
// 047 — workflow: columns_per_day, qa_weeks_buffer, gavra_qa_count, computer_qa_count, requires_tagging
// 052 — contract: price_per_column, qa_agreed_types (jsonb), includes_accessories, parchment_type
// 057 — client_contract_url, scribe_contract_url; parchment_type unrestricted (calculator-driven)
// 069 — calculator_snapshot, snapshot_locked_at; sheet statuses reported_written/received; torah_fix_tasks; checker_id on QA batches
// 075 — planned_* budgets, estimated_expenses_total (financial health dashboard)
// ============================================================

/** Parse qa_agreed_types JSON from DB */
export function normalizeQaAgreed(raw: unknown): { gavra: number; computer: number } {
  if (raw == null || typeof raw !== "object") return { gavra: 1, computer: 1 };
  const o = raw as Record<string, unknown>;
  const g = Number(o.gavra);
  const c = Number(o.computer);
  return {
    gavra: Number.isFinite(g) && g >= 0 ? Math.floor(g) : 1,
    computer: Number.isFinite(c) && c >= 0 ? Math.floor(c) : 1,
  };
}

/** Standard STaM Sefer Torah layout: sheets 1, 61, 62 → 3 columns; all others → 4 (245 columns total). */
export function columnsCountForTorahSheetNumber(sheetNumber: number): number {
  if (sheetNumber === 1 || sheetNumber === 61 || sheetNumber === 62) return 3;
  return 4;
}

// ── Enum-like string literals ────────────────────────────────

export type TorahProjectStatus =
  | "contract"
  | "writing"
  | "qa"
  | "completed"
  | "delivered";

export type TorahSheetStatus =
  | "not_started"
  /** legacy — same family as reported_written */
  | "written"
  | "reported_written"
  | "received"
  | "in_qa"
  | "needs_fixing"
  | "approved"
  | "sewn";

export type TorahQaBatchStatus = "sent" | "returned";

// ── DB row types (match column names exactly) ───────────────

/** torah_projects row */
export interface TorahProject {
  id: string;
  user_id: string;
  /** Buyer / commissioner — nullable (project may be spec/stock) */
  client_id: string | null;
  /** The sofer (scribe) doing the work */
  scribe_id: string;
  title: string;
  status: TorahProjectStatus;
  start_date: string | null;    // ISO date "YYYY-MM-DD"
  target_date: string | null;   // ISO date "YYYY-MM-DD"
  /** Total contract price (₪); financial split is per-column across sheets */
  total_agreed_price: number;
  /** Cash received from client (₪) */
  amount_paid_by_client: number;
  /** Cash paid to scribe (₪) */
  amount_paid_to_scribe: number;
  /** Scribe writing pace — columns per day (0 = not set) */
  columns_per_day: number;
  /** Weeks of QA buffer before target date */
  qa_weeks_buffer: number;
  /** Required human (gavra) proofread rounds */
  gavra_qa_count: number;
  /** Required computer proofread rounds */
  computer_qa_count: number;
  /** External tagging (תיוג) required */
  requires_tagging: boolean;
  /** מחיר לעמודה בחוזה (₪) */
  price_per_column: number;
  /** מספרי הגהה מוסכמים בחוזה */
  qa_agreed_types: { gavra: number; computer: number };
  /** אביזרים בחוזה */
  includes_accessories: boolean;
  /** סוג קלף בחוזה */
  parchment_type: string | null;
  /** קישור חיצוני לחוזה לקוח */
  client_contract_url: string | null;
  /** קישור חיצוני לחוזה סופר */
  scribe_contract_url: string | null;
  /** צילום מחירים מהמחשבון בעת חתימה (sys_calculator_config) */
  calculator_snapshot: Record<string, unknown> | null;
  /** מתי ננעל צילום המחירים */
  snapshot_locked_at: string | null;
  /** תקציב קלף מתוכנן (₪) — עדיפות על ערכים בצילום המחשבון */
  planned_parchment_budget: number | null;
  /** תקציב סופר מתוכנן (₪) */
  planned_scribe_budget: number | null;
  /** תקציב הגהות מתוכנן (₪) */
  planned_proofreading_budget: number | null;
  /** סה״כ עלויות מתוכננות לרווח תיאורטי (דוחף על סכימת צילום) */
  estimated_expenses_total: number | null;
  created_at: string;           // ISO timestamptz
}

/** torah_sheets row — one row per physical יריעה (sheet), 1–62 */
export interface TorahSheet {
  id: string;
  project_id: string;
  /** 1–62 */
  sheet_number: number;
  /** Columns on this sheet (default 4; some יריעות have 3 or 2) */
  columns_count: number;
  status: TorahSheetStatus;
  /** CRM contact currently holding the physical sheet (QA reader, etc.) */
  current_holder_id: string | null;
  /** Unique barcode / SKU, e.g. "PRJ-123-S01" */
  sku: string | null;
  image_url: string | null;
  updated_at: string;           // ISO timestamptz (auto-updated by trigger)
}

/** torah_qa_batches row — a "bag" of sheets sent out for QA/fixing */
export interface TorahQaBatch {
  id: string;
  project_id: string;
  /** The מגיה (QA reader / fixer) receiving this batch — optional e.g. computer QA without CRM contact */
  magiah_id: string | null;
  /** בודק/מאשר סבב (איש קשר) — אופציונלי */
  checker_id: string | null;
  /** סוג סבב הגהה */
  qa_kind?: "gavra" | "computer" | "repair" | "other" | null;
  /** עלות סבב (₪) */
  cost_amount?: number;
  /** קישור לדוח/תמונה */
  report_url?: string | null;
  /** תיאור חיצוני כשאין מגיה ב-CRM */
  vendor_label?: string | null;
  status: TorahQaBatchStatus;
  sent_date: string;            // ISO timestamptz
  returned_date: string | null; // ISO timestamptz
  notes: string | null;
  created_at: string;
}

/** torah_batch_sheets row — junction: which sheets are in which batch */
export interface TorahBatchSheet {
  batch_id: string;
  sheet_id: string;
}

/** torah_fix_tasks row — לולאת תיקון ליריעה */
export type TorahFixTaskStatus = "open" | "in_progress" | "done" | "cancelled";

export interface TorahFixTask {
  id: string;
  project_id: string;
  sheet_id: string;
  qa_batch_id: string | null;
  status: TorahFixTaskStatus;
  description: string | null;
  cost_amount: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** torah_project_transactions row — יומן כספי לפרויקט */
export interface TorahProjectTransaction {
  id: string;
  project_id: string;
  transaction_type: string;
  amount: number;
  date: string;
  notes: string | null;
  receipt_sent: boolean;
  attachment_url: string | null;
  qa_batch_id: string | null;
  fix_task_id: string | null;
  created_at: string;
}

// ── Enriched / joined types used in the UI ──────────────────

/** torah_sheets row joined with the holder's name from crm_contacts */
export interface TorahSheetWithHolder extends TorahSheet {
  holder_name: string | null;
}

/** torah_qa_batches row joined with the מגיה name and sheet count */
export interface TorahQaBatchSummary extends TorahQaBatch {
  magiah_name: string | null;
  sheet_count: number;
}

/** Full project view including related contact names */
export interface TorahProjectWithNames extends TorahProject {
  scribe_name: string | null;
  client_name: string | null;
  /** Total sheets created so far (0–62) */
  sheets_created: number;
  /** Sheets with status "approved" or "sewn" */
  sheets_approved: number;
}

/** Project row + CRM names for `/torah/[id]` detail */
export interface TorahProjectDetailView extends TorahProject {
  scribe_name: string | null;
  client_name: string | null;
}

/** Minimal sheet row for the 62-cell grid (detail page) */
export type TorahSheetGridRow = Pick<
  TorahSheet,
  "id" | "project_id" | "sheet_number" | "columns_count" | "status" | "sku"
>;

// ── Helper constants ─────────────────────────────────────────

export const TORAH_PROJECT_STATUSES: TorahProjectStatus[] = [
  "contract",
  "writing",
  "qa",
  "completed",
  "delivered",
];

export const TORAH_SHEET_STATUSES: TorahSheetStatus[] = [
  "not_started",
  "written",
  "reported_written",
  "received",
  "in_qa",
  "needs_fixing",
  "approved",
  "sewn",
];

export const TORAH_PROJECT_STATUS_LABELS: Record<TorahProjectStatus, string> = {
  contract: "חוזה",
  writing: "בכתיבה",
  qa: "הגהה",
  completed: "הושלם",
  delivered: "נמסר",
};

export const TORAH_SHEET_STATUS_LABELS: Record<TorahSheetStatus, string> = {
  not_started: "טרם התחיל",
  written: "נכתב",
  reported_written: "דווח נכתב",
  received: "התקבל",
  in_qa: "בהגהה",
  needs_fixing: "לתיקון",
  approved: "אושר",
  sewn: "תפור",
};

/** Total number of sheets in a standard Sefer Torah */
export const TORAH_SHEET_COUNT = 62;
