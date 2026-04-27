"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import type {
  CommercialStatus,
  ProductionStatus,
  TaggingStatus,
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
  appendTorahSysEvent,
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

export type TorahProjectWorkflowBudgetRow = {
  id: string;
  title: string | null;
  status: string | null;
  commercial_status: string | null;
  production_status: string | null;
  contract_price: number;
  planned_scribe: number;
  planned_parchment: number;
  planned_proofreading: number;
  planned_total_cost: number;
  actual_scribe: number;
  actual_parchment: number;
  actual_proofreading: number;
  actual_total_cost: number;
  actual_income: number;
  actual_refunds: number;
  projected_profit: number;
  realized_profit: number;
  cost_variance: number;
};

export type TorahProjectWorkflowPaceRow = {
  project_id: string;
  title: string | null;
  start_date: string | null;
  target_date: string | null;
  required_pace: number;
  columns_total: number;
  columns_written: number;
  days_since_start: number;
  actual_pace: number;
  expected_columns_by_now: number;
  columns_behind: number;
  pace_status: string | null;
};

export type TorahProjectPaymentVarianceRow = {
  project_id: string;
  party: string;
  total_scheduled: number;
  expected_by_now: number;
  actual_paid: number;
  variance_amount: number;
  days_overdue: number;
};

export type TorahProjectCalculatorVarianceRow = {
  project_id: string;
  title: string | null;
  snapshot_locked_at: string | null;
  quoted_scribe: number;
  quoted_parchment: number;
  quoted_proofreading: number;
  quoted_tagging: number;
  quoted_total: number;
  actual_scribe: number;
  actual_parchment: number;
  actual_proofreading: number;
  actual_total_cost: number;
  scribe_variance: number;
  parchment_variance: number;
  proofreading_variance: number;
  total_variance: number;
};

export type TorahProjectBusinessExceptionRow = {
  exception_type: string;
  severity: string;
  entity_id: string;
  entity_type: string;
  entity_label: string | null;
  message: string;
  detected_at: string;
};

export type TorahProjectWorkflowSummaryData = {
  budget: TorahProjectWorkflowBudgetRow | null;
  pace: TorahProjectWorkflowPaceRow | null;
  paymentVariance: TorahProjectPaymentVarianceRow[];
  calculatorVariance: TorahProjectCalculatorVarianceRow | null;
  exceptions: TorahProjectBusinessExceptionRow[];
  sourceWarnings: string[];
};

export type FetchProjectWithSheetsResult =
  | {
      success: true;
      project: TorahProjectDetailView;
      sheets: TorahSheetGridRow[];
      workflowSummary: TorahProjectWorkflowSummaryData;
    }
  | { success: false; code: "NOT_FOUND" | "UNAUTHENTICATED" | "ERROR"; error: string };

