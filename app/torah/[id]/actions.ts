"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import type {
  TorahProjectDetailView,
  TorahSheetGridRow,
  TorahSheetStatus,
} from "@/src/lib/types/torah";
import { computeTorahScribePace, type TorahScribePaceResult } from "@/src/services/crm.logic";
import { runTorahCalendarSync } from "@/src/lib/google/calendar";

const SHEET_STATUS_TUPLE = [
  "not_started",
  "written",
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

    const updatePayload: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status;
    if (parsed.data.columns_count !== undefined)
      updatePayload.columns_count = parsed.data.columns_count;

    const { error } = await supabase
      .from("torah_sheets")
      .update(updatePayload)
      .eq("id", sheetId)
      .eq("project_id", projectId);

    if (error) return { success: false, error: error.message };

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

    const { error: upErr } = await supabase
      .from("torah_sheets")
      .update({ status: "written" })
      .in("id", parsed.data.sheetIds)
      .eq("project_id", projectId);

    if (upErr) return { success: false, error: upErr.message };

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

    const { data, error } = await supabase
      .from("torah_sheets")
      .update({ status: parsed.data.status })
      .in("id", parsed.data.sheetIds)
      .eq("project_id", projectId)
      .select("id");

    if (error) return { success: false, error: error.message };

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);
    return { success: true, updated: (data ?? []).length };
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

const updateProjectPaymentsSchema = z.object({
  clientPaid: z.coerce.number().nonnegative(),
  scribePaid: z.coerce.number().nonnegative(),
});

export async function updateProjectPayments(
  projectId: string,
  body: { clientPaid: number; scribePaid: number }
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = updateProjectPaymentsSchema.safeParse(body);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { success: false, error: (first as string) ?? "שגיאת ולידציה" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("torah_projects")
      .update({
        amount_paid_by_client: parsed.data.clientPaid,
        amount_paid_to_scribe: parsed.data.scribePaid,
      })
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);
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
