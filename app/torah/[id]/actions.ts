"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import type {
  TorahProjectDetailView,
  TorahSheetGridRow,
  TorahSheetStatus,
} from "@/src/lib/types/torah";
import { normalizeQaAgreed } from "@/src/lib/types/torah";
import { computeTorahScribePace, type TorahScribePaceResult } from "@/src/services/crm.logic";
import { runTorahCalendarSync } from "@/src/lib/google/calendar";
import {
  TORAH_LEDGER_TRANSACTION_TYPES,
  type TorahLedgerTransactionType,
} from "@/src/lib/constants/torahLedger";
import {
  notifyClientPayment,
  notifyScribePayment,
} from "@/src/services/notification.service";
import {
  engineBatchTransitionSheets,
  engineTransitionTorahSheet,
  engineUpdateTorahSheetColumns,
} from "@/src/services/torah.service";
import type { SysEvent } from "@/src/lib/types/sys-events";

/** סוג קלף — דינמי מהמחשבון; DB ללא CHECK אחרי מיגרציה 057 */
const optTorahParchmentText = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const t = String(v).trim();
    return t === "" ? null : t.slice(0, 200);
  });

const optContractLink = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const t = String(v).trim();
    return t === "" ? null : t.slice(0, 2048);
  });

const SHEET_STATUS_TUPLE = [
  "not_started",
  "written",
  "reported_written",
  "received",
  "in_qa",
  "needs_fixing",
  "approved",
  "sewn",
] as const satisfies readonly TorahSheetStatus[];

const sheetStatusEnum = z.enum(SHEET_STATUS_TUPLE);

export type FetchProjectWithSheetsResult =
  | { success: true; project: TorahProjectDetailView; sheets: TorahSheetGridRow[] }
  | { success: false; code: "NOT_FOUND" | "UNAUTHENTICATED" | "ERROR"; error: string };

export async function fetchProjectWithSheets(
  projectId: string
): Promise<FetchProjectWithSheetsResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, code: "UNAUTHENTICATED", error: "יש להתחבר" };
    }

    const { data: row, error: pErr } = await supabase
      .from("torah_projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return { success: false, code: "ERROR", error: pErr.message };
    if (!row) return { success: false, code: "NOT_FOUND", error: "הפרויקט לא נמצא" };

    const { data: sheetRows, error: sErr } = await supabase
      .from("torah_sheets")
      .select("id, project_id, sheet_number, columns_count, status, sku")
      .eq("project_id", projectId)
      .order("sheet_number", { ascending: true });

    if (sErr) return { success: false, code: "ERROR", error: sErr.message };

    const contactIds = [row.scribe_id, row.client_id].filter(Boolean) as string[];
    const nameMap = new Map<string, string>();
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from("crm_contacts")
        .select("id, name")
        .eq("user_id", user.id)
        .in("id", contactIds);
      for (const c of contacts ?? []) {
        nameMap.set(c.id as string, (c.name as string) ?? "");
      }
    }

    const project: TorahProjectDetailView = {
      id: row.id as string,
      user_id: row.user_id as string,
      client_id: (row.client_id as string | null) ?? null,
      scribe_id: row.scribe_id as string,
      title: row.title as string,
      status: row.status as TorahProjectDetailView["status"],
      start_date: (row.start_date as string | null) ?? null,
      target_date: (row.target_date as string | null) ?? null,
      total_agreed_price: Number(row.total_agreed_price ?? 0),
      amount_paid_by_client: Number(row.amount_paid_by_client ?? 0),
      amount_paid_to_scribe: Number(row.amount_paid_to_scribe ?? 0),
      columns_per_day: Number(row.columns_per_day ?? 0),
      qa_weeks_buffer: Number(row.qa_weeks_buffer ?? 3),
      gavra_qa_count: Number(row.gavra_qa_count ?? 1),
      computer_qa_count: Number(row.computer_qa_count ?? 1),
      requires_tagging: Boolean(row.requires_tagging),
      price_per_column: Number((row as { price_per_column?: number }).price_per_column ?? 0),
      qa_agreed_types: normalizeQaAgreed(
        (row as { qa_agreed_types?: unknown }).qa_agreed_types
      ),
      includes_accessories: Boolean(
        (row as { includes_accessories?: boolean }).includes_accessories
      ),
      parchment_type:
        ((row as { parchment_type?: string | null }).parchment_type as string | null) ??
        null,
      client_contract_url:
        ((row as { client_contract_url?: string | null }).client_contract_url as string | null) ??
        null,
      scribe_contract_url:
        ((row as { scribe_contract_url?: string | null }).scribe_contract_url as string | null) ??
        null,
      calculator_snapshot:
        (row as { calculator_snapshot?: Record<string, unknown> | null }).calculator_snapshot ??
        null,
      snapshot_locked_at:
        ((row as { snapshot_locked_at?: string | null }).snapshot_locked_at as string | null) ??
        null,
      created_at: row.created_at as string,
      scribe_name: nameMap.get(row.scribe_id as string) ?? null,
      client_name: row.client_id ? (nameMap.get(row.client_id as string) ?? null) : null,
    };

    const sheets: TorahSheetGridRow[] = (sheetRows ?? []).map((s) => ({
      id: s.id as string,
      project_id: s.project_id as string,
      sheet_number: Number(s.sheet_number),
      columns_count: Number(s.columns_count ?? 4),
      status: s.status as TorahSheetStatus,
      sku: (s.sku as string | null) ?? null,
    }));

    return { success: true, project, sheets };
  } catch (err) {
    return {
      success: false,
      code: "ERROR",
      error: err instanceof Error ? err.message : "שגיאה לא צפויה",
    };
  }
}