function readNumber(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function mapWorkflowBudgetRow(row: Record<string, unknown>): TorahProjectWorkflowBudgetRow {
  return {
    id: String(row.id ?? ""),
    title: readString(row.title),
    status: readString(row.status),
    commercial_status: readString(row.commercial_status),
    production_status: readString(row.production_status),
    contract_price: readNumber(row.contract_price),
    planned_scribe: readNumber(row.planned_scribe),
    planned_parchment: readNumber(row.planned_parchment),
    planned_proofreading: readNumber(row.planned_proofreading),
    planned_total_cost: readNumber(row.planned_total_cost),
    actual_scribe: readNumber(row.actual_scribe),
    actual_parchment: readNumber(row.actual_parchment),
    actual_proofreading: readNumber(row.actual_proofreading),
    actual_total_cost: readNumber(row.actual_total_cost),
    actual_income: readNumber(row.actual_income),
    actual_refunds: readNumber(row.actual_refunds),
    projected_profit: readNumber(row.projected_profit),
    realized_profit: readNumber(row.realized_profit),
    cost_variance: readNumber(row.cost_variance),
  };
}

function mapWorkflowPaceRow(row: Record<string, unknown>): TorahProjectWorkflowPaceRow {
  return {
    project_id: String(row.project_id ?? ""),
    title: readString(row.title),
    start_date: readString(row.start_date),
    target_date: readString(row.target_date),
    required_pace: readNumber(row.required_pace),
    columns_total: readNumber(row.columns_total),
    columns_written: readNumber(row.columns_written),
    days_since_start: readNumber(row.days_since_start),
    actual_pace: readNumber(row.actual_pace),
    expected_columns_by_now: readNumber(row.expected_columns_by_now),
    columns_behind: readNumber(row.columns_behind),
    pace_status: readString(row.pace_status),
  };
}

function mapPaymentVarianceRow(row: Record<string, unknown>): TorahProjectPaymentVarianceRow {
  return {
    project_id: String(row.project_id ?? ""),
    party: String(row.party ?? "unknown"),
    total_scheduled: readNumber(row.total_scheduled),
    expected_by_now: readNumber(row.expected_by_now),
    actual_paid: readNumber(row.actual_paid),
    variance_amount: readNumber(row.variance_amount),
    days_overdue: readNumber(row.days_overdue),
  };
}

function mapCalculatorVarianceRow(
  row: Record<string, unknown>
): TorahProjectCalculatorVarianceRow {
  return {
    project_id: String(row.project_id ?? ""),
    title: readString(row.title),
    snapshot_locked_at: readString(row.snapshot_locked_at),
    quoted_scribe: readNumber(row.quoted_scribe),
    quoted_parchment: readNumber(row.quoted_parchment),
    quoted_proofreading: readNumber(row.quoted_proofreading),
    quoted_tagging: readNumber(row.quoted_tagging),
    quoted_total: readNumber(row.quoted_total),
    actual_scribe: readNumber(row.actual_scribe),
    actual_parchment: readNumber(row.actual_parchment),
    actual_proofreading: readNumber(row.actual_proofreading),
    actual_total_cost: readNumber(row.actual_total_cost),
    scribe_variance: readNumber(row.scribe_variance),
    parchment_variance: readNumber(row.parchment_variance),
    proofreading_variance: readNumber(row.proofreading_variance),
    total_variance: readNumber(row.total_variance),
  };
}

function mapBusinessExceptionRow(
  row: Record<string, unknown>
): TorahProjectBusinessExceptionRow {
  return {
    exception_type: String(row.exception_type ?? "unknown"),
    severity: String(row.severity ?? "info"),
    entity_id: String(row.entity_id ?? ""),
    entity_type: String(row.entity_type ?? ""),
    entity_label: readString(row.entity_label),
    message: String(row.message ?? ""),
    detected_at: String(row.detected_at ?? ""),
  };
}

async function fetchTorahProjectWorkflowSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<TorahProjectWorkflowSummaryData> {
  const sourceWarnings: string[] = [];

  const [budgetResult, paceResult, varianceResult, calculatorResult, exceptionsResult] =
    await Promise.all([
      supabase
        .from("torah_project_budget_vs_actual")
        .select(
          "id,title,status,commercial_status,production_status,contract_price,planned_scribe,planned_parchment,planned_proofreading,planned_total_cost,actual_scribe,actual_parchment,actual_proofreading,actual_total_cost,actual_income,actual_refunds,projected_profit,realized_profit,cost_variance"
        )
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("torah_project_pace_analysis")
        .select(
          "project_id,title,start_date,target_date,required_pace,columns_total,columns_written,days_since_start,actual_pace,expected_columns_by_now,columns_behind,pace_status"
        )
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("torah_payment_schedule_variance")
        .select(
          "project_id,party,total_scheduled,expected_by_now,actual_paid,variance_amount,days_overdue"
        )
        .eq("project_id", projectId)
        .order("party", { ascending: true }),
      supabase
        .from("torah_calculator_vs_actual")
        .select(
          "project_id,title,snapshot_locked_at,quoted_scribe,quoted_parchment,quoted_proofreading,quoted_tagging,quoted_total,actual_scribe,actual_parchment,actual_proofreading,actual_total_cost,scribe_variance,parchment_variance,proofreading_variance,total_variance"
        )
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("business_exceptions")
        .select("exception_type,severity,entity_id,entity_type,entity_label,message,detected_at")
        .eq("entity_type", "torah_project")
        .eq("entity_id", projectId)
        .order("detected_at", { ascending: false })
        .limit(6),
    ]);

  if (budgetResult.error) sourceWarnings.push(`budget_vs_actual: ${budgetResult.error.message}`);
  if (paceResult.error) sourceWarnings.push(`pace_analysis: ${paceResult.error.message}`);
  if (varianceResult.error) sourceWarnings.push(`payment_variance: ${varianceResult.error.message}`);
  if (calculatorResult.error) {
    sourceWarnings.push(`calculator_vs_actual: ${calculatorResult.error.message}`);
  }
  if (exceptionsResult.error) {
    sourceWarnings.push(`business_exceptions: ${exceptionsResult.error.message}`);
  }

  return {
    budget: budgetResult.data
      ? mapWorkflowBudgetRow(budgetResult.data as Record<string, unknown>)
      : null,
    pace: paceResult.data ? mapWorkflowPaceRow(paceResult.data as Record<string, unknown>) : null,
    paymentVariance: ((varianceResult.data ?? []) as Record<string, unknown>[]).map(
      mapPaymentVarianceRow
    ),
    calculatorVariance: calculatorResult.data
      ? mapCalculatorVarianceRow(calculatorResult.data as Record<string, unknown>)
      : null,
    exceptions: ((exceptionsResult.data ?? []) as Record<string, unknown>[]).map(
      mapBusinessExceptionRow
    ),
    sourceWarnings,
  };
}

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
      commercial_status:
        ((row as { commercial_status?: CommercialStatus | null }).commercial_status as
          | CommercialStatus
          | null
          | undefined) ?? undefined,
      production_status:
        ((row as { production_status?: ProductionStatus | null }).production_status as
          | ProductionStatus
          | null
          | undefined) ?? undefined,
      deal_type: ((row as { deal_type?: string | null }).deal_type as string | null) ?? null,
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
      planned_parchment_budget:
        (row as { planned_parchment_budget?: unknown }).planned_parchment_budget != null &&
        (row as { planned_parchment_budget?: unknown }).planned_parchment_budget !== ""
          ? Number((row as { planned_parchment_budget: unknown }).planned_parchment_budget)
          : null,
      planned_scribe_budget:
        (row as { planned_scribe_budget?: unknown }).planned_scribe_budget != null &&
        (row as { planned_scribe_budget?: unknown }).planned_scribe_budget !== ""
          ? Number((row as { planned_scribe_budget: unknown }).planned_scribe_budget)
          : null,
      planned_proofreading_budget:
        (row as { planned_proofreading_budget?: unknown }).planned_proofreading_budget != null &&
        (row as { planned_proofreading_budget?: unknown }).planned_proofreading_budget !== ""
          ? Number((row as { planned_proofreading_budget: unknown }).planned_proofreading_budget)
          : null,
      estimated_expenses_total:
        (row as { estimated_expenses_total?: unknown }).estimated_expenses_total != null &&
        (row as { estimated_expenses_total?: unknown }).estimated_expenses_total !== ""
          ? Number((row as { estimated_expenses_total: unknown }).estimated_expenses_total)
          : null,
      tagging_status:
        ((row as { tagging_status?: TaggingStatus | null }).tagging_status as
          | TaggingStatus
          | null
          | undefined) ?? undefined,
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

    const workflowSummary = await fetchTorahProjectWorkflowSummary(supabase, projectId);

    return { success: true, project, sheets, workflowSummary };
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

    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "torah_receive_sheets_from_scribe_atomic",
      {
        p_project_id: projectId,
        p_sheet_ids: parsed.data.sheetIds,
      }
    );
    if (rpcErr) return { success: false, error: rpcErr.message };

    const payload = rpcData as { ok?: boolean; error?: string; updated?: number } | null;
    if (!payload || payload.ok !== true) {
      return { success: false, error: payload?.error ?? "שגיאה" };
    }

    const updatedCount = Number(payload.updated ?? parsed.data.sheetIds.length);
    if (updatedCount <= 0) {
      return { success: false, error: "לא עודכנו יריעות" };
    }

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

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);
    revalidatePath(`/crm/${proj.scribe_id as string}`);

    return { success: true, updated: updatedCount, pace };
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

