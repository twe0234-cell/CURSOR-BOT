"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import type { TorahQaBatchSummary } from "@/src/lib/types/torah";
import {
  appendTorahSysEvent,
  engineCreateQaBatch,
  engineReturnQaBatch,
  engineSetSheetQaOutcome,
  engineCreateFixTask,
  engineCompleteFixTask,
  type QaKind,
} from "@/src/services/torah.service";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type QaBatchRow = TorahQaBatchSummary & {
  sheet_numbers: number[];
  checker_name?: string | null;
};

export type QaBatchSheetRow = {
  id: string;
  sheet_number: number;
  status: string;
};

export type TorahFixTaskRow = {
  id: string;
  project_id: string;
  sheet_id: string;
  sheet_number: number | null;
  qa_batch_id: string | null;
  status: string;
  description: string | null;
  cost_amount: number;
  completed_at: string | null;
  created_at: string;
};

type ActionResult = { success: true } | { success: false; error: string };

const optionalMoney = z
  .union([z.string(), z.number(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  });

// ─────────────────────────────────────────────────────────────
// createQaBatch
// ─────────────────────────────────────────────────────────────

const createQaBatchSchema = z.object({
  projectId: z.string().uuid(),
  sheetIds: z.array(z.string().uuid()).min(1, "בחר לפחות יריעה אחת"),
  magiahId: z.union([z.string().uuid(), z.literal("")]).optional().nullable(),
  checkerId: z.union([z.string().uuid(), z.literal("")]).optional().nullable(),
  qaKind: z.enum(["gavra", "computer", "repair", "other"]).optional().nullable(),
  costAmount: z.coerce.number().nonnegative().optional(),
  reportUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  notes: z.string().max(500).nullable().optional(),
}).refine(
  (d) =>
    Boolean((d.magiahId && d.magiahId.length > 0) ||
      (d.checkerId && d.checkerId.length > 0) ||
      d.qaKind === "computer"),
  { message: "יש לבחור מגיה או בודק, או לסמן סוג «מחשב»" }
);

export type CreateQaBatchInput = z.infer<typeof createQaBatchSchema>;

export async function createQaBatch(
  input: CreateQaBatchInput
): Promise<{ success: true; batchId: string } | { success: false; error: string }> {
  const parsed = createQaBatchSchema.safeParse(input);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { success: false, error: (first as string) ?? parsed.error.issues[0]?.message ?? "שגיאת ולידציה" };
  }

  try {
    const d = parsed.data;
    const magiah =
      d.magiahId && String(d.magiahId).trim().length > 0 ? String(d.magiahId) : null;
    const checker =
      d.checkerId && String(d.checkerId).trim().length > 0 ? String(d.checkerId) : null;

    const res = await engineCreateQaBatch({
      projectId: d.projectId,
      sheetIds: d.sheetIds,
      magiahId: magiah,
      checkerId: checker,
      qaKind: (d.qaKind ?? null) as QaKind | null,
      notes: d.notes ?? null,
      costAmount: d.costAmount ?? 0,
      reportUrl: d.reportUrl && String(d.reportUrl).trim() ? String(d.reportUrl).trim() : null,
    });
    if (!res.success) return { success: false, error: res.error };
    const batchId = res.data?.batchId;
    if (!batchId) return { success: false, error: "מזהה סבב חסר" };

    revalidatePath(`/torah/${d.projectId}`);
    revalidatePath("/torah");
    return { success: true, batchId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

// ─────────────────────────────────────────────────────────────
// returnQaBatch
// ─────────────────────────────────────────────────────────────

export async function returnQaBatch(
  batchId: string,
  projectId: string
): Promise<ActionResult> {
  if (!batchId || !projectId) return { success: false, error: "מזהים חסרים" };

  try {
    const res = await engineReturnQaBatch({ batchId, projectId });
    if (!res.success) return { success: false, error: res.error };

    revalidatePath(`/torah/${projectId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

const updateQaBatchSchema = z.object({
  batchId: z.string().uuid(),
  projectId: z.string().uuid(),
  magiahId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  checkerId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  qaKind: z.enum(["gavra", "computer", "repair", "other"]).nullable().optional(),
  costAmount: optionalMoney.optional(),
  notes: z.union([z.string(), z.literal(""), z.null()]).optional(),
  reportUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

export async function updateQaBatchMetadata(
  input: z.infer<typeof updateQaBatchSchema>
): Promise<ActionResult> {
  const parsed = updateQaBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const v = parsed.data;
    const { data: batch, error: bErr } = await supabase
      .from("torah_qa_batches")
      .select("id, status")
      .eq("id", v.batchId)
      .eq("project_id", v.projectId)
      .maybeSingle();
    if (bErr || !batch) return { success: false, error: "השקית לא נמצאה" };
    if (batch.status !== "sent") {
      return { success: false, error: "ניתן לערוך שקית רק לפני סגירה" };
    }

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", v.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "אין הרשאה" };

    const patch: Record<string, unknown> = {};
    if (v.magiahId !== undefined) patch.magiah_id = v.magiahId || null;
    if (v.checkerId !== undefined) patch.checker_id = v.checkerId || null;
    if (v.qaKind !== undefined) patch.qa_kind = v.qaKind ?? null;
    if (v.costAmount !== undefined) patch.cost_amount = v.costAmount ?? 0;
    if (v.notes !== undefined) patch.notes = v.notes?.trim() || null;
    if (v.reportUrl !== undefined) patch.report_url = v.reportUrl?.trim() || null;
    if (Object.keys(patch).length === 0) return { success: false, error: "אין שדות לעדכון" };

    const { error } = await supabase
      .from("torah_qa_batches")
      .update(patch)
      .eq("id", v.batchId)
      .eq("project_id", v.projectId);
    if (error) return { success: false, error: error.message };

    const ev = await appendTorahSysEvent({
      projectId: v.projectId,
      entityType: "torah_qa_batch",
      entityId: v.batchId,
      action: "qa_batch_metadata_updated",
      metadata: { fields: Object.keys(patch) },
    });
    if (!ev.success) return { success: false, error: ev.error };

    revalidatePath(`/torah/${v.projectId}`);
    revalidatePath("/torah");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

const voidQaBatchSchema = z.object({
  batchId: z.string().uuid(),
  projectId: z.string().uuid(),
  reason: z.string().trim().min(3, "נדרש נימוק לביטול"),
  emergencyOverride: z.boolean().optional(),
});

export async function voidQaBatch(input: z.infer<typeof voidQaBatchSchema>): Promise<ActionResult> {
  const parsed = voidQaBatchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };
    const v = parsed.data;

    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", v.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "אין הרשאה" };

    const { data: batch, error: batchErr } = await supabase
      .from("torah_qa_batches")
      .select("id, status, notes")
      .eq("id", v.batchId)
      .eq("project_id", v.projectId)
      .maybeSingle();
    if (batchErr || !batch) return { success: false, error: "השקית לא נמצאה" };
    if (batch.status !== "sent") return { success: false, error: "ניתן לבטל רק שקית פתוחה" };

    const { data: links, error: linksErr } = await supabase
      .from("torah_batch_sheets")
      .select("sheet_id")
      .eq("batch_id", v.batchId);
    if (linksErr) return { success: false, error: linksErr.message };
    const sheetIds = (links ?? []).map((x) => x.sheet_id as string).filter(Boolean);
    if (sheetIds.length === 0) return { success: false, error: "אין יריעות בשקית" };

    const { data: sheets } = await supabase
      .from("torah_sheets")
      .select("id, status")
      .eq("project_id", v.projectId)
      .in("id", sheetIds);
    const unsafe = (sheets ?? []).some((s) => String(s.status) !== "in_qa");
    if (unsafe && !v.emergencyOverride) {
      return { success: false, error: "נדרש Emergency Override: יש יריעות שלא במצב בהגהה" };
    }

    const { error: unassignErr } = await supabase
      .from("torah_sheets")
      .update({ status: "reported_written" })
      .eq("project_id", v.projectId)
      .in("id", sheetIds);
    if (unassignErr) return { success: false, error: unassignErr.message };

    const nextNotes = `[VOID] ${new Date().toISOString()} · ${v.reason}\n${batch.notes ?? ""}`.trim();
    const { error: bUpErr } = await supabase
      .from("torah_qa_batches")
      .update({ notes: nextNotes, returned_date: new Date().toISOString() })
      .eq("id", v.batchId)
      .eq("project_id", v.projectId);
    if (bUpErr) return { success: false, error: bUpErr.message };

    const ev = await appendTorahSysEvent({
      projectId: v.projectId,
      entityType: "torah_qa_batch",
      entityId: v.batchId,
      action: v.emergencyOverride ? "qa_batch_voided_override" : "qa_batch_voided",
      fromState: "sent",
      toState: "voided",
      metadata: { reason: v.reason, emergency_override: Boolean(v.emergencyOverride), sheet_count: sheetIds.length },
    });
    if (!ev.success) return { success: false, error: ev.error };

    revalidatePath(`/torah/${v.projectId}`);
    revalidatePath("/torah");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ─────────────────────────────────────────────────────────────
// QA sheet resolution (אחרי שהסבב חזר — יריעות עדיין in_qa עד לפתרון)
// ─────────────────────────────────────────────────────────────

const resolveSchema = z.object({
  projectId: z.string().uuid(),
  sheetId: z.string().uuid(),
  outcome: z.enum(["approved", "needs_fixing"]),
});

/**
 * פתרון מהיר לכל יריעות השקית בזמן שהשקית עדיין «נשלחה» (למשל החלטה מרחוק).
 * כל יריעה ב־in_qa מקבלת approved / needs_fixing; נרשם sys_events לרמת השקית.
 */
export async function bulkResolveOpenQaBatchSheets(
  projectId: string,
  batchId: string,
  outcome: "approved" | "needs_fixing"
): Promise<ActionResult> {
  if (!projectId || !batchId) return { success: false, error: "מזהים חסרים" };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: batch, error: bErr } = await supabase
      .from("torah_qa_batches")
      .select("id, status, project_id")
      .eq("id", batchId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (bErr || !batch) return { success: false, error: "השקית לא נמצאה" };
    if (batch.status !== "sent") {
      return { success: false, error: 'רק שקית במצב «נשלח» ניתנת לפתרון מהיר מהכרטיס הזה' };
    }

    const { data: links, error: lErr } = await supabase
      .from("torah_batch_sheets")
      .select("sheet_id")
      .eq("batch_id", batchId);

    if (lErr) return { success: false, error: lErr.message };
    const sheetIds = [...new Set((links ?? []).map((r) => r.sheet_id as string).filter(Boolean))];
    if (sheetIds.length === 0) return { success: false, error: "אין יריעות מקושרות לשקית" };

    const { data: sheetRows, error: sErr } = await supabase
      .from("torah_sheets")
      .select("id, status")
      .eq("project_id", projectId)
      .in("id", sheetIds);

    if (sErr) return { success: false, error: sErr.message };
    const inQaIds = (sheetRows ?? [])
      .filter((s) => String(s.status) === "in_qa")
      .map((s) => s.id as string);
    if (inQaIds.length === 0) {
      return { success: false, error: "אין יריעות בסטטוס «בהגהה» לשקית זו" };
    }

    for (const sid of inQaIds) {
      const r = await engineSetSheetQaOutcome({ projectId, sheetId: sid, outcome });
      if (!r.success) return { success: false, error: r.error };
    }

    const ev = await appendTorahSysEvent({
      projectId,
      entityType: "torah_qa_batch",
      entityId: batchId,
      action: "qa_batch_bulk_resolved_while_sent",
      fromState: "sent",
      toState: outcome,
      metadata: { sheet_count: inQaIds.length },
    });
    if (!ev.success) {
      return { success: false, error: ev.error };
    }

    revalidatePath(`/torah/${projectId}`);
    revalidatePath("/torah");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function resolveTorahSheetQa(
  projectId: string,
  sheetId: string,
  outcome: "approved" | "needs_fixing"
): Promise<ActionResult> {
  const parsed = resolveSchema.safeParse({ projectId, sheetId, outcome });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }
  try {
    const res = await engineSetSheetQaOutcome({
      projectId: parsed.data.projectId,
      sheetId: parsed.data.sheetId,
      outcome: parsed.data.outcome,
    });
    if (!res.success) return { success: false, error: res.error };
    revalidatePath(`/torah/${projectId}`);
    revalidatePath("/torah");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ─────────────────────────────────────────────────────────────
// Fix tasks
// ─────────────────────────────────────────────────────────────

const createFixSchema = z.object({
  projectId: z.string().uuid(),
  sheetId: z.string().uuid(),
  qaBatchId: z.string().uuid().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  costAmount: z.coerce.number().nonnegative().optional(),
});

export async function createTorahFixTaskAction(
  input: z.infer<typeof createFixSchema>
): Promise<{ success: true; fixTaskId: string } | { success: false; error: string }> {
  const parsed = createFixSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }
  try {
    const res = await engineCreateFixTask({
      projectId: parsed.data.projectId,
      sheetId: parsed.data.sheetId,
      qaBatchId: parsed.data.qaBatchId ?? null,
      description: parsed.data.description ?? null,
      costAmount: parsed.data.costAmount ?? 0,
    });
    if (!res.success) return { success: false, error: res.error };
    const id = res.data?.fixTaskId;
    if (!id) return { success: false, error: "חסר מזהה משימה" };
    revalidatePath(`/torah/${parsed.data.projectId}`);
    return { success: true, fixTaskId: id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

const completeFixSchema = z.object({
  projectId: z.string().uuid(),
  fixTaskId: z.string().uuid(),
  actualCost: z.coerce.number().nonnegative().optional().nullable(),
  nextSheetStatus: z.enum(["in_qa", "approved", "reported_written"]),
});

export async function completeTorahFixTaskAction(
  input: z.infer<typeof completeFixSchema>
): Promise<ActionResult> {
  const parsed = completeFixSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }
  try {
    const res = await engineCompleteFixTask({
      projectId: parsed.data.projectId,
      fixTaskId: parsed.data.fixTaskId,
      actualCost: parsed.data.actualCost ?? null,
      nextSheetStatus: parsed.data.nextSheetStatus,
    });
    if (!res.success) return { success: false, error: res.error };
    revalidatePath(`/torah/${parsed.data.projectId}`);
    revalidatePath("/torah");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function fetchTorahFixTasks(
  projectId: string
): Promise<{ success: true; tasks: TorahFixTaskRow[] } | { success: false; error: string }> {
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

    const { data: tasks, error } = await supabase
      .from("torah_fix_tasks")
      .select("id, project_id, sheet_id, qa_batch_id, status, description, cost_amount, completed_at, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const sheetIds = [...new Set((tasks ?? []).map((t) => t.sheet_id as string))];
    const { data: sheets } =
      sheetIds.length > 0
        ? await supabase.from("torah_sheets").select("id, sheet_number").in("id", sheetIds)
        : { data: [] };

    const numMap = new Map((sheets ?? []).map((s) => [s.id as string, Number(s.sheet_number)]));

    const rows: TorahFixTaskRow[] = (tasks ?? []).map((t) => ({
      id: t.id as string,
      project_id: t.project_id as string,
      sheet_id: t.sheet_id as string,
      sheet_number: numMap.get(t.sheet_id as string) ?? null,
      qa_batch_id: (t.qa_batch_id as string | null) ?? null,
      status: String(t.status),
      description: (t.description as string | null) ?? null,
      cost_amount: Number((t as { cost_amount?: unknown }).cost_amount ?? 0),
      completed_at: (t.completed_at as string | null) ?? null,
      created_at: (t.created_at as string) ?? "",
    }));

    return { success: true, tasks: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ─────────────────────────────────────────────────────────────
// Sheets linked to a QA batch (לפתרון סטטוס אחרי החזרה)
// ─────────────────────────────────────────────────────────────

export async function fetchQaBatchSheetRows(
  projectId: string,
  batchId: string
): Promise<{ success: true; sheets: QaBatchSheetRow[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: junc, error: jErr } = await supabase
      .from("torah_batch_sheets")
      .select("sheet_id")
      .eq("batch_id", batchId);

    if (jErr) return { success: false, error: jErr.message };

    const ids = (junc ?? []).map((j) => j.sheet_id as string);
    if (ids.length === 0) return { success: true, sheets: [] };

    const { data: sheetRows, error: sErr } = await supabase
      .from("torah_sheets")
      .select("id, sheet_number, status")
      .eq("project_id", projectId)
      .in("id", ids)
      .order("sheet_number", { ascending: true });

    if (sErr) return { success: false, error: sErr.message };

    const sheets: QaBatchSheetRow[] = (sheetRows ?? []).map((s) => ({
      id: s.id as string,
      sheet_number: Number(s.sheet_number),
      status: String(s.status),
    }));

    return { success: true, sheets };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ─────────────────────────────────────────────────────────────
// fetchQaBatches
// ─────────────────────────────────────────────────────────────

export async function fetchQaBatches(
  projectId: string
): Promise<{ success: true; batches: QaBatchRow[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: batches, error: bErr } = await supabase
      .from("torah_qa_batches")
      .select("*")
      .eq("project_id", projectId)
      .order("sent_date", { ascending: false });

    if (bErr) return { success: false, error: bErr.message };
    if (!batches || batches.length === 0) return { success: true, batches: [] };

    const magiahIds = [
      ...new Set(
        batches.map((b) => b.magiah_id as string | null).filter((id): id is string => Boolean(id))
      ),
    ];
    const checkerIds = [
      ...new Set(
        batches
          .map((b) => (b as { checker_id?: string | null }).checker_id as string | null)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const contactIds = [...new Set([...magiahIds, ...checkerIds])];

    const { data: contacts } =
      contactIds.length > 0
        ? await supabase.from("crm_contacts").select("id, name").in("id", contactIds)
        : { data: [] };

    const nameMap = new Map((contacts ?? []).map((c) => [c.id as string, c.name as string]));

    const batchIds = batches.map((b) => b.id as string);
    const { data: junctions } = await supabase
      .from("torah_batch_sheets")
      .select("batch_id, sheet_id")
      .in("batch_id", batchIds);

    const sheetIds = [...new Set((junctions ?? []).map((j) => j.sheet_id as string))];
    const { data: sheetRows } = sheetIds.length > 0
      ? await supabase
          .from("torah_sheets")
          .select("id, sheet_number")
          .in("id", sheetIds)
      : { data: [] };

    const sheetNumberMap = new Map((sheetRows ?? []).map((s) => [s.id as string, s.sheet_number as number]));

    const batchSheetNumbers = new Map<string, number[]>();
    for (const j of junctions ?? []) {
      const bId = j.batch_id as string;
      const num = sheetNumberMap.get(j.sheet_id as string);
      if (num == null) continue;
      if (!batchSheetNumbers.has(bId)) batchSheetNumbers.set(bId, []);
      batchSheetNumbers.get(bId)!.push(num);
    }
    for (const arr of batchSheetNumbers.values()) arr.sort((a, b) => a - b);

    const result: QaBatchRow[] = batches.map((b) => {
      const checkerId = ((b as { checker_id?: string | null }).checker_id as string | null) ?? null;
      return {
        id: b.id as string,
        project_id: b.project_id as string,
        magiah_id: (b.magiah_id as string | null) ?? null,
        checker_id: checkerId,
        qa_kind: (b.qa_kind as "gavra" | "computer" | "repair" | "other" | null) ?? null,
        cost_amount: Number((b as { cost_amount?: unknown }).cost_amount ?? 0) || 0,
        report_url: ((b as { report_url?: string | null }).report_url as string | null) ?? null,
        vendor_label: ((b as { vendor_label?: string | null }).vendor_label as string | null) ?? null,
        status: (b.status as "sent" | "returned"),
        sent_date: b.sent_date as string,
        returned_date: (b.returned_date as string | null) ?? null,
        notes: (b.notes as string | null) ?? null,
        created_at: b.created_at as string,
        magiah_name: b.magiah_id ? nameMap.get(b.magiah_id as string) ?? null : null,
        checker_name: checkerId ? nameMap.get(checkerId) ?? null : null,
        sheet_count: (batchSheetNumbers.get(b.id as string) ?? []).length,
        sheet_numbers: batchSheetNumbers.get(b.id as string) ?? [],
      };
    });

    return { success: true, batches: result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
