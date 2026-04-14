/**
 * GET /api/admin/import-wa-contacts?token=WEBHOOK_SECRET
 *
 * One-time import: pulls all WhatsApp chats (individual, not groups) that had
 * activity in the last 18 months and upserts them into crm_contacts.
 *
 * Logic:
 *   - Skips group chats (@g.us)
 *   - Skips contacts already in CRM (matched by wa_chat_id OR phone number)
 *   - Inserts new contacts with type="Other", tag="WA_Import"
 *   - Returns a JSON summary { imported, skipped, errors }
 *
 * Authentication: requires ?token= matching WEBHOOK_SECRET env var.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { greenApiGetChats } from "@/lib/whatsapp/greenApi";

export const dynamic = "force-dynamic";

const EIGHTEEN_MONTHS_AGO_SECONDS = Math.floor(Date.now() / 1000) - 18 * 30 * 24 * 3600;

function waIdToPhone(waId: string): string {
  // "972501234567@c.us" → "0501234567"
  const digits = waId.replace("@c.us", "").replace(/\D/g, "");
  if (digits.startsWith("972") && digits.length >= 12) {
    return `0${digits.slice(3)}`;
  }
  return digits;
}

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.WEBHOOK_SECRET ?? "";
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Admin client unavailable" }, { status: 500 });
  }

  // ── Fetch Green API credentials ──────────────────────────────────────────
  const { data: settings, error: settingsErr } = await admin
    .from("user_settings")
    .select("user_id, green_api_id, green_api_token")
    .not("green_api_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (settingsErr || !settings?.green_api_id || !settings?.green_api_token) {
    return NextResponse.json(
      { error: "Green API credentials not configured in user_settings", detail: settingsErr?.message },
      { status: 400 }
    );
  }

  const instanceId = String(settings.green_api_id).trim();
  const apiToken = String(settings.green_api_token).trim();
  const userId = settings.user_id as string;

  // ── Fetch chats from Green API ───────────────────────────────────────────
  const chatsResult = await greenApiGetChats(instanceId, apiToken);
  if (!chatsResult.ok) {
    return NextResponse.json({ error: `Green API error: ${chatsResult.error}` }, { status: 502 });
  }

  const recentIndividualChats = chatsResult.chats.filter((c) => {
    if (!c.id || c.id.includes("@g.us")) return false;          // skip groups
    if (!c.id.includes("@c.us")) return false;                  // only individual chats
    const t = c.lastMessageTime ?? 0;
    return t >= EIGHTEEN_MONTHS_AGO_SECONDS;                    // active in last 18 months
  });

  if (recentIndividualChats.length === 0) {
    return NextResponse.json({
      ok: true,
      imported: 0,
      skipped: 0,
      total_chats_checked: chatsResult.chats.length,
      message: "אין אנשי קשר פרטיים פעילים ב-18 חודשים האחרונים",
    });
  }

  // ── Load existing contacts to detect duplicates ──────────────────────────
  const { data: existing } = await admin
    .from("crm_contacts")
    .select("id, wa_chat_id, phone")
    .eq("user_id", userId);

  const existingWaIds = new Set(
    (existing ?? []).map((c) => (c.wa_chat_id as string | null)?.trim()).filter(Boolean)
  );
  const existingPhones = new Set(
    (existing ?? []).map((c) => (c.phone as string | null)?.replace(/\D/g, "")).filter(Boolean)
  );

  // ── Upsert new contacts ──────────────────────────────────────────────────
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const chat of recentIndividualChats) {
    const waId = chat.id.trim();
    const phone = waIdToPhone(waId);
    const phoneDigits = phone.replace(/\D/g, "");
    const name = chat.name?.trim() || phone;

    // Skip if already in CRM
    if (existingWaIds.has(waId) || (phoneDigits && existingPhones.has(phoneDigits))) {
      skipped++;
      continue;
    }

    const { error: insErr } = await admin.from("crm_contacts").insert({
      user_id: userId,
      name,
      type: "Other",
      preferred_contact: "WhatsApp",
      wa_chat_id: waId,
      phone,
      tags: ["WA_Import"],
    });

    if (insErr) {
      if (insErr.code === "23505") {
        skipped++;
      } else {
        errors.push(`${name}: ${insErr.message}`);
      }
    } else {
      imported++;
      existingWaIds.add(waId);
      if (phoneDigits) existingPhones.add(phoneDigits);
    }
  }

  await admin.from("sys_logs").insert({
    level: "INFO",
    module: "import-wa-contacts",
    message: "one-time WA import complete",
    metadata: { imported, skipped, errors: errors.length, total: recentIndividualChats.length },
  });

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
    total_chats_checked: chatsResult.chats.length,
    active_individual: recentIndividualChats.length,
    message: `יובאו ${imported} אנשי קשר חדשים, ${skipped} דולגו (כבר קיימים)`,
  });
}
