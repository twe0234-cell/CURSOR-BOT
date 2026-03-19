"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { success: true } | { success: false; error: string };

export type MilestoneItem = { id: string; label: string; done: boolean };

export type InvestmentRecord = {
  id: string;
  scribe_id: string | null;
  item_details: string | null;
  quantity: number;
  cost_per_unit: number | null;
  total_agreed_price: number;
  amount_paid: number;
  deductions: number;
  remaining_balance: number;
  target_date: string | null;
  status: string;
  notes: string | null;
  milestones: MilestoneItem[];
  documents: string[];
  public_slug: string | null;
  created_at: string;
  scribe_name?: string;
};

export async function fetchInvestments(): Promise<
  { success: true; investments: InvestmentRecord[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("erp_investments")
      .select("id, scribe_id, item_details, quantity, cost_per_unit, total_agreed_price, amount_paid, deductions, target_date, status, notes, milestones, documents, public_slug, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const scribeIds = [...new Set((data ?? []).map((r) => r.scribe_id).filter(Boolean))];
    const { data: scribeData } = scribeIds.length > 0
      ? await supabase.from("crm_contacts").select("id, name").in("id", scribeIds)
      : { data: [] };
    const scribeMap = new Map((scribeData ?? []).map((s) => [s.id, s.name]));

    const investments = (data ?? []).map((r) => {
      const total = Number(r.total_agreed_price ?? 0);
      const paid = Number(r.amount_paid ?? 0);
      const ded = Number(r.deductions ?? 0);
      const qty = Number(r.quantity ?? 1);
      const cpu = r.cost_per_unit != null ? Number(r.cost_per_unit) : null;
      const milestones = (Array.isArray(r.milestones) ? r.milestones : []) as MilestoneItem[];
      const documents = (Array.isArray(r.documents) ? r.documents : []) as string[];
      return {
        id: r.id,
        scribe_id: r.scribe_id ?? null,
        item_details: r.item_details ?? null,
        quantity: qty,
        cost_per_unit: cpu,
        total_agreed_price: total,
        amount_paid: paid,
        deductions: ded,
        remaining_balance: Math.max(0, total - paid - ded),
        target_date: r.target_date ?? null,
        status: r.status ?? "active",
        notes: r.notes ?? null,
        milestones,
        documents,
        public_slug: r.public_slug ?? null,
        created_at: r.created_at ?? "",
        scribe_name: r.scribe_id ? scribeMap.get(r.scribe_id) ?? undefined : undefined,
      };
    });

    return { success: true, investments };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function createInvestment(
  scribeId: string | null,
  itemDetails: string,
  targetDate?: string,
  notes?: string,
  quantity?: number,
  costPerUnit?: number
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const qty = quantity != null && quantity > 0 ? quantity : 1;
    const cpu = costPerUnit != null && costPerUnit >= 0 ? costPerUnit : 0;
    const totalAgreedPrice = qty * cpu;
    if (totalAgreedPrice <= 0) return { success: false, error: "הזן כמות ועלות ליחידה" };

    const { error } = await supabase.from("erp_investments").insert({
      user_id: user.id,
      scribe_id: scribeId || null,
      item_details: itemDetails.trim() || null,
      quantity: qty,
      cost_per_unit: cpu,
      total_agreed_price: totalAgreedPrice,
      amount_paid: 0,
      target_date: targetDate || null,
      notes: notes?.trim() || null,
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/investments");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function bulkImportInvestments(
  rows: Record<string, unknown>[]
): Promise<{ success: true; imported: number; errors: string[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: scribes } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("type", "Scribe");
    const scribeByName = new Map((scribes ?? []).map((s) => [s.name?.trim().toLowerCase() ?? "", s.id]));

    const errors: string[] = [];
    let imported = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const scribeName = String(r["scribe"] ?? r["סופר"] ?? r["scribe_name"] ?? "").trim();
      const scribeId = scribeName ? scribeByName.get(scribeName.toLowerCase()) ?? null : null;
      const itemDetails = String(r["item_details"] ?? r["פרטי פריט"] ?? r["details"] ?? "").trim();
      const qty = Number(r["quantity"] ?? r["כמות"] ?? 1) || 1;
      const cpu = Number(r["cost_per_unit"] ?? r["עלות ליחידה"] ?? r["cost"] ?? 0) || 0;
      const total = qty * cpu;
      const targetDate = String(r["target_date"] ?? r["תאריך יעד"] ?? r["date"] ?? "").trim() || null;
      const notes = String(r["notes"] ?? r["הערות"] ?? "").trim() || null;

      if (total <= 0) {
        errors.push(`שורה ${i + 1}: כמות × עלות ליחידה חייב להיות חיובי`);
        continue;
      }

      const { error } = await supabase.from("erp_investments").insert({
        user_id: user.id,
        scribe_id: scribeId,
        item_details: itemDetails || null,
        quantity: qty,
        cost_per_unit: cpu,
        total_agreed_price: total,
        amount_paid: 0,
        target_date: targetDate,
        notes,
      });
      if (error) {
        errors.push(`שורה ${i + 1}: ${error.message}`);
      } else {
        imported++;
      }
    }
    revalidatePath("/investments");
    revalidatePath("/");
    return { success: true, imported, errors };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function updateInvestment(
  investmentId: string,
  data: Partial<{ deductions: number; documents: string[]; milestones: MilestoneItem[] }>
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.deductions !== undefined) payload.deductions = data.deductions;
    if (data.documents !== undefined) payload.documents = data.documents;
    if (data.milestones !== undefined) payload.milestones = data.milestones;

    const { error } = await supabase
      .from("erp_investments")
      .update(payload)
      .eq("id", investmentId)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/investments");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function getShareLink(investmentId: string): Promise<
  { success: true; url: string; slug: string } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("erp_investments")
      .select("public_slug")
      .eq("id", investmentId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) return { success: false, error: "לא נמצא" };
    const slug = data.public_slug;
    if (!slug) return { success: false, error: "אין קישור שיתוף" };
    const path = `/project/${slug}`;
    const url = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}${path}` : path;
    return { success: true, url, slug: String(slug) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export type PublicProjectView = {
  item_details: string | null;
  status: string;
  milestones: MilestoneItem[];
  progress_pct: number;
};

export async function fetchPublicProject(slug: string): Promise<
  { success: true; project: PublicProjectView } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("erp_investments")
      .select("item_details, status, milestones")
      .eq("public_slug", slug)
      .single();

    if (error || !data) return { success: false, error: "לא נמצא" };

    const milestones = (Array.isArray(data.milestones) ? data.milestones : []) as MilestoneItem[];
    const done = milestones.filter((m) => m.done).length;
    const progress_pct = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0;

    return {
      success: true,
      project: {
        item_details: data.item_details ?? null,
        status: data.status ?? "active",
        milestones,
        progress_pct,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function addPayment(
  investmentId: string,
  amount: number
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };
    if (amount <= 0) return { success: false, error: "הזן סכום" };

    const { data: inv } = await supabase
      .from("erp_investments")
      .select("amount_paid, total_agreed_price")
      .eq("id", investmentId)
      .eq("user_id", user.id)
      .single();

    if (!inv) return { success: false, error: "השקעה לא נמצאה" };

    const newPaid = Number(inv.amount_paid ?? 0) + amount;

    const { error } = await supabase
      .from("erp_investments")
      .update({
        amount_paid: newPaid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", investmentId)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/investments");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
