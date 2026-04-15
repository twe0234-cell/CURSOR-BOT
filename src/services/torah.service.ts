/**
 * Torah Production Engine — orchestration (Supabase + sys_events + torah_project_transactions).
 * No UI. Call from server actions only.
 */

import { createClient } from "@/src/lib/supabase/server";
import { logError } from "@/lib/logger";
import {
  assertTorahSheetTransition,
  canResolveQaFromInQa,
  type QaResolution,
} from "@/src/services/torah.logic";

function canAssignSheetToQaBatch(prevStatus: string): boolean {
  const check = assertTorahSheetTransition(prevStatus, "in_qa");
  return check.ok;
}

export type ServiceResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

// ── sys_events ───────────────────────────────────────────────────────────────

export async function appendTorahSysEvent(input: {
  projectId: string;
  entityType: string;
  entityId: string;
  action: string;
  fromState?: string | null;
  toState?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ServiceResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("sys_events")
      .insert({
        user_id: user.id,
        source: "torah",
        project_id: input.projectId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        action: input.action,
        from_state: input.fromState ?? null,
        to_state: input.toState ?? null,
        metadata: input.metadata ?? {},
      })
      .select("id")
      .single();

    if (error || !data) {
      logError("TorahService", "appendTorahSysEvent failed", { error: error?.message });
      return { success: false, error: error?.message ?? "שגיאת sys_events" };
    }
    return { success: true, data: { id: data.id as string } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ── Sheet transitions ───────────────────────────────────────────────────────

export async function engineTransitionTorahSheet(input: {
  sheetId: string;
  projectId: string;
  toStatus: string;
}): Promise<ServiceResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: sheet, error: selErr } = await supabase
      .from("torah_sheets")
      .select("id, status, project_id")
      .eq("id", input.sheetId)
      .eq("project_id", input.projectId)
      .maybeSingle();

    if (selErr || !sheet) return { success: false, error: "היריעה לא נמצאה" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("user_id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (!proj || (proj as { user_id: string }).user_id !== user.id) {
      return { success: false, error: "אין הרשאה" };
    }

    const fromStatus = String((sheet as { status: string }).status);
    const check = assertTorahSheetTransition(fromStatus, input.toStatus);
    if (!check.ok) return { success: false, error: check.error };

    if (fromStatus === input.toStatus) return { success: true };

    const { error: upErr } = await supabase
      .from("torah_sheets")
      .update({ status: input.toStatus })
      .eq("id", input.sheetId)
      .eq("project_id", input.projectId);

    if (upErr) return { success: false, error: upErr.message };

    const ev = await appendTorahSysEvent({
      projectId: input.projectId,
      entityType: "torah_sheet",
      entityId: input.sheetId,
      action: "sheet_status_changed",
      fromState: fromStatus,
      toState: input.toStatus,
    });
    if (!ev.success) return ev;

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** עדכון מספר עמודות בלבד — רישום sys_events (לא שינוי סטטוס workflow) */
export async function engineUpdateTorahSheetColumns(input: {
  sheetId: string;
  projectId: string;
  columnsCount: number;
}): Promise<ServiceResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("user_id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (!proj || (proj as { user_id: string }).user_id !== user.id) {
      return { success: false, error: "אין הרשאה" };
    }

    const { data: sheet, error: selErr } = await supabase
      .from("torah_sheets")
      .select("id, columns_count")
      .eq("id", input.sheetId)
      .eq("project_id", input.projectId)
      .maybeSingle();

    if (selErr || !sheet) return { success: false, error: "היריעה לא נמצאה" };

    const prevCols = Number((sheet as { columns_count?: number }).columns_count ?? 4);
    const next = Math.min(12, Math.max(1, Math.floor(input.columnsCount)));

    const { error: upErr } = await supabase
      .from("torah_sheets")
      .update({ columns_count: next })
      .eq("id", input.sheetId)
      .eq("project_id", input.projectId);

    if (upErr) return { success: false, error: upErr.message };

    if (prevCols !== next) {
      const ev = await appendTorahSysEvent({
        projectId: input.projectId,
        entityType: "torah_sheet",
        entityId: input.sheetId,
        action: "sheet_columns_updated",
        fromState: String(prevCols),
        toState: String(next),
        metadata: { field: "columns_count" },
      });
      if (!ev.success) return ev;
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** מספר מעברים זהים (קליטה מהסופר / עדכון המוני) — אירוע לכל יריעה */
export async function engineBatchTransitionSheets(input: {
  projectId: string;
  sheetIds: string[];
  toStatus: string;
}): Promise<ServiceResult<{ updated: number }>> {
  let n = 0;
  for (const sid of input.sheetIds) {
    const r = await engineTransitionTorahSheet({
      sheetId: sid,
      projectId: input.projectId,
      toStatus: input.toStatus,
    });
    if (!r.success) return r;
    n++;
  }
  return { success: true, data: { updated: n } };
}

/** מסיום QA על יריעה ב-in_qa */
export async function engineSetSheetQaOutcome(input: {
  sheetId: string;
  projectId: string;
  outcome: QaResolution;
}): Promise<ServiceResult> {
  if (!canResolveQaFromInQa(input.outcome)) {
    return { success: false, error: "תוצאת QA לא חוקית" };
  }
  const toStatus = input.outcome === "approved" ? "approved" : "needs_fixing";
  return engineTransitionTorahSheet({
    sheetId: input.sheetId,
    projectId: input.projectId,
    toStatus,
  });
}

// ── QA batch ────────────────────────────────────────────────────────────────

export type QaKind = "gavra" | "computer" | "repair" | "other";

export async function engineCreateQaBatch(input: {
  projectId: string;
  sheetIds: string[];
  magiahId: string | null;
  qaKind?: QaKind | null;
  notes?: string | null;
  checkerId?: string | null;
  /** עלות צפויה לסבב (₪) — נשמר בטבלה; הוצאה ביומן נרשמת ב-return אם רלוונטי */
  costAmount?: number | null;
  reportUrl?: string | null;
}): Promise<ServiceResult<{ batchId: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", input.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    if (!input.sheetIds.length) return { success: false, error: "לא נבחרו יריעות" };

    const { data: sheetsBefore, error: shErr } = await supabase
      .from("torah_sheets")
      .select("id, status")
      .eq("project_id", input.projectId)
      .in("id", input.sheetIds);

    if (shErr || !sheetsBefore || sheetsBefore.length !== input.sheetIds.length) {
      return { success: false, error: "יריעות לא תקינות או לא באותו פרויקט" };
    }

    const prevById = new Map(
      (sheetsBefore as { id: string; status: string }[]).map((s) => [s.id, s.status])
    );

    for (const sid of input.sheetIds) {
      const ps = prevById.get(sid) ?? "";
      if (!canAssignSheetToQaBatch(ps)) {
        return {
          success: false,
          error: `יריעה ${sid.slice(0, 8)}… במצב ${ps} — לא ניתן לשייך לסבב הגהה`,
        };
      }
    }

    const cost =
      input.costAmount != null && Number.isFinite(Number(input.costAmount))
        ? Math.max(0, Number(input.costAmount))
        : 0;

    const { data: batch, error: bErr } = await supabase
      .from("torah_qa_batches")
      .insert({
        project_id: input.projectId,
        magiah_id: input.magiahId,
        checker_id: input.checkerId ?? null,
        qa_kind: input.qaKind ?? null,
        cost_amount: cost,
        report_url: input.reportUrl?.trim() || null,
        status: "sent",
        sent_date: new Date().toISOString(),
        notes: input.notes ?? null,
      })
      .select("id")
      .single();

    if (bErr || !batch) return { success: false, error: bErr?.message ?? "שגיאה ביצירת שקית" };

    const batchId = batch.id as string;

    const junctionRows = input.sheetIds.map((sheetId) => ({
      batch_id: batchId,
      sheet_id: sheetId,
    }));

    const { error: jErr } = await supabase.from("torah_batch_sheets").insert(junctionRows);

    if (jErr) {
      await supabase.from("torah_qa_batches").delete().eq("id", batchId);
      return { success: false, error: jErr.message };
    }

    const { error: sErr } = await supabase
      .from("torah_sheets")
      .update({ status: "in_qa" })
      .in("id", input.sheetIds)
      .eq("project_id", input.projectId);

    if (sErr) {
      await supabase.from("torah_batch_sheets").delete().eq("batch_id", batchId);
      await supabase.from("torah_qa_batches").delete().eq("id", batchId);
      return { success: false, error: sErr.message };
    }

    const batchEv = await appendTorahSysEvent({
      projectId: input.projectId,
      entityType: "torah_qa_batch",
      entityId: batchId,
      action: "qa_batch_created",
      fromState: null,
      toState: "sent",
      metadata: {
        sheet_ids: input.sheetIds,
        qa_kind: input.qaKind ?? null,
      },
    });
    if (!batchEv.success) return batchEv;

    for (const sid of input.sheetIds) {
      const ev = await appendTorahSysEvent({
        projectId: input.projectId,
        entityType: "torah_sheet",
        entityId: sid,
        action: "sheet_assigned_to_qa_batch",
        fromState: prevById.get(sid) ?? null,
        toState: "in_qa",
        metadata: { batch_id: batchId },
      });
      if (!ev.success) return ev;
    }

    return { success: true, data: { batchId } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/**
 * סגירת סבב הגהה (החזרה מהמגיה).
 * אם יש עלות — רישום qa_expense (מסווג כהוצאת הגהה; שם טכני ב-DB: qa_expense) עם qa_batch_id.
 */
export async function engineReturnQaBatch(input: {
  batchId: string;
  projectId: string;
}): Promise<ServiceResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", input.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const { data: batchRow, error: bSel } = await supabase
      .from("torah_qa_batches")
      .select("id, status, cost_amount")
      .eq("id", input.batchId)
      .eq("project_id", input.projectId)
      .maybeSingle();

    if (bSel) return { success: false, error: bSel.message };
    if (!batchRow) return { success: false, error: "הסבב לא נמצא" };

    const prevStatus = String((batchRow as { status: string }).status);
    if (prevStatus === "returned") {
      return { success: true };
    }

    const costRaw = Number((batchRow as { cost_amount?: unknown }).cost_amount ?? 0);
    const cost = Number.isFinite(costRaw) && costRaw > 0 ? costRaw : 0;

    const { error: upErr } = await supabase
      .from("torah_qa_batches")
      .update({
        status: "returned",
        returned_date: new Date().toISOString(),
      })
      .eq("id", input.batchId)
      .eq("project_id", input.projectId);

    if (upErr) return { success: false, error: upErr.message };

    const ev = await appendTorahSysEvent({
      projectId: input.projectId,
      entityType: "torah_qa_batch",
      entityId: input.batchId,
      action: "qa_batch_returned",
      fromState: prevStatus,
      toState: "returned",
      metadata: { cost_recorded: cost },
    });
    if (!ev.success) return ev;

    if (cost > 0) {
      const { data: existing } = await supabase
        .from("torah_project_transactions")
        .select("id")
        .eq("project_id", input.projectId)
        .eq("qa_batch_id", input.batchId)
        .eq("transaction_type", "qa_expense")
        .maybeSingle();

      if (!existing) {
        const { error: txErr } = await supabase.from("torah_project_transactions").insert({
          project_id: input.projectId,
          transaction_type: "qa_expense",
          amount: cost,
          date: new Date().toISOString(),
          notes: `הגהה — סבב QA (${String(input.batchId).slice(0, 8)})`,
          receipt_sent: false,
          qa_batch_id: input.batchId,
        });
        if (txErr) return { success: false, error: txErr.message };
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ── Fix tasks ────────────────────────────────────────────────────────────────

export async function engineCreateFixTask(input: {
  projectId: string;
  sheetId: string;
  qaBatchId?: string | null;
  description?: string | null;
  costAmount?: number;
}): Promise<ServiceResult<{ fixTaskId: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", input.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const cost = Math.max(0, Number(input.costAmount ?? 0));

    const { data: row, error } = await supabase
      .from("torah_fix_tasks")
      .insert({
        project_id: input.projectId,
        sheet_id: input.sheetId,
        qa_batch_id: input.qaBatchId ?? null,
        status: "open",
        description: input.description ?? null,
        cost_amount: cost,
      })
      .select("id")
      .single();

    if (error || !row) return { success: false, error: error?.message ?? "שגיאה ביצירת משימת תיקון" };

    const fixTaskId = row.id as string;

    const ev = await appendTorahSysEvent({
      projectId: input.projectId,
      entityType: "torah_fix_task",
      entityId: fixTaskId,
      action: "fix_task_created",
      fromState: null,
      toState: "open",
      metadata: { sheet_id: input.sheetId, qa_batch_id: input.qaBatchId ?? null },
    });
    if (!ev.success) return ev;

    return { success: true, data: { fixTaskId } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function engineCompleteFixTask(input: {
  fixTaskId: string;
  projectId: string;
  /** סכום בפועל לניכוי (₪); אם לא מסופק — נלקח מ-cost_amount של המשימה */
  actualCost?: number | null;
  nextSheetStatus: "in_qa" | "approved";
}): Promise<ServiceResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", input.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const { data: task, error: tErr } = await supabase
      .from("torah_fix_tasks")
      .select("id, sheet_id, status, cost_amount")
      .eq("id", input.fixTaskId)
      .eq("project_id", input.projectId)
      .maybeSingle();

    if (tErr || !task) return { success: false, error: "משימת תיקון לא נמצאה" };

    const st = String((task as { status: string }).status);
    if (st === "done" || st === "cancelled") {
      return { success: false, error: "המשימה כבר נסגרה" };
    }

    const sheetId = String((task as { sheet_id: string }).sheet_id);
    const baseCost = Number((task as { cost_amount?: unknown }).cost_amount ?? 0);
    const actual =
      input.actualCost != null && Number.isFinite(Number(input.actualCost))
        ? Math.max(0, Number(input.actualCost))
        : baseCost;

    const { error: upTaskErr } = await supabase
      .from("torah_fix_tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        cost_amount: actual,
      })
      .eq("id", input.fixTaskId)
      .eq("project_id", input.projectId);

    if (upTaskErr) return { success: false, error: upTaskErr.message };

    const evTask = await appendTorahSysEvent({
      projectId: input.projectId,
      entityType: "torah_fix_task",
      entityId: input.fixTaskId,
      action: "fix_task_completed",
      fromState: st,
      toState: "done",
      metadata: { sheet_id: sheetId, actual_cost: actual },
    });
    if (!evTask.success) return evTask;

    if (actual > 0) {
      const { data: existingFix } = await supabase
        .from("torah_project_transactions")
        .select("id")
        .eq("project_id", input.projectId)
        .eq("fix_task_id", input.fixTaskId)
        .eq("transaction_type", "fix_deduction")
        .maybeSingle();

      if (!existingFix) {
        const { error: txErr } = await supabase.from("torah_project_transactions").insert({
          project_id: input.projectId,
          transaction_type: "fix_deduction",
          amount: actual,
          date: new Date().toISOString(),
          notes: `תיקון — ניכוי מסופר (${String(input.fixTaskId).slice(0, 8)})`,
          receipt_sent: false,
          fix_task_id: input.fixTaskId,
        });
        if (txErr) return { success: false, error: txErr.message };
      }
    }

    const tr = await engineTransitionTorahSheet({
      sheetId,
      projectId: input.projectId,
      toStatus: input.nextSheetStatus,
    });
    if (!tr.success) return tr;

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
