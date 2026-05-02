import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { greenApiSendChatMessage } from "@/lib/whatsapp/greenApi";

export const dynamic = "force-dynamic";

// סמן בוט (zero-width space) — מונע לולאה ב-WhatsApp webhook
const BOT_MARKER = "​";

// תזכורות רק על חוב מעל 50 ₪ ומכירה ישנה מ-30 יום
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

  // dry_run=true — מציג מה היה נשלח בלי לשלוח בפועל
  const dryRun = req.nextUrl.searchParams.get("dry_run") === "true";

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // קבל את כל המכירות עם יתרה פתוחה דרך sale_profit_view
  const { data: openDebts, error: debtsErr } = await admin
    .from("sale_profit_view")
    .select("sale_id, user_id, total_price, total_paid, remaining_balance")
    .gt("remaining_balance", MIN_DEBT_ILS);

  if (debtsErr) {
    return NextResponse.json({ error: debtsErr.message }, { status: 500 });
  }

  if (!openDebts?.length) {
    return NextResponse.json({
      ok: true,
      total_sent: 0,
      message: "no open debts above threshold",
    });
  }

  // קבל פרטי המכירות (sale_date + buyer_id) במנה אחת
  const saleIds = openDebts.map((d) => d.sale_id);
  const cutoffDate = new Date(Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: sales } = await admin
    .from("erp_sales")
    .select("id, buyer_id, sale_date")
    .in("id", saleIds)
    .lte("sale_date", cutoffDate)
    .not("buyer_id", "is", null);

  if (!sales?.length) {
    return NextResponse.json({
      ok: true,
      total_sent: 0,
      message: "no debts older than 30 days with buyer assigned",
    });
  }

  // קבל פרטי קונטקטים במנה אחת
  const buyerIds = Array.from(new Set(sales.map((s) => s.buyer_id))) as string[];
  const { data: contacts } = await admin
    .from("crm_contacts")
    .select("id, name, phone, email")
    .in("id", buyerIds);

  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));

  // קבל הגדרות WhatsApp לכל user_id
  const userIds = Array.from(new Set(openDebts.map((d) => d.user_id))) as string[];
  const { data: settingsRows } = await admin
    .from("user_settings")
    .select("user_id, green_api_id, green_api_token")
    .in("user_id", userIds);

  const settingsByUser = new Map(
    (settingsRows ?? []).map((s) => [s.user_id, s])
  );

  // הצלב הכל
  const debtsByid = new Map(openDebts.map((d) => [d.sale_id, d]));
  const candidates = sales
    .map((sale) => {
      const debt = debtsByid.get(sale.id);
      const contact = contactById.get(sale.buyer_id!);
      if (!debt || !contact) return null;
      return {
        sale_id: sale.id,
        user_id: debt.user_id,
        sale_date: sale.sale_date,
        remaining: Number(debt.remaining_balance ?? 0),
        contact_id: contact.id,
        contact_name: contact.name,
        phone: contact.phone,
        email: contact.email,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // dry_run — החזר רק תצוגה מקדימה
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      candidates_count: candidates.length,
      with_phone: candidates.filter((c) => c.phone).length,
      without_phone_with_email: candidates.filter((c) => !c.phone && c.email).length,
      no_contact_method: candidates.filter((c) => !c.phone && !c.email).length,
      total_debt: candidates.reduce((s, c) => s + c.remaining, 0),
      candidates: candidates.map((c) => ({
        sale_id: c.sale_id,
        contact_name: c.contact_name,
        remaining: c.remaining,
        sale_date: c.sale_date,
        channel: c.phone ? "whatsapp" : c.email ? "email" : "none",
      })),
    });
  }

  // ביצוע: שלח בפועל דרך WhatsApp לאלה שיש להם טלפון
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const skippedReasons: Record<string, number> = {};

  for (const c of candidates) {
    if (!c.phone) {
      totalSkipped++;
      skippedReasons[c.email ? "email_only" : "no_contact"] =
        (skippedReasons[c.email ? "email_only" : "no_contact"] ?? 0) + 1;
      continue;
    }

    const settings = settingsByUser.get(c.user_id);
    if (!settings?.green_api_id || !settings.green_api_token) {
      totalSkipped++;
      skippedReasons["user_no_whatsapp"] =
        (skippedReasons["user_no_whatsapp"] ?? 0) + 1;
      continue;
    }

    const chatId = normalizePhone(c.phone);
    if (!chatId) {
      totalSkipped++;
      skippedReasons["invalid_phone"] = (skippedReasons["invalid_phone"] ?? 0) + 1;
      continue;
    }

    const formattedDebt = c.remaining.toLocaleString("he-IL");
    const message = `${BOT_MARKER}שלום ${c.contact_name},\nרצינו להזכיר שיש יתרה פתוחה של ₪${formattedDebt} לטובת הידור הסת"ם.\nנשמח לתאם תשלום נוח — אנא צור/צרי קשר.\nתודה רבה! 🙏`;

    try {
      const result = await greenApiSendChatMessage(
        settings.green_api_id,
        settings.green_api_token,
        chatId,
        message
      );

      if (result.ok) {
        totalSent++;
        void admin.from("sys_logs").insert({
          level: "INFO",
          module: "debt-reminders",
          message: "reminder sent",
          metadata: {
            user_id: c.user_id,
            sale_id: c.sale_id,
            contact_id: c.contact_id,
            remaining: c.remaining,
          },
        });
      } else {
        totalErrors++;
        void admin.from("sys_logs").insert({
          level: "WARN",
          module: "debt-reminders",
          message: "greenApi send failed",
          metadata: { user_id: c.user_id, sale_id: c.sale_id, error: result.error },
        });
      }
    } catch (e) {
      totalErrors++;
      void admin.from("sys_logs").insert({
        level: "ERROR",
        module: "debt-reminders",
        message: "reminder exception",
        metadata: { user_id: c.user_id, sale_id: c.sale_id, error: String(e) },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total_sent: totalSent,
    total_skipped: totalSkipped,
    total_errors: totalErrors,
    skipped_reasons: skippedReasons,
    run_at: new Date().toISOString(),
  });
}
