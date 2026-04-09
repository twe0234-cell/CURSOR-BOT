/**
 * GET /api/whatsapp-webhook/status
 *
 * Diagnostic endpoint — returns current webhook configuration status.
 * Requires the same ?token= auth as the webhook itself.
 * Safe to call from the Settings UI.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.WEBHOOK_SECRET ?? "";

  const secretSet = expected.length > 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookUrl = appUrl
    ? `${appUrl}/api/whatsapp-webhook?token=${secretSet ? "✓ [מוגדר]" : "⚠️ [חסר]"}`
    : "⚠️ NEXT_PUBLIC_APP_URL לא מוגדר";

  // Light auth — if secret IS set, require the correct token
  if (secretSet && (!token || token !== expected)) {
    return NextResponse.json(
      {
        ok: false,
        webhookUrl,
        secretSet,
        error: "Unauthorized — add ?token=YOUR_WEBHOOK_SECRET to this URL",
      },
      { status: 401 }
    );
  }

  // Check DB for user settings
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Admin client unavailable" }, { status: 500 });
  }
  const { data: settings, error } = await admin
    .from("user_settings")
    .select("user_id, green_api_id, wa_market_group_id")
    .limit(5);

  const rows = (settings ?? []) as Array<{
    user_id: string;
    green_api_id: string | null;
    wa_market_group_id: string | null;
  }>;

  return NextResponse.json({
    ok: true,
    secretSet,
    webhookUrl: appUrl
      ? `${appUrl}/api/whatsapp-webhook?token=YOUR_WEBHOOK_SECRET`
      : "⚠️ NEXT_PUBLIC_APP_URL לא מוגדר",
    configuredInstances: rows.map((r) => ({
      greenApiId: r.green_api_id ?? "—",
      groupId: r.wa_market_group_id ?? "⚠️ לא הוגדר",
    })),
    dbError: error?.message ?? null,
  });
}
