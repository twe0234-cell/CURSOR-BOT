import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/outstanding-debts
 * החזרת רשימת מכירות עם יתרת חוב פתוחה.
 *
 * Query params:
 * - min_amount (default: 50) — מינימום יתרה ב-₪
 * - older_than_days (default: 0) — חוב שמבוגר מ-X ימים
 * - has_phone (default: false) — רק קונטקטים עם טלפון (לפני שליחת תזכורת)
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const minAmount = Number(searchParams.get("min_amount") ?? "50");
  const olderThanDays = Number(searchParams.get("older_than_days") ?? "0");
  const hasPhone = searchParams.get("has_phone") === "true";

  // קבל את כל המכירות של המשתמש עם buyer_id
  const cutoffDate =
    olderThanDays > 0
      ? new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : null;

  let salesQuery = supabase
    .from("erp_sales")
    .select("id, sale_price, sale_date, buyer_id")
    .eq("user_id", user.id)
    .not("buyer_id", "is", null);

  if (cutoffDate) {
    salesQuery = salesQuery.lte("sale_date", cutoffDate);
  }

  const { data: sales, error: salesErr } = await salesQuery;
  if (salesErr) {
    return NextResponse.json({ error: salesErr.message }, { status: 500 });
  }
  if (!sales?.length) {
    return NextResponse.json({ data: [], meta: { count: 0, total_debt: 0 } });
  }

  const saleIds = sales.map((s) => s.id);
  const buyerIds = Array.from(new Set(sales.map((s) => s.buyer_id))) as string[];

  // קבל את כל התשלומים של המכירות האלו
  const { data: payments } = await supabase
    .from("erp_payments")
    .select("entity_id, amount, direction")
    .eq("entity_type", "sale")
    .in("entity_id", saleIds);

  const paidBySale = new Map<string, number>();
  for (const p of payments ?? []) {
    const cur = paidBySale.get(p.entity_id) ?? 0;
    const signed = p.direction === "incoming" ? Number(p.amount) : -Number(p.amount);
    paidBySale.set(p.entity_id, cur + signed);
  }

  // קבל את פרטי הקונטקטים
  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, name, phone")
    .in("id", buyerIds);

  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));

  // בנה תוצאה
  const debts = sales
    .map((sale) => {
      const totalPaid = paidBySale.get(sale.id) ?? 0;
      const remaining = Number(sale.sale_price ?? 0) - totalPaid;
      const contact = contactById.get(sale.buyer_id!);
      return {
        sale_id: sale.id,
        sale_date: sale.sale_date,
        sale_price: Number(sale.sale_price ?? 0),
        total_paid: totalPaid,
        remaining,
        buyer_id: sale.buyer_id,
        buyer_name: contact?.name ?? null,
        buyer_phone: contact?.phone ?? null,
        has_phone: !!contact?.phone,
      };
    })
    .filter((d) => d.remaining >= minAmount)
    .filter((d) => (hasPhone ? d.has_phone : true))
    .sort((a, b) => (a.sale_date < b.sale_date ? -1 : 1));

  const meta = {
    count: debts.length,
    total_debt: debts.reduce((s, d) => s + d.remaining, 0),
    with_phone: debts.filter((d) => d.has_phone).length,
    without_phone: debts.filter((d) => !d.has_phone).length,
    filters: {
      min_amount: minAmount,
      older_than_days: olderThanDays,
      has_phone: hasPhone,
    },
  };

  return NextResponse.json({ data: debts, meta });
}
