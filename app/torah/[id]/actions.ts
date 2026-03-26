"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import type {
  TorahProjectDetailView,
  TorahSheetGridRow,
  TorahSheetStatus,
} from "@/src/lib/types/torah";

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
