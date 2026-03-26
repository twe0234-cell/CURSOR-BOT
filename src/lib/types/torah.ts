// ============================================================
// Torah Projects Engine — TypeScript types
// Mirrors supabase/migrations/044_torah_projects_engine.sql
// and 045_torah_projects_per_column_pricing.sql (total_agreed_price, columns_count)
// ============================================================

// ── Enum-like string literals ────────────────────────────────

export type TorahProjectStatus =
  | "contract"
  | "writing"
  | "qa"
  | "completed"
  | "delivered";

export type TorahSheetStatus =
  | "not_started"
  | "written"
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
  created_at: string;           // ISO timestamptz
}

/** torah_sheets row — one row per physical ירייה (sheet), 1–62 */
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
  /** The מגיה (QA reader / fixer) receiving this batch */
  magiah_id: string;
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
  in_qa: "בהגהה",
  needs_fixing: "לתיקון",
  approved: "אושר",
  sewn: "תפור",
};

/** Total number of sheets in a standard Sefer Torah */
export const TORAH_SHEET_COUNT = 62;
