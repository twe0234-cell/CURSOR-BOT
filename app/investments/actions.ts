"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateInventorySku } from "@/lib/inventory/sku";
import { recordLedgerPayment, type LedgerDirection } from "@/app/payments/actions";
import { getDealFinancials } from "@/src/services/crm.logic";

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
  is_public: boolean;
  created_at: string;
  scribe_name?: string;
};

const INVESTMENTS_SELECT_EXTENDED =
  "id, scribe_id, item_details, quantity, cost_per_unit, total_agreed_price, amount_paid, deductions, target_date, status, notes, milestones, documents, public_slug, is_public, created_at";
const INVESTMENTS_SELECT_LEGACY =
  "id, scribe_id, item_details, quantity, cost_per_unit, total_agreed_price, amount_paid, target_date, status, notes, created_at";

function isMissingColumnError(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("42703") ||
    m.includes("schema cache") ||
    m.includes("could not find")
  );
}

function mapInvestmentRow(
  r: Record<string, unknown>,
  scribeMap: Map<string, string | undefined>,
  legacy: boolean
): InvestmentRecord {
  const total = Number(r.total_agreed_price ?? 0);
  const paid = Number(r.amount_paid ?? 0);
  const ded = legacy ? 0 : Number(r.deductions ?? 0);
  const qty = Number(r.quantity ?? 1);
  const cpu = r.cost_per_unit != null ? Number(r.cost_per_unit) : null;
  let milestones: MilestoneItem[] = [];
  if (!legacy && Array.isArray(r.milestones)) {
    milestones = (r.milestones as unknown[]).map((m, idx) => {
      if (m && typeof m === "object" && "id" in m && "label" in m) {
        const o = m as { id: string; label: string; done?: boolean };
        return { id: String(o.id), label: String(o.label), done: Boolean(o.done) };
      }
      return { id: `m-${idx}`, label: String(m), done: false };
    });
  }
  const documents = !legacy && Array.isArray(r.documents) ? (r.documents as string[]) : [];
  const scribeId = (r.scribe_id as string | null) ?? null;
  return {
    id: String(r.id),
    scribe_id: scribeId,
    item_details: (r.item_details as string | null) ?? null,
    quantity: qty,
    cost_per_unit: cpu,
    total_agreed_price: total,
    amount_paid: paid,
    deductions: ded,
    remaining_balance: Math.max(0, total - paid - ded),
    target_date: (r.target_date as string | null) ?? null,
    status: (r.status as string) ?? "active",
    notes: (r.notes as string | null) ?? null,
    milestones,
    documents,
    public_slug: legacy ? null : ((r.public_slug as string | null) ?? null),
    is_public: legacy ? false : Boolean(r.is_public ?? false),
    created_at: (r.created_at as string) ?? "",
    scribe_name: scribeId ? scribeMap.get(scribeId) ?? undefined : undefined,
  };
}

