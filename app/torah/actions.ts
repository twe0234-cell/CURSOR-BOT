"use server";

import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  TorahProjectWithNames,
  TorahSheetStatus,
} from "@/src/lib/types/torah";
import { columnsCountForTorahSheetNumber } from "@/src/lib/types/torah";
import { runTorahCalendarSync } from "@/src/lib/google/calendar";

// ── Validation schema ─────────────────────────────────────────

const createTorahProjectSchema = z.object({
  title: z.string().min(1, "שם הפרויקט חובה").max(200),
  scribe_id: z.string().uuid("יש לבחור סופר תקין"),
  client_id: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (!v ? null : v)),
  target_date: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v && v !== "" ? v : null)),
  total_agreed_price: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : v),
    z.coerce.number().nonnegative()
  ),
  columns_per_day: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : v),
    z.coerce.number().nonnegative()
  ),
  qa_weeks_buffer: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 3 : v),
    z.coerce.number().int().nonnegative()
  ),
  gavra_qa_count: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 1 : v),
    z.coerce.number().int().nonnegative()
  ),
  computer_qa_count: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 1 : v),
    z.coerce.number().int().nonnegative()
  ),
  requires_tagging: z.boolean().optional().default(false),
});

type CreateTorahProjectInput = z.input<typeof createTorahProjectSchema>;

type CreateResult =
  | { success: true; projectId: string }
  | { success: false; error: string };

// ── createTorahProject ────────────────────────────────────────

/**
 * 1. Validates input with Zod.
 * 2. Inserts the project row.
 * 3. Batch-inserts all 62 sheet rows with padded SKUs.
 */
