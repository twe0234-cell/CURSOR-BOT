"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import type { TorahQaBatchSummary } from "@/src/lib/types/torah";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type QaBatchRow = TorahQaBatchSummary & {
  sheet_numbers: number[];
};

type ActionResult = { success: true } | { success: false; error: string };

// ─────────────────────────────────────────────────────────────
// createQaBatch
// ─────────────────────────────────────────────────────────────

const createQaBatchSchema = z.object({
  projectId: z.string().uuid(),
  magiahId: z.string().uuid("יש לבחור מגיה"),
  sheetIds: z.array(z.string().uuid()).min(1, "בחר לפחות יריעה אחת"),
  notes: z.string().max(500).nullable().optional(),
});

export async function createQaBatch(
  projectId: string,
  magiahId: string,
  sheetIds: string[],
  notes?: string | null
): Promise<{ success: true; batchId: string } | { success: false; error: string }> {
  const parsed = createQaBatchSchema.safeParse({ projectId, magiahId, sheetIds, notes });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { success: false, error: (first as string) ?? "שגיאת ולידציה" };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    // Verify project ownership
    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", parsed.data.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    // 1. Insert batch
    const { data: batch, error: bErr } = await supabase
      .from("torah_qa_batches")
      .insert({
        project_id: parsed.data.projectId,
        magiah_id: parsed.data.magiahId,
        status: "sent",
        sent_date: new Date().toISOString(),
        notes: parsed.data.notes ?? null,
      })
      .select("id")
      .single();

    if (bErr || !batch) return { success: false, error: bErr?.message ?? "שגיאה ביצירת שקית" };

    // 2. Insert junction rows
    const junctionRows = parsed.data.sheetIds.map((sheetId) => ({
      batch_id: batch.id,
      sheet_id: sheetId,
    }));

    const { error: jErr } = await supabase
      .from("torah_batch_sheets")
      .insert(junctionRows);

    if (jErr) {
      // rollback batch
      await supabase.from("torah_qa_batches").delete().eq("id", batch.id);
      return { success: false, error: jErr.message };
    }

    // 3. Update sheet statuses to in_qa
    const { error: sErr } = await supabase
      .from("torah_sheets")
      .update({ status: "in_qa" })
      .in("id", parsed.data.sheetIds)
      .eq("project_id", parsed.data.projectId);

    if (sErr) return { success: false, error: sErr.message };

    revalidatePath(`/torah/${parsed.data.projectId}`);
    revalidatePath("/torah");
    return { success: true, batchId: batch.id };
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    // Verify ownership through project
    const { data: proj } = await supabase
      .from("torah_projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!proj) return { success: false, error: "הפרויקט לא נמצא" };

    const { error } = await supabase
      .from("torah_qa_batches")
      .update({
        status: "returned",
        returned_date: new Date().toISOString(),
      })
      .eq("id", batchId)
      .eq("project_id", projectId);

    if (error) return { success: false, error: error.message };

    revalidatePath(`/torah/${projectId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
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

    // Fetch batches
    const { data: batches, error: bErr } = await supabase
      .from("torah_qa_batches")
      .select("id, project_id, magiah_id, status, sent_date, returned_date, notes, created_at")
      .eq("project_id", projectId)
      .order("sent_date", { ascending: false });

    if (bErr) return { success: false, error: bErr.message };
    if (!batches || batches.length === 0) return { success: true, batches: [] };

    // Get magiah names
    const magiahIds = [...new Set(batches.map((b) => b.magiah_id as string))];
    const { data: contacts } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .in("id", magiahIds);
    const nameMap = new Map((contacts ?? []).map((c) => [c.id as string, c.name as string]));

    // Get sheet numbers per batch
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

    // Group sheet numbers by batch
    const batchSheetNumbers = new Map<string, number[]>();
    for (const j of junctions ?? []) {
      const bId = j.batch_id as string;
      const num = sheetNumberMap.get(j.sheet_id as string);
      if (num == null) continue;
      if (!batchSheetNumbers.has(bId)) batchSheetNumbers.set(bId, []);
      batchSheetNumbers.get(bId)!.push(num);
    }
    // Sort sheet numbers within each batch
    for (const arr of batchSheetNumbers.values()) arr.sort((a, b) => a - b);

    const result: QaBatchRow[] = batches.map((b) => ({
      id: b.id as string,
      project_id: b.project_id as string,
      magiah_id: b.magiah_id as string,
      status: (b.status as "sent" | "returned"),
      sent_date: b.sent_date as string,
      returned_date: (b.returned_date as string | null) ?? null,
      notes: (b.notes as string | null) ?? null,
      created_at: b.created_at as string,
      magiah_name: nameMap.get(b.magiah_id as string) ?? null,
      sheet_count: (batchSheetNumbers.get(b.id as string) ?? []).length,
      sheet_numbers: batchSheetNumbers.get(b.id as string) ?? [],
    }));

    return { success: true, batches: result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
