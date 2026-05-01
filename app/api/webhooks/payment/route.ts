import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PayloadSchema = z.object({
  sale_id: z.string().uuid("sale_id חייב להיות UUID תקני"),
  amount: z.number().positive("amount חייב להיות חיובי"),
  payment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "payment_date: YYYY-MM-DD")
    .optional(),
  method: z
    .enum(["cash", "credit_card", "bank_transfer", "check", "other"])
    .default("other"),
  notes: z.string().max(500).optional(),
  // מפתח אידמפוטנציה — מונע תשלום כפול מאותו ספק חיצוני
  external_reference: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  // אימות: token=CRON_SECRET בשורת query
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.CRON_SECRET ?? "";
  if (!token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { sale_id, amount, payment_date, method, notes, external_reference } =
    parsed.data;

  // ודא שהמכירה קיימת
  const { data: sale, error: saleErr } = await admin
    .from("erp_sales")
    .select("id, user_id, sale_price")
    .eq("id", sale_id)
    .maybeSingle();

  if (saleErr || !sale) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }

  // בדיקת אידמפוטנציה — מנע תשלום כפול עם אותו external_reference
  if (external_reference) {
    const { data: existing } = await admin
      .from("erp_payments")
      .select("id")
      .eq("entity_id", sale_id)
      .eq("entity_type", "sale")
      .ilike("notes", `%ref:${external_reference}%`)
      .maybeSingle();

    if (existing) {
      void admin.from("sys_logs").insert({
        level: "WARN",
        module: "payment-webhook",
        message: "duplicate payment skipped",
        metadata: { external_reference, sale_id, existing_id: existing.id },
      });
      return NextResponse.json({ ok: true, duplicate: true, payment_id: existing.id });
    }
  }

  const notesStr = [notes, external_reference ? `ref:${external_reference}` : null]
    .filter(Boolean)
    .join(" | ");

  const { data: payment, error: payErr } = await admin
    .from("erp_payments")
    .insert({
      user_id: sale.user_id,
      entity_id: sale_id,
      entity_type: "sale",
      amount,
      direction: "incoming",
      payment_date: payment_date ?? new Date().toISOString().slice(0, 10),
      method,
      notes: notesStr || null,
    })
    .select("id")
    .single();

  if (payErr) {
    void admin.from("sys_logs").insert({
      level: "ERROR",
      module: "payment-webhook",
      message: "payment insert failed",
      metadata: { sale_id, amount, error: payErr.message, code: payErr.code },
    });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  void admin.from("sys_logs").insert({
    level: "INFO",
    module: "payment-webhook",
    message: "payment recorded",
    metadata: {
      payment_id: payment.id,
      sale_id,
      amount,
      method,
      external_reference: external_reference ?? null,
    },
  });

  // erp_profit_ledger מתעדכן אוטומטית דרך trg_payments_ledger trigger
  return NextResponse.json({ ok: true, payment_id: payment.id });
}
