import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

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
  const year = searchParams.get("year");
  const format = searchParams.get("format"); // "csv" | "json" (default)

  let query = supabase
    .from("monthly_realized_profit_view")
    .select("profit_month, total_profit, total_cost_recovery, total_cash_flow")
    .eq("user_id", user.id)
    .order("profit_month", { ascending: false });

  if (year) {
    query = query
      .gte("profit_month", `${year}-01-01`)
      .lte("profit_month", `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  const meta = {
    total_profit: rows.reduce((s, r) => s + Number(r.total_profit ?? 0), 0),
    total_cost_recovery: rows.reduce((s, r) => s + Number(r.total_cost_recovery ?? 0), 0),
    total_cash_flow: rows.reduce((s, r) => s + Number(r.total_cash_flow ?? 0), 0),
    rows_count: rows.length,
    year: year ?? "all",
    generated_at: new Date().toISOString(),
  };

  if (format === "csv") {
    const header = "profit_month,total_profit,total_cost_recovery,total_cash_flow";
    const lines = rows.map(
      (r) =>
        `${r.profit_month},${r.total_profit ?? 0},${r.total_cost_recovery ?? 0},${r.total_cash_flow ?? 0}`
    );
    const csv = [header, ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="profit-${year ?? "all"}.csv"`,
      },
    });
  }

  return NextResponse.json({ data: rows, meta });
}
