import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { greenApiSendChatMessage } from "@/lib/whatsapp/greenApi";

export const dynamic = "force-dynamic";

// סמן בוט — מונע לולאה בקבוצות WhatsApp
const BOT_MARKER = "​";

// שולח תזכורת רק על חוב ישן מ-30 יום ומעל 50 ₪
const MIN_DEBT_ILS = 50;
const MIN_AGE_DAYS = 30;

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972") && digits.length >= 12) return `${digits}@c.us`;
  if (digits.startsWith("0") && digits.length === 10)
    return `972${digits.slice(1)}@c.us`;
  return null;
}

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.nextUrl.searchParams.get("token") ??
    "";
  if (secret !== (process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // קבל הגדרות WhatsApp של כל משתמש
  const { data: allSettings } = await admin
    .from("user_settings")
    .select("user_id, green_api_id, green_api_token")
    .not("green_api_id", "is", null)
    .not("green_api_token", "is", null);

  if (!allSettings?.length) {
    return NextResponse.json({ ok: true, total_sent: 0, message: "no users with WhatsApp configured" });
  }

  const cutoffDate = new Date(Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let totalSent = 0;
  let totalSkipped = 0;
  const results: Array<{ user_id: string; sent: number; skipped: number; errors: number }> = [];

  for (const { user_id, green_api_id, green_api_token } of allSettings) {
    // קבל מכירות ישנות עם קונה
    const { data: sales } = await admin
      .from("erp_sales")
      .select("id, sale_price, buyer_id")
      .eq("user_id", user_id)
      .not("buyer_id", "is", null)
      .lte("sale_date", cutoffDate);

    if (!sales?.length) continue;

    let userSent = 0;
    let userSkipped = 0;
    let userErrors = 0;

    for (const sale of sales) {
      // חשב סכום ששולם
      const { data: payments } = await admin
        .from("erp_payments")
        .select("amount, direction")
        .eq("entity_id", sale.id)
        .eq("entity_type", "sale");

      const totalPaid = (payments ?? []).reduce(
        (sum, p) => sum + (p.direction === "incoming" ? p.amount : -p.amount),
        0
      );

      const remaining = (sale.sale_price ?? 0) - totalPaid;
      if (remaining < MIN_DEBT_ILS) {
        userSkipped++;
        totalSkipped++;
        continue;
      }

      // קבל פרטי קשר
      const { data: contact } = await admin
        .from("crm_contacts")
        .select("name, phone")
        .eq("id", sale.buyer_id)
        .maybeSingle();

      if (!contact?.phone) {
        userSkipped++;
        continue;
      }

      const chatId = normalizePhone(contact.phone);
      if (!chatId) {
        userSkipped++;
        continue;
      }

      const formattedDebt = remaining.toLocaleString("he-IL");
      const message = `${BOT_MARKER}שלום ${contact.name},\nרצינו להזכיר שיש יתרה פתוחה של ₪${formattedDebt} לטובת הידור הסת"ם.\nנשמח לתאם תשלום נוח — אנא צור/צרי קשר.\nתודה רבה! 🙏`;

      try {
        const result = await greenApiSendChatMessage(
          green_api_id,
          green_api_token,
          chatId,
          message
        );

        if (result.ok) {
          userSent++;
          totalSent++;
          void admin.from("sys_logs").insert({
            level: "INFO",
            module: "debt-reminders",
            message: "reminder sent",
            metadata: { user_id, sale_id: sale.id, buyer_id: sale.buyer_id, remaining },
          });
        } else {
          userErrors++;
          void admin.from("sys_logs").insert({
            level: "WARN",
            module: "debt-reminders",
            message: "greenApi send failed",
            metadata: { user_id, sale_id: sale.id, error: result.error },
          });
        }
      } catch (e) {
        userErrors++;
        void admin.from("sys_logs").insert({
          level: "ERROR",
          module: "debt-reminders",
          message: "reminder exception",
          metadata: { user_id, sale_id: sale.id, error: String(e) },
        });
      }
    }

    results.push({ user_id, sent: userSent, skipped: userSkipped, errors: userErrors });
  }

  return NextResponse.json({
    ok: true,
    total_sent: totalSent,
    total_skipped: totalSkipped,
    results,
    run_at: new Date().toISOString(),
  });
}