export async function createTorahProject(
  input: CreateTorahProjectInput
): Promise<CreateResult> {
  try {
    const parsed = createTorahProjectSchema.safeParse(input);
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

    // Verify scribe belongs to this user
    const { data: scribeOk } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("id", v.scribe_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!scribeOk) return { success: false, error: "הסופר שנבחר לא נמצא" };

    // Verify client if provided
    if (v.client_id) {
      const { data: clientOk } = await supabase
        .from("crm_contacts")
        .select("id")
        .eq("id", v.client_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!clientOk) return { success: false, error: "הלקוח שנבחר לא נמצא" };
    }

    // Insert project
    const { data: project, error: projErr } = await supabase
      .from("torah_projects")
      .insert({
        user_id: user.id,
        scribe_id: v.scribe_id,
        client_id: v.client_id ?? null,
        title: v.title.trim(),
        status: "writing",
        start_date: new Date().toISOString().slice(0, 10),
        target_date: v.target_date ?? null,
        total_agreed_price: v.total_agreed_price ?? 0,
        columns_per_day: v.columns_per_day ?? 0,
        qa_weeks_buffer: Math.max(0, Math.floor(v.qa_weeks_buffer ?? 3)),
        gavra_qa_count: Math.max(0, Math.floor(v.gavra_qa_count ?? 1)),
        computer_qa_count: Math.max(0, Math.floor(v.computer_qa_count ?? 1)),
        requires_tagging: v.requires_tagging ?? false,
      })
      .select("id")
      .single();

    if (projErr || !project) {
      return { success: false, error: projErr?.message ?? "שגיאה ביצירת הפרויקט" };
    }

    const projectId = project.id;
    const prefix = projectId.replace(/-/g, "").slice(0, 6);

    // Batch-insert 62 sheets
    const sheetsPayload = Array.from({ length: 62 }, (_, i) => {
      const num = i + 1;
      return {
        project_id: projectId,
        sheet_number: num,
        columns_count: columnsCountForTorahSheetNumber(num),
        sku: `${prefix}-S${String(num).padStart(2, "0")}`,
        status: "not_started" as TorahSheetStatus,
      };
    });

    const { error: sheetsErr } = await supabase
      .from("torah_sheets")
      .insert(sheetsPayload);

    if (sheetsErr) {
      // Project was created; log but still return success so user can retry sheets
      console.error("[createTorahProject] sheets insert error:", sheetsErr.message);
      return { success: false, error: `פרויקט נוצר אך יריעות נכשלו: ${sheetsErr.message}` };
    }

    revalidatePath("/torah");
    revalidatePath(`/torah/${projectId}`);

    void runTorahCalendarSync(supabase, user.id, {
      projectId,
      title: v.title.trim(),
      targetDate: v.target_date ?? null,
      qaWeeksBuffer: Math.max(0, Math.floor(v.qa_weeks_buffer ?? 3)),
    });

    return { success: true, projectId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

// ── fetchTorahProjects ────────────────────────────────────────

/**
 * Returns all Torah projects for the current user, enriched with:
 * - scribe_name, client_name from crm_contacts
 * - sheets_created (always 62 once generated)
 * - sheets_approved (status IN 'approved' | 'sewn')
 */
export async function fetchTorahProjects(): Promise<
  { success: true; projects: TorahProjectWithNames[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    // Fetch projects
    const { data: rows, error: projErr } = await supabase
      .from("torah_projects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (projErr) return { success: false, error: projErr.message };
    if (!rows || rows.length === 0) return { success: true, projects: [] };

    const projectIds = rows.map((r) => r.id as string);

    // Fetch sheet statuses for all projects
    const { data: sheets } = await supabase
      .from("torah_sheets")
      .select("project_id, status")
      .in("project_id", projectIds);

    const sheetStats = new Map<string, { created: number; approved: number }>();
    for (const s of sheets ?? []) {
      const pid = s.project_id as string;
      const cur = sheetStats.get(pid) ?? { created: 0, approved: 0 };
      cur.created += 1;
      if (s.status === "approved" || s.status === "sewn") cur.approved += 1;
      sheetStats.set(pid, cur);
    }

    // Fetch contact names in one round-trip
    const contactIdSet = new Set<string>();
    for (const r of rows) {
      if (r.scribe_id) contactIdSet.add(r.scribe_id as string);
      if (r.client_id) contactIdSet.add(r.client_id as string);
    }
    const contactIds = [...contactIdSet];
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

    const projects: TorahProjectWithNames[] = rows.map((r) => {
      const stats = sheetStats.get(r.id as string) ?? { created: 0, approved: 0 };
      return {
        id: r.id as string,
        user_id: r.user_id as string,
        client_id: (r.client_id as string | null) ?? null,
        scribe_id: r.scribe_id as string,
        title: r.title as string,
        status: r.status as TorahProjectWithNames["status"],
        start_date: (r.start_date as string | null) ?? null,
        target_date: (r.target_date as string | null) ?? null,
        total_agreed_price: Number(r.total_agreed_price ?? 0),
        amount_paid_by_client: Number(r.amount_paid_by_client ?? 0),
        amount_paid_to_scribe: Number(r.amount_paid_to_scribe ?? 0),
        columns_per_day: Number(r.columns_per_day ?? 0),
        qa_weeks_buffer: Number(r.qa_weeks_buffer ?? 3),
        gavra_qa_count: Number(r.gavra_qa_count ?? 1),
        computer_qa_count: Number(r.computer_qa_count ?? 1),
        requires_tagging: Boolean(r.requires_tagging),
        created_at: r.created_at as string,
        scribe_name: nameMap.get(r.scribe_id as string) ?? null,
        client_name: r.client_id ? (nameMap.get(r.client_id as string) ?? null) : null,
        sheets_created: stats.created,
        sheets_approved: stats.approved,
      };
    });

    return { success: true, projects };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

// ── fetchCrmContactsForSelect ─────────────────────────────────

/** All CRM contacts for the current user — used for Client picker */
export async function fetchCrmContactsForSelect(): Promise<
  { success: true; contacts: { id: string; name: string }[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name");

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      contacts: (data ?? []).map((c) => ({ id: c.id as string, name: (c.name as string) ?? "" })),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
