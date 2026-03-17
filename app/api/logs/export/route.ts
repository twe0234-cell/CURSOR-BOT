import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const dynamic = "force-dynamic";

function toCSV(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = ["id", "level", "module", "message", "metadata", "created_at"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const metadata = typeof r.metadata === "object" && r.metadata !== null
      ? JSON.stringify(r.metadata).replace(/"/g, '""')
      : "";
    lines.push(
      [
        r.id ?? "",
        r.level ?? "",
        r.module ?? "",
        String(r.message ?? "").replace(/"/g, '""'),
        `"${metadata}"`,
        r.created_at ?? "",
      ].join(",")
    );
  }
  return lines.join("\n");
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Admin not configured" }, { status: 503 });
    }

    const { data, error } = await admin
      .from("sys_logs")
      .select("id, level, module, message, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const format = new URL(req.url).searchParams.get("format") ?? "json";

    if (format === "csv") {
      const csv = toCSV(rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="system_logs_dump.csv"',
        },
      });
    }

    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="system_logs_dump.json"',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