const updateSheetSchema = z
  .object({
    status: sheetStatusEnum.optional(),
    columns_count: z.coerce.number().int().min(1).max(12).optional(),
  })
  .refine((d) => d.status !== undefined || d.columns_count !== undefined, {
    message: "יש לספק סטטוס או מספר עמודות",
  });

export type UpdateSheetInput = z.infer<typeof updateSheetSchema>;

export async function updateSheet(
  sheetId: string,
  patch: UpdateSheetInput,
  projectId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = updateSheetSchema.safeParse(patch);
    if (!parsed.success) {
      const msg = parsed.error.flatten().fieldErrors.status?.[0]
        ?? parsed.error.flatten().fieldErrors.columns_count?.[0]
        ?? parsed.error.issues[0]?.message
        ?? "קלט לא תקין";
      return { success: false, error: msg };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    if (parsed.data.status !== undefined) {
      const tr = await engineTransitionTorahSheet({
        sheetId,
        projectId,
        toStatus: parsed.data.status,
      });
      if (!tr.success) return { success: false, error: tr.error };
    }

    if (parsed.data.columns_count !== undefined) {
      const cols = await engineUpdateTorahSheetColumns({
        sheetId,
        projectId,
        columnsCount: parsed.data.columns_count,
      });
      if (!cols.success) return { success: false, error: cols.error };
    }

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

const batchStatusSchema = z.object({
  sheetIds: z.array(z.string().uuid()).min(1, "בחר לפחות יריעה אחת"),
  status: sheetStatusEnum,
});

const RECEIVABLE_SHEET_STATUSES = new Set<TorahSheetStatus>(["not_started", "needs_fixing"]);

const receiveSheetsSchema = z.object({
  sheetIds: z.array(z.string().uuid()).min(1, "בחר לפחות יריעה אחת"),
});

export type ReceiveSheetsFromScribeResult =
  | { success: true; updated: number; pace: TorahScribePaceResult }
  | { success: false; error: string };

/**
 * קליטת יריעות מהסופר — מעבר ל־written, רישום בהיסטוריית איש קשר, חישוב סטטוס קצב.
 */
export async function receiveSheetsFromScribe(
  projectId: string,
  sheetIds: string[]
): Promise<ReceiveSheetsFromScribeResult> {
  try {
    const parsed = receiveSheetsSchema.safeParse({ sheetIds });
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { success: false, error: (first as string) ?? "שגיאת ולידציה" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj, error: pErr } = await supabase
      .from("torah_projects")
      .select("id, scribe_id, start_date, target_date, columns_per_day")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr || !proj) return { success: false, error: "הפרויקט לא נמצא" };

    const { data: selectedRows, error: selErr } = await supabase
      .from("torah_sheets")
      .select("id, status, sheet_number")
      .in("id", parsed.data.sheetIds)
      .eq("project_id", projectId);

    if (selErr) return { success: false, error: selErr.message };
    if (!selectedRows || selectedRows.length !== parsed.data.sheetIds.length) {
      return { success: false, error: "לא כל היריעות שייכות לפרויקט" };
    }

    for (const row of selectedRows) {
      const st = row.status as TorahSheetStatus;
      if (!RECEIVABLE_SHEET_STATUSES.has(st)) {
        return {
          success: false,
          error: "ניתן לקלוט רק יריעות בסטטוס «טרם התחיל» או «לתיקון»",
        };
      }
    }

    const batchTr = await engineBatchTransitionSheets({
      projectId,
      sheetIds: parsed.data.sheetIds,
      toStatus: "reported_written",
    });
    if (!batchTr.success) return { success: false, error: batchTr.error };

    const { data: allSheetRows, error: allErr } = await supabase
      .from("torah_sheets")
      .select("columns_count, status")
      .eq("project_id", projectId)
      .order("sheet_number", { ascending: true });

    if (allErr) return { success: false, error: allErr.message };

    const sheetsForPace = (allSheetRows ?? []).map((s) => ({
      columns_count: Number(s.columns_count ?? 4),
      status: String(s.status),
    }));

    const pace = computeTorahScribePace({
      startDate: (proj.start_date as string | null) ?? null,
      targetDate: (proj.target_date as string | null) ?? null,
      columnsPerDay: Number(proj.columns_per_day ?? 0),
      sheets: sheetsForPace,
    });

    const nums = [...selectedRows]
      .map((r) => Number(r.sheet_number))
      .sort((a, b) => a - b);
    const paceHe =
      pace.status === "on_track"
        ? "בעקבות היעד"
        : pace.status === "delayed"
          ? `באיחור (בערך ${Math.max(1, Math.ceil(pace.delayDays))} ימי עבודה)`
          : "לא מחושב (חסר תאריך התחלה או קצב עמודות/יום)";

    const historyBody = `קליטת יריעות מהסופר — יריעות: ${nums.join(", ")}\nסטטוס קצב: ${paceHe}`;

    const { error: histErr } = await supabase.from("crm_contact_history").insert({
      user_id: user.id,
      contact_id: proj.scribe_id as string,
      body: historyBody,
      direction: "internal",
      source: "system",
      metadata: { kind: "torah_receive_sheets", project_id: projectId } as Record<string, unknown>,
    });

    if (histErr) {
      return { success: false, error: `היריעות עודכנו אך יומן CRM נכשל: ${histErr.message}` };
    }

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);
    revalidatePath(`/crm/${proj.scribe_id as string}`);

    return { success: true, updated: parsed.data.sheetIds.length, pace };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function batchUpdateSheetStatuses(
  sheetIds: string[],
  status: TorahSheetStatus,
  projectId: string
): Promise<{ success: true; updated: number } | { success: false; error: string }> {
  try {
    const parsed = batchStatusSchema.safeParse({ sheetIds, status });
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { success: false, error: (first as string) ?? "שגיאת ולידציה" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const batchTr = await engineBatchTransitionSheets({
      projectId,
      sheetIds: parsed.data.sheetIds,
      toStatus: parsed.data.status,
    });
    if (!batchTr.success) return { success: false, error: batchTr.error };

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);
    return { success: true, updated: parsed.data.sheetIds.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

/** קליטה במחסן: reported_written → received */
export async function markTorahSheetsReceived(
  projectId: string,
  sheetIds: string[]
): Promise<{ success: true; updated: number } | { success: false; error: string }> {
  try {
    const parsed = receiveSheetsSchema.safeParse({ sheetIds });
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { success: false, error: (first as string) ?? "שגיאת ולידציה" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const { data: rows } = await supabase
      .from("torah_sheets")
      .select("id, status")
      .in("id", parsed.data.sheetIds)
      .eq("project_id", projectId);

    if (!rows || rows.length !== parsed.data.sheetIds.length) {
      return { success: false, error: "לא כל היריעות שייכות לפרויקט" };
    }

    for (const r of rows) {
      if ((r.status as string) !== "reported_written") {
        return {
          success: false,
          error: "קליטת מחסן זמינה רק ליריעות בסטטוס «דווח נכתב»",
        };
      }
    }

    const batchTr = await engineBatchTransitionSheets({
      projectId,
      sheetIds: parsed.data.sheetIds,
      toStatus: "received",
    });
    if (!batchTr.success) return { success: false, error: batchTr.error };

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);
    return { success: true, updated: parsed.data.sheetIds.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

const updateTorahProjectSchema = z.object({
  title: z.string().min(1, "שם חובה").max(200),
  target_date: z
    .union([z.string(), z.literal(""), z.null()])
    .transform((v) => (v === "" || v == null ? null : v)),
  total_agreed_price: z.coerce.number().nonnegative(),
  columns_per_day: z.coerce.number().nonnegative(),
  qa_weeks_buffer: z.coerce.number().int().nonnegative(),
  gavra_qa_count: z.coerce.number().int().nonnegative(),
  computer_qa_count: z.coerce.number().int().nonnegative(),
  requires_tagging: z.boolean(),
  price_per_column: z.coerce.number().nonnegative(),
  includes_accessories: z.boolean(),
  parchment_type: optTorahParchmentText,
  client_contract_url: optContractLink,
  scribe_contract_url: optContractLink,
});

export type UpdateTorahProjectInput = z.infer<typeof updateTorahProjectSchema>;

export async function updateTorahProject(
  projectId: string,
  input: UpdateTorahProjectInput
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = updateTorahProjectSchema.safeParse(input);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { success: false, error: (first as string) ?? "שגיאת ולידציה" };
    }
    const v = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("torah_projects")
      .update({
        title: v.title.trim(),
        target_date: v.target_date,
        total_agreed_price: v.total_agreed_price,
        columns_per_day: v.columns_per_day,
        qa_weeks_buffer: Math.max(0, Math.floor(v.qa_weeks_buffer)),
        gavra_qa_count: Math.max(0, Math.floor(v.gavra_qa_count)),
        computer_qa_count: Math.max(0, Math.floor(v.computer_qa_count)),
        requires_tagging: v.requires_tagging,
        price_per_column: v.price_per_column,
        includes_accessories: v.includes_accessories,
        parchment_type: v.parchment_type,
        client_contract_url: v.client_contract_url,
        scribe_contract_url: v.scribe_contract_url,
        qa_agreed_types: {
          gavra: Math.max(0, Math.floor(v.gavra_qa_count)),
          computer: Math.max(0, Math.floor(v.computer_qa_count)),
        },
      })
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);

    void runTorahCalendarSync(supabase, user.id, {
      projectId,
      title: v.title.trim(),
      targetDate: v.target_date,
      qaWeeksBuffer: Math.max(0, Math.floor(v.qa_weeks_buffer)),
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

/** מחיקת פרויקט ס״ת (יריעות ושקיות QA נמחקות ב־CASCADE). */
export async function deleteTorahProject(
  projectId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("torah_projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/torah");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

// ── Torah project ledger (054) ─────────────────────────────────────────────

export type TorahProjectTransactionRow = {
  id: string;
  project_id: string;
  transaction_type: string;
  amount: number;
  date: string;
  notes: string | null;
  attachment_url: string | null;
  receipt_sent: boolean;
  qa_batch_id: string | null;
  fix_task_id: string | null;
};

const createTorahTransactionSchema = z.object({
  projectId: z.string().uuid(),
  transaction_type: z.enum(TORAH_LEDGER_TRANSACTION_TYPES),
  amount: z.coerce.number().nonnegative(),
  date: z.union([z.string(), z.date()]).optional(),
  notes: z.union([z.string(), z.literal(""), z.null()]).optional(),
  attachment_url: z.union([optContractLink, z.undefined()]).optional(),
  receipt_sent: z.boolean().optional(),
});

export type FetchTorahTransactionsResult =
  | { success: true; transactions: TorahProjectTransactionRow[] }
  | { success: false; error: string };

export async function fetchTorahProjectTransactions(
  projectId: string
): Promise<FetchTorahTransactionsResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const { data, error } = await supabase
      .from("torah_project_transactions")
      .select("*")
      .eq("project_id", projectId)
      .order("date", { ascending: false });

    if (error) return { success: false, error: error.message };

    const transactions: TorahProjectTransactionRow[] = (data ?? []).map((r) => ({
      id: r.id as string,
      project_id: r.project_id as string,
      transaction_type: r.transaction_type as string,
      amount: Number(r.amount ?? 0),
      date: r.date as string,
      notes: (r.notes as string | null) ?? null,
      attachment_url: (r.attachment_url as string | null) ?? null,
      receipt_sent: Boolean(r.receipt_sent),
      qa_batch_id: (r as { qa_batch_id?: string | null }).qa_batch_id ?? null,
      fix_task_id: (r as { fix_task_id?: string | null }).fix_task_id ?? null,
    }));

    return { success: true, transactions };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

/** אירועי audit לפרויקט — קריאה בלבד (ציר זמן). */
export type TorahSysEventView = SysEvent & {
  /** מולא ל־entity_type = torah_sheet בלבד */
  sheet_number: number | null;
};

export async function fetchTorahProjectSysEvents(
  projectId: string
): Promise<
  { success: true; events: TorahSysEventView[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const { data: rows, error } = await supabase
      .from("sys_events")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const sheetIds = [
      ...new Set(
        (rows ?? [])
          .filter((r) => (r as { entity_type?: string }).entity_type === "torah_sheet")
          .map((r) => String((r as { entity_id?: string }).entity_id ?? ""))
          .filter(Boolean)
      ),
    ];

    const numMap = new Map<string, number>();
    if (sheetIds.length > 0) {
      const { data: sh } = await supabase
        .from("torah_sheets")
        .select("id, sheet_number")
        .eq("project_id", projectId)
        .in("id", sheetIds);
      for (const s of sh ?? []) {
        numMap.set(s.id as string, Number(s.sheet_number));
      }
    }

    const events: TorahSysEventView[] = (rows ?? []).map((r) => {
      const entityType = String((r as { entity_type: string }).entity_type);
      const entityId = String((r as { entity_id: string }).entity_id);
      const metaRaw = (r as { metadata?: unknown }).metadata;
      const metadata: Record<string, unknown> =
        metaRaw && typeof metaRaw === "object" && metaRaw !== null && !Array.isArray(metaRaw)
          ? (metaRaw as Record<string, unknown>)
          : {};

      return {
        id: r.id as string,
        user_id: r.user_id as string,
        source: String((r as { source?: string }).source ?? "torah"),
        entity_type: entityType,
        entity_id: entityId,
        project_id: ((r as { project_id?: string | null }).project_id as string | null) ?? null,
        action: String((r as { action: string }).action),
        from_state: ((r as { from_state?: string | null }).from_state as string | null) ?? null,
        to_state: ((r as { to_state?: string | null }).to_state as string | null) ?? null,
        metadata,
        created_at: r.created_at as string,
        sheet_number:
          entityType === "torah_sheet" ? numMap.get(entityId) ?? null : null,
      };
    });

    return { success: true, events };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export type CreateTorahTransactionResult =
  | { success: true }
  | { success: false; error: string };

function transactionDateToIso(date: z.infer<typeof createTorahTransactionSchema>["date"]): string {
  if (date instanceof Date) return date.toISOString();
  if (typeof date === "string" && date.trim() !== "") {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

async function insertTorahProjectTransactionRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  args: {
    projectId: string;
    transaction_type: TorahLedgerTransactionType;
    amount: number;
    dateIso: string;
    notes: string | null;
    attachment_url: string | null;
    receipt_sent: boolean;
  }
): Promise<CreateTorahTransactionResult> {
  const { data: proj, error: pErr } = await supabase
    .from("torah_projects")
    .select("id, client_id, scribe_id")
    .eq("id", args.projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (pErr || !proj) return { success: false, error: "הפרויקט לא נמצא" };

  const { error: insErr } = await supabase.from("torah_project_transactions").insert({
    project_id: args.projectId,
    transaction_type: args.transaction_type,
    amount: args.amount,
    date: args.dateIso,
    notes: args.notes,
    attachment_url: args.attachment_url,
    receipt_sent: args.receipt_sent,
  });

  if (insErr) return { success: false, error: insErr.message };

  if (args.transaction_type === "scribe_payment" && proj.scribe_id) {
    await notifyScribePayment(proj.scribe_id as string, args.amount, args.projectId);
  }
  if (args.transaction_type === "client_payment" && proj.client_id) {
    await notifyClientPayment(proj.client_id as string, args.amount, args.projectId);
  }

  return { success: true };
}

export async function createTorahProjectTransaction(
  input: z.infer<typeof createTorahTransactionSchema>
): Promise<CreateTorahTransactionResult> {
  try {
    const parsed = createTorahTransactionSchema.safeParse(input);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { success: false, error: (first as string) ?? "קלט לא תקין" };
    }
    const v = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const dateIso = transactionDateToIso(v.date);
    const ins = await insertTorahProjectTransactionRow(supabase, user.id, {
      projectId: v.projectId,
      transaction_type: v.transaction_type,
      amount: v.amount,
      dateIso,
      notes: v.notes === "" || v.notes == null ? null : v.notes,
      attachment_url: v.attachment_url ?? null,
      receipt_sent: v.receipt_sent ?? false,
    });
    if (!ins.success) return ins;

    revalidatePath("/torah");
    revalidatePath(`/torah/${v.projectId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

// ── Torah payment schedules (054) ───────────────────────────────────────────

export type TorahPaymentScheduleRow = {
  id: string;
  project_id: string;
  party: "client" | "scribe";
  amount: number;
  due_date: string;
  status: "pending" | "paid";
};

const schedulePartyEnum = z.enum(["client", "scribe"]);
const scheduleStatusEnum = z.enum(["pending", "paid"]);

const createScheduleSchema = z.object({
  projectId: z.string().uuid(),
  party: schedulePartyEnum,
  amount: z.coerce.number().nonnegative(),
  due_date: z.string().min(1, "תאריך חובה"),
  status: scheduleStatusEnum.optional(),
});

const updateScheduleSchema = z.object({
  scheduleId: z.string().uuid(),
  party: schedulePartyEnum.optional(),
  amount: z.coerce.number().nonnegative().optional(),
  due_date: z.string().min(1).optional(),
  status: scheduleStatusEnum.optional(),
});

export type FetchTorahSchedulesResult =
  | { success: true; schedules: TorahPaymentScheduleRow[] }
  | { success: false; error: string };

export async function fetchTorahPaymentSchedules(
  projectId: string
): Promise<FetchTorahSchedulesResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const { data, error } = await supabase
      .from("torah_payment_schedules")
      .select("id, project_id, party, amount, due_date, status")
      .eq("project_id", projectId)
      .order("due_date", { ascending: true });

    if (error) return { success: false, error: error.message };

    const schedules: TorahPaymentScheduleRow[] = (data ?? []).map((r) => ({
      id: r.id as string,
      project_id: r.project_id as string,
      party: r.party as "client" | "scribe",
      amount: Number(r.amount ?? 0),
      due_date: String(r.due_date).slice(0, 10),
      status: r.status as "pending" | "paid",
    }));

    return { success: true, schedules };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function createTorahPaymentSchedule(
  input: z.infer<typeof createScheduleSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = createScheduleSchema.safeParse(input);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { success: false, error: (first as string) ?? "קלט לא תקין" };
    }
    const v = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", v.projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const { error } = await supabase.from("torah_payment_schedules").insert({
      project_id: v.projectId,
      party: v.party,
      amount: v.amount,
      due_date: v.due_date,
      status: v.status ?? "pending",
    });

    if (error) return { success: false, error: error.message };

    revalidatePath("/torah");
    revalidatePath(`/torah/${v.projectId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function updateTorahPaymentSchedule(
  input: z.infer<typeof updateScheduleSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = updateScheduleSchema.safeParse(input);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { success: false, error: (first as string) ?? "קלט לא תקין" };
    }
    const v = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const patch: Record<string, unknown> = {};
    if (v.party !== undefined) patch.party = v.party;
    if (v.amount !== undefined) patch.amount = v.amount;
    if (v.due_date !== undefined) patch.due_date = v.due_date;
    if (v.status !== undefined) patch.status = v.status;

    if (Object.keys(patch).length === 0) {
      return { success: false, error: "אין שדות לעדכון" };
    }

    const { data: row, error: selErr } = await supabase
      .from("torah_payment_schedules")
      .select("id, project_id")
      .eq("id", v.scheduleId)
      .maybeSingle();

    if (selErr || !row) return { success: false, error: "המועד לא נמצא" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", row.project_id as string)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!proj) return { success: false, error: "אין הרשאה" };

    const { error } = await supabase
      .from("torah_payment_schedules")
      .update(patch)
      .eq("id", v.scheduleId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/torah");
    revalidatePath(`/torah/${row.project_id as string}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function deleteTorahPaymentSchedule(
  scheduleId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: row, error: selErr } = await supabase
      .from("torah_payment_schedules")
      .select("id, project_id")
      .eq("id", scheduleId)
      .maybeSingle();

    if (selErr || !row) return { success: false, error: "המועד לא נמצא" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", row.project_id as string)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!proj) return { success: false, error: "אין הרשאה" };

    const { error } = await supabase.from("torah_payment_schedules").delete().eq("id", scheduleId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/torah");
    revalidatePath(`/torah/${row.project_id as string}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

/**
 * רישום תנועה (לקוח/סופר) לפי סוג המועד, סימון המועד כשולם, והתראות.
 */
export async function markTorahPaymentSchedulePaid(
  scheduleId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: sched, error: sErr } = await supabase
      .from("torah_payment_schedules")
      .select("id, project_id, party, amount, status")
      .eq("id", scheduleId)
      .maybeSingle();

    if (sErr || !sched) return { success: false, error: "המועד לא נמצא" };

    const projectId = sched.project_id as string;

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!proj) return { success: false, error: "אין הרשאה" };

    if (sched.status !== "pending") {
      return { success: false, error: "המועד כבר סומן כשולם" };
    }

    const party = sched.party as string;
    const transaction_type: TorahLedgerTransactionType =
      party === "scribe" ? "scribe_payment" : "client_payment";

    const amount = Number(sched.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      return { success: false, error: "סכום המועד לא תקין" };
    }

    const notes = `מועד תשלום · ${(sched.id as string).slice(0, 8)}`;

    const ins = await insertTorahProjectTransactionRow(supabase, user.id, {
      projectId,
      transaction_type,
      amount,
      dateIso: new Date().toISOString(),
      notes,
      attachment_url: null,
      receipt_sent: false,
    });
    if (!ins.success) return ins;

    const { error: upErr } = await supabase
      .from("torah_payment_schedules")
      .update({ status: "paid" })
      .eq("id", scheduleId);

    if (upErr) return { success: false, error: upErr.message };

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