const optionalTorahMoney = z
  .union([z.string(), z.number(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  });

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
  planned_parchment_budget: optionalTorahMoney.optional(),
  planned_scribe_budget: optionalTorahMoney.optional(),
  planned_proofreading_budget: optionalTorahMoney.optional(),
  estimated_expenses_total: optionalTorahMoney.optional(),
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
        planned_parchment_budget: v.planned_parchment_budget ?? null,
        planned_scribe_budget: v.planned_scribe_budget ?? null,
        planned_proofreading_budget: v.planned_proofreading_budget ?? null,
        estimated_expenses_total: v.estimated_expenses_total ?? null,
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

type InsertTorahLedgerRowResult =
  | {
      ok: true;
      transactionId: string;
      proj: { client_id: string | null; scribe_id: string | null };
    }
  | { ok: false; error: string };

/** DB insert only — notifications run after `sys_events` in `createTorahProjectTransaction`. */
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
): Promise<InsertTorahLedgerRowResult> {
  const { data: proj, error: pErr } = await supabase
    .from("torah_projects")
    .select("id, client_id, scribe_id")
    .eq("id", args.projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (pErr || !proj) return { ok: false, error: "הפרויקט לא נמצא" };

  const { data: row, error: insErr } = await supabase
    .from("torah_project_transactions")
    .insert({
      project_id: args.projectId,
      transaction_type: args.transaction_type,
      amount: args.amount,
      date: args.dateIso,
      notes: args.notes,
      attachment_url: args.attachment_url,
      receipt_sent: args.receipt_sent,
    })
    .select("id")
    .single();

  if (insErr || !row?.id) return { ok: false, error: insErr?.message ?? "שגיאת הוספה" };

  return {
    ok: true,
    transactionId: row.id as string,
    proj: {
      client_id: (proj.client_id as string | null) ?? null,
      scribe_id: (proj.scribe_id as string | null) ?? null,
    },
  };
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
    if (!ins.ok) return { success: false, error: ins.error };

    const ev = await appendTorahSysEvent({
      projectId: v.projectId,
      entityType: "torah_project_transaction",
      entityId: ins.transactionId,
      action: "ledger_transaction_created",
      metadata: {
        transaction_type: v.transaction_type,
        amount: v.amount,
        notes: v.notes ?? null,
      },
    });
    if (!ev.success) {
      await supabase
        .from("torah_project_transactions")
        .delete()
        .eq("id", ins.transactionId)
        .eq("project_id", v.projectId);
      return { success: false, error: ev.error };
    }

    if (v.transaction_type === "scribe_payment" && ins.proj.scribe_id) {
      await notifyScribePayment(ins.proj.scribe_id, v.amount, v.projectId);
    }
    if (v.transaction_type === "client_payment" && ins.proj.client_id) {
      await notifyClientPayment(ins.proj.client_id, v.amount, v.projectId);
    }

    revalidatePath("/torah");
    revalidatePath(`/torah/${v.projectId}`);
    revalidatePath("/torah/quick-entry");
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

    const { data, error: rpcErr } = await supabase.rpc("torah_mark_payment_schedule_paid", {
      p_schedule_id: scheduleId,
    });

    if (rpcErr) return { success: false, error: rpcErr.message };

    const payload = data as {
      ok?: boolean;
      error?: string;
      project_id?: string;
      party?: string;
      amount?: number;
      client_id?: string | null;
      scribe_id?: string | null;
    } | null;

    if (!payload || payload.ok !== true) {
      const msg =
        typeof payload?.error === "string" && payload.error.trim() !== ""
          ? payload.error
          : "שגיאה";
      return { success: false, error: msg };
    }

    const projectId = payload.project_id as string;
    const party = String(payload.party ?? "");
    const amount = Number(payload.amount ?? 0);
    const clientId = (payload.client_id as string | null) ?? null;
    const scribeId = (payload.scribe_id as string | null) ?? null;

    if (party === "scribe" && scribeId) {
      await notifyScribePayment(scribeId, amount, projectId);
    }
    if (party === "client" && clientId) {
      await notifyClientPayment(clientId, amount, projectId);
    }

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
