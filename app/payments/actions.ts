"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { success: true } | { success: false; error: string };

export type LedgerEntityType = "sale" | "investment";
export type LedgerDirection = "incoming" | "outgoing";

/**
 * Universal payments ledger row (incoming = we receive cash; outgoing = we pay out).
 */
export async function recordLedgerPayment(opts: {
  entityId: string;
  entityType: LedgerEntityType;
  amount: number;
  paymentDate?: string;
  method?: string | null;
  notes?: string | null;
  direction?: LedgerDirection;
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };
    if (opts.amount <= 0) return { success: false, error: "הזן סכום חיובי" };

    const direction = opts.direction ?? "incoming";
    const paymentDateIso = opts.paymentDate
      ? new Date(opts.paymentDate).toISOString()
      : new Date().toISOString();

    const row: Record<string, unknown> = {
      user_id: user.id,
      entity_id: opts.entityId,
      entity_type: opts.entityType,
      amount: opts.amount,
      payment_date: paymentDateIso,
      method: opts.method?.trim() || null,
      notes: opts.notes?.trim() || null,
      direction,
    };

    const { error } = await supabase.from("erp_payments").insert(row);
    if (error) return { success: false, error: error.message };

    revalidatePath("/sales");
    revalidatePath("/investments");
    revalidatePath("/crm");
    revalidatePath("/crm", "layout");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
