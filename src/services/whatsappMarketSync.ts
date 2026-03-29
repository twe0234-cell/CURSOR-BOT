import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/src/lib/supabase/server";
import {
  greenApiDispatchSpacingDelayMs,
  greenApiGetChatHistory,
  greenApiSendChatMessage,
  fileNameForImageUrl,
  type GreenChatHistoryMessage,
} from "@/lib/whatsapp/greenApi";
import {
  parseMarketTorahMessage,
  parsedMessageIsActionable,
} from "@/src/lib/market/parseWhatsAppMarketMessage";
import { marketDbToK, marketKToDb } from "@/lib/market/kPricing";
import { generateSku, marketSkuPrefix } from "@/lib/sku";
import { resolveContentType } from "@/lib/upload";

export type WhatsAppMarketSyncResult =
  | { success: true; imported: number; skipped: number; errors: string[] }
  | { success: false; error: string };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_BUCKET = "media";

function combinedMessageText(m: GreenChatHistoryMessage): string {
  const parts: string[] = [];
  const push = (s?: string | null) => {
    const t = s?.trim();
    if (t && !parts.includes(t)) parts.push(t);
  };
  push(m.textMessage);
  push(m.extendedTextMessage?.text);
  push(m.caption);
  return parts.join("\n");
}

async function downloadAndUploadWaImage(
  supabase: SupabaseClient,
  userId: string,
  downloadUrl: string,
  fileName?: string | null,
  mimeType?: string | null
): Promise<string> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("הקובץ חורג ממגבלת 5MB");
  }
  const type =
    (mimeType && mimeType.trim()) ||
    res.headers.get("content-type") ||
    "image/jpeg";
  const blob = new Blob([buf], { type });
  const extFromName =
    fileName && fileName.includes(".")
      ? (fileName.split(".").pop() ?? "").toLowerCase()
      : "";
  const ext =
    extFromName && /^[a-z0-9]{2,5}$/i.test(extFromName)
      ? extFromName
      : fileNameForImageUrl(downloadUrl).split(".").pop() || "jpg";

  const path = `${userId}/market-wa/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: resolveContentType(blob),
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * סורק את קבוצת ה-WhatsApp המוגדרת, מוסיף רשומות למאגר, ושולח אישור לקבוצה לכל ייבוא מוצלח.
 */
export async function syncMarketFromWhatsAppGroup(
  userId: string
): Promise<WhatsAppMarketSyncResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return { success: false, error: "יש להתחבר" };
  }

  const { data: settings, error: settingsErr } = await supabase
    .from("user_settings")
    .select("wa_market_group_id, green_api_id, green_api_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsErr) {
    return { success: false, error: settingsErr.message };
  }

  const groupId = String(settings?.wa_market_group_id ?? "").trim();
  const instanceId = String(settings?.green_api_id ?? "").trim();
  const token = String(settings?.green_api_token ?? "").trim();

  if (!groupId) {
    return {
      success: false,
      error: "לא הוגדר Chat ID לקבוצת המאגר (הגדרות → חיבורי API)",
    };
  }
  if (!instanceId || !token) {
    return { success: false, error: "חסרים Instance ID או API Token של Green API" };
  }

  const hist = await greenApiGetChatHistory(instanceId, token, groupId, 20);
  if (!hist.ok) {
    return { success: false, error: hist.error };
  }

  const { data: existingRows, error: exErr } = await supabase
    .from("market_torah_books")
    .select("source_message_id")
    .eq("user_id", user.id)
    .not("source_message_id", "is", null);

  if (exErr) {
    return { success: false, error: exErr.message };
  }

  const seen = new Set(
    (existingRows ?? [])
      .map((r) => r.source_message_id as string | null)
      .filter((x): x is string => !!x)
  );

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const m of hist.messages) {
    const idMsg = m.idMessage?.trim();
    if (!idMsg) {
      skipped++;
      continue;
    }
    if (seen.has(idMsg)) {
      skipped++;
      continue;
    }

    const body = combinedMessageText(m);
    if (!body.trim()) {
      skipped++;
      continue;
    }

    const parsed = parseMarketTorahMessage(body);
    if (!parsedMessageIsActionable(parsed)) {
      skipped++;
      continue;
    }

    try {
      let handwriting_image_url: string | null = null;
      const dl = m.downloadUrl?.trim();
      if (dl) {
        try {
          handwriting_image_url = await downloadAndUploadWaImage(
            supabase,
            user.id,
            dl,
            m.fileName,
            m.mimeType
          );
        } catch (imgErr) {
          errors.push(
            `תמונה (${idMsg.slice(0, 12)}…): ${imgErr instanceof Error ? imgErr.message : "שגיאה"}`
          );
        }
      }

      const askFull = parsed.asking_price_full_shekels!;
      const askDb = marketKToDb(marketDbToK(askFull));
      const sku = generateSku(marketSkuPrefix);

      const { error: insErr } = await supabase.from("market_torah_books").insert({
        user_id: user.id,
        sku,
        source_message_id: idMsg,
        sofer_id: null,
        dealer_id: null,
        external_sofer_name: null,
        script_type: parsed.script_type,
        torah_size: parsed.torah_size,
        parchment_type: null,
        influencer_style: null,
        asking_price: askDb,
        target_brokerage_price: null,
        currency: "ILS",
        expected_completion_date: null,
        notes: null,
        last_contact_date: null,
        negotiation_notes: null,
        handwriting_image_url,
      });

      if (insErr) {
        if (insErr.code === "23505") {
          seen.add(idMsg);
          skipped++;
          continue;
        }
        errors.push(`${idMsg.slice(0, 16)}: ${insErr.message}`);
        continue;
      }

      seen.add(idMsg);
      imported++;

      await new Promise((r) => setTimeout(r, greenApiDispatchSpacingDelayMs()));
      const sent = await greenApiSendChatMessage(
        instanceId,
        token,
        groupId,
        "✅ נקלט במאגר בהצלחה!"
      );
      if (!sent.ok) {
        errors.push(`אישור לקבוצה (${idMsg.slice(0, 12)}…): ${sent.error}`);
      }
    } catch (e) {
      errors.push(`${idMsg.slice(0, 16)}: ${e instanceof Error ? e.message : "שגיאה"}`);
    }
  }

  return { success: true, imported, skipped, errors };
}