export async function fetchInvestments(): Promise<
  { success: true; investments: InvestmentRecord[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    let data: Record<string, unknown>[] | null = null;
    let error = null as { message?: string; code?: string } | null;

    let res1;
    try {
      res1 = await supabase
        .from("erp_investments")
        .select(INVESTMENTS_SELECT_EXTENDED)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
    } catch (e) {
      console.error("[fetchInvestments] Supabase select threw:", e);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }

    data = res1.data as Record<string, unknown>[] | null;
    error = res1.error;

    let legacy = false;
    if (error) {
      console.error("[fetchInvestments] Supabase select error (full):", JSON.stringify(error, null, 2));
    }

    if (error && isMissingColumnError(error.message)) {
      try {
        const res2 = await supabase
          .from("erp_investments")
          .select(INVESTMENTS_SELECT_LEGACY)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        data = res2.data as Record<string, unknown>[] | null;
        error = res2.error;
        legacy = true;
        if (error) {
          console.error("[fetchInvestments] Legacy select error (full):", JSON.stringify(error, null, 2));
        }
      } catch (e) {
        console.error("[fetchInvestments] Legacy select threw:", e);
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    if (error) return { success: false, error: error.message ?? "שגיאת מסד נתונים" };

    const rows = data ?? [];
    const scribeIds = [...new Set(rows.map((r) => r.scribe_id).filter(Boolean))] as string[];
    const { data: scribeData } = scribeIds.length > 0
      ? await supabase.from("crm_contacts").select("id, name").in("id", scribeIds)
      : { data: [] };
    const scribeMap = new Map((scribeData ?? []).map((s) => [s.id, s.name]));

    const investments = rows.map((r) => mapInvestmentRow(r, scribeMap, legacy));

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

type ShareLinkRow = { public_slug: string | null; is_public?: boolean };

export async function getShareLink(investmentId: string): Promise<
  { success: true; url: string; slug: string } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    let row: ShareLinkRow | null = null;
    let selErr = null as { message?: string } | null;

    const sel1 = await supabase
      .from("erp_investments")
      .select("public_slug, is_public")
      .eq("id", investmentId)
      .eq("user_id", user.id)
      .single();
    row = sel1.data as ShareLinkRow | null;
    selErr = sel1.error;

    if (selErr && isMissingColumnError(selErr.message)) {
      const sel2 = await supabase
        .from("erp_investments")
        .select("public_slug")
        .eq("id", investmentId)
        .eq("user_id", user.id)
        .single();
      row = sel2.data as ShareLinkRow | null;
      selErr = sel2.error;
    }

    if (selErr || !row) return { success: false, error: "לא נמצא" };
    const slug = row.public_slug;
    if (!slug) return { success: false, error: "אין קישור שיתוף" };

    if (row.is_public === false) {
      const { error: pubErr } = await supabase
        .from("erp_investments")
        .update({ is_public: true, updated_at: new Date().toISOString() })
        .eq("id", investmentId)
        .eq("user_id", user.id);
      if (pubErr && !isMissingColumnError(pubErr.message)) {
        return { success: false, error: pubErr.message };
      }
      if (!pubErr || isMissingColumnError(pubErr.message)) {
        revalidatePath("/investments");
        revalidatePath(`/project/${slug}`);
      }
    }
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
      .eq("is_public", true)
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

/** Updates investment balance and appends a row to `erp_payments` (ledger). */
export async function addInvestmentLedgerPayment(
  investmentId: string,
  amount: number,
  paymentDate?: string,
  method?: string | null,
  notes?: string | null,
  direction: LedgerDirection = "incoming"
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };
    if (amount <= 0) return { success: false, error: "הזן סכום חיובי" };

    const { data: inv } = await supabase
      .from("erp_investments")
      .select("amount_paid, total_agreed_price, quantity, cost_per_unit")
      .eq("id", investmentId)
      .eq("user_id", user.id)
      .single();

    if (!inv) return { success: false, error: "השקעה לא נמצאה" };

    const { totalCost } = getDealFinancials({
      total_price: inv.total_agreed_price,
      quantity: inv.quantity,
      unit_price: inv.cost_per_unit,
      amount_paid: inv.amount_paid,
    });

    const paid = Number(inv.amount_paid ?? 0);
    // Investments: "outgoing" = we pay the scribe → amount_paid increases.
    // "incoming" = scribe refunds us → amount_paid decreases.
    const delta = direction === "outgoing" ? amount : -amount;
    const newPaid = paid + delta;
    if (newPaid < 0) return { success: false, error: "הסכום חורג מהיתרה שנרשמה" };
    if (direction === "outgoing" && newPaid > totalCost) {
      return {
        success: false,
        error: `הסכום חורג מסכום ההשקעה הכולל (${totalCost.toLocaleString("he-IL")} ₪)`,
      };
    }

    const { error: upErr } = await supabase
      .from("erp_investments")
      .update({
        amount_paid: newPaid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", investmentId)
      .eq("user_id", user.id);

    if (upErr) return { success: false, error: upErr.message };

    const ledger = await recordLedgerPayment({
      entityId: investmentId,
      entityType: "investment",
      amount,
      paymentDate,
      method: method ?? null,
      notes: notes ?? null,
      direction,
    });

    if (!ledger.success) {
      await supabase
        .from("erp_investments")
        .update({
          amount_paid: paid,
          updated_at: new Date().toISOString(),
        })
        .eq("id", investmentId)
        .eq("user_id", user.id);
      return ledger;
    }

    revalidatePath("/investments");
    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

/** @deprecated Prefer PaymentModal + addInvestmentLedgerPayment (writes ledger). */
export async function addPayment(investmentId: string, amount: number): Promise<ActionResult> {
  return addInvestmentLedgerPayment(investmentId, amount, undefined, null, null, "incoming");
}

/** Updates core investment fields (item details, quantity, cost, dates, notes). */
export async function updateInvestmentDetails(
  investmentId: string,
  data: {
    scribe_id?: string | null;
    item_details?: string | null;
    quantity?: number;
    cost_per_unit?: number;
    target_date?: string | null;
    notes?: string | null;
  }
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (data.scribe_id !== undefined) patch.scribe_id = data.scribe_id || null;
    if (data.item_details !== undefined) patch.item_details = data.item_details?.trim() || null;
    if (data.target_date !== undefined) patch.target_date = data.target_date || null;
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;

    if (data.quantity !== undefined || data.cost_per_unit !== undefined) {
      const { data: inv } = await supabase
        .from("erp_investments")
        .select("quantity, cost_per_unit")
        .eq("id", investmentId)
        .eq("user_id", user.id)
        .single();
      if (!inv) return { success: false, error: "השקעה לא נמצאה" };

      const qty =
        data.quantity !== undefined ? data.quantity : Math.max(1, Number(inv.quantity ?? 1));
      const cpu =
        data.cost_per_unit !== undefined
          ? data.cost_per_unit
          : Number(inv.cost_per_unit ?? 0);

      if (qty <= 0) return { success: false, error: "הכמות חייבת להיות חיובית" };
      if (cpu < 0) return { success: false, error: "עלות ליחידה לא יכולה להיות שלילית" };

      patch.quantity = qty;
      patch.cost_per_unit = cpu;
      patch.total_agreed_price = qty * cpu;
    }

    if (Object.keys(patch).length <= 1) {
      return { success: false, error: "אין שדות לעדכון" };
    }

    const { error } = await supabase
      .from("erp_investments")
      .update(patch)
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

/** Create inventory from an active investment; mark investment delivered_to_inventory. */
export async function moveInvestmentToInventory(investmentId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: inv, error: fetchErr } = await supabase
      .from("erp_investments")
      .select(
        "id, user_id, status, scribe_id, item_details, quantity, cost_per_unit, total_agreed_price, notes"
      )
      .eq("id", investmentId)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !inv) return { success: false, error: "השקעה לא נמצאה" };
    if (inv.status !== "active") return { success: false, error: "רק השקעה פעילה ניתנת להעברה למלאי" };

    const qty = Math.max(1, Math.floor(Number(inv.quantity ?? 1)));
    const totalAgreed = Number(inv.total_agreed_price ?? 0);
    const cpu =
      inv.cost_per_unit != null && Number(inv.cost_per_unit) >= 0
        ? Number(inv.cost_per_unit)
        : qty > 0
          ? totalAgreed / qty
          : totalAgreed;
    const totalCost = cpu * qty;

    const sku = generateInventorySku();
    const description =
      [inv.item_details, inv.notes ? `הערות: ${inv.notes}` : null].filter(Boolean).join("\n") || null;

    const { error: insErr } = await supabase.from("inventory").insert({
      sku,
      user_id: user.id,
      product_category: "מלאי מהשקעה",
      category_meta: {},
      script_type: null,
      status: "available",
      quantity: qty,
      cost_price: cpu,
      total_cost: totalCost,
      amount_paid: 0,
      target_price: null,
      total_target_price: null,
      scribe_id: inv.scribe_id ?? null,
      scribe_code: null,
      images: [],
      description,
      parchment_type: null,
      computer_proofread: false,
      human_proofread: false,
      is_sewn: false,
      has_lamnatzeach: false,
      size: null,
      megillah_type: null,
    });

    if (insErr) return { success: false, error: insErr.message };

    const { error: updErr } = await supabase
      .from("erp_investments")
      .update({
        status: "delivered_to_inventory",
        updated_at: new Date().toISOString(),
      })
      .eq("id", investmentId)
      .eq("user_id", user.id);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    revalidatePath("/investments");
    revalidatePath("/inventory");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
