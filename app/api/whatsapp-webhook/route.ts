import { type NextRequest, NextResponse } from "next/server";
import {
  extractTextFromGreenIncomingWebhookMessageData,
  extractImageUrlFromMessageData,
  greenApiSendChatMessage,
} from "@/lib/whatsapp/greenApi";
import { marketDbToK, marketKToDb } from "@/lib/market/kPricing";
import { generateSku, marketSkuPrefix } from "@/lib/sku";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  parseMarketTorahMessage,
  parsedMessageIsActionable,
  listMissingParseFields,
} from "@/src/lib/market/parseWhatsAppMarketMessage";

export const dynamic = "force-dynamic";

const MSG_OK        = "✅ נקלט בהצלחה";
const MSG_OK_IMAGE  = "✅ נקלט בהצלחה (עם תמונה)";
const MSG_IMAGE_ACK = "📷 תמונה התקבלה. שלח פרטים (גודל, מחיר...) בהודעה הבאה תוך שעה.";
const LOG = "[whatsapp-webhook]";

function ok200(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200 });
}

async function sendReplySafe(
  instanceId: string,
  token: string,
  chatId: string,
  message: string
): Promise<void> {
  try {
    const r = await greenApiSendChatMessage(instanceId, token, chatId, message);
    if (!r.ok) console.warn(`${LOG} sendMessage FAILED:`, r.error);
    else console.info(`${LOG} sendMessage OK: "${message.slice(0, 40)}"`);
  } catch (e) {
    console.warn(`${LOG} sendMessage exception:`, e);
  }
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.WEBHOOK_SECRET ?? "";
  if (!token || token !== expected) {
    console.warn(`${LOG} Unauthorized — token mismatch`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: unknown;
    try { body = await req.json(); } catch {
      console.warn(`${LOG} JSON parse failed`);
      return ok200();
    }

    if (!body || typeof body !== "object") return ok200();

    const b = body as Record<string, unknown>;
    const webhookType = String(b.typeWebhook ?? "");
    console.info(`${LOG} received typeWebhook="${webhookType}"`);

    if (
      b.typeWebhook !== "incomingMessageReceived" &&
      b.typeWebhook !== "outgoingMessageReceived"
    ) return ok200();

    const instanceData = b.instanceData as Record<string, unknown> | undefined;
    const idInstanceRaw = instanceData?.idInstance;
    const instanceId = idInstanceRaw != null ? String(idInstanceRaw).trim() : "";
    console.info(`${LOG} instanceId="${instanceId}" type="${webhookType}"`);

    const admin = createAdminClient();
    if (!admin || !instanceId) {
      console.warn(`${LOG} missing admin client or instanceId`);
      return ok200();
    }

    const { data: settings } = await admin
      .from("user_settings")
      .select("user_id, wa_market_group_id, green_api_token")
      .eq("green_api_id", instanceId)
      .limit(1)
      .maybeSingle();

    const greenApiToken = String(settings?.green_api_token ?? "").trim();
    const userId = settings?.user_id as string | undefined;
    const configuredGroup = String(settings?.wa_market_group_id ?? "").trim();

    if (!greenApiToken || !userId) {
      console.warn(`${LOG} no settings found for instanceId="${instanceId}"`);
      return ok200();
    }

    const senderData = b.senderData as Record<string, unknown> | undefined;
    const chatId = String(senderData?.chatId ?? b.chatId ?? "").trim();
    const idMessage = String(b.idMessage ?? "").trim();

    console.info(`${LOG} chatId="${chatId}" configuredGroup="${configuredGroup}" idMessage="${idMessage}"`);

    await admin.from("sys_logs").insert({
      level: "INFO",
      module: "whatsapp-webhook",
      message: "message received",
      metadata: { chatId, configuredGroup, typeWebhook: webhookType, idMessage },
    }).then(() => {});

    if (!chatId || !configuredGroup || chatId !== configuredGroup) {
      await admin.from("sys_logs").insert({
        level: "WARN",
        module: "whatsapp-webhook",
        message: "chatId mismatch",
        metadata: { chatId, configuredGroup, typeWebhook: webhookType, idMessage },
      }).then(() => {});
      return ok200();
    }

    if (!idMessage) return ok200();

    // ── חילוץ טקסט ותמונה ──────────────────────────────────────────
    const text = extractTextFromGreenIncomingWebhookMessageData(b.messageData);
    const imageUrl = extractImageUrlFromMessageData(b.messageData);

    console.info(`${LOG} text="${text?.slice(0, 80) ?? "(empty)"}" imageUrl=${imageUrl ? "yes" : "no"}`);

    // ── תמונה בלי כיתוב — שמור כ-pending ──────────────────────────
    if (!text && imageUrl) {
      const sku = generateSku(marketSkuPrefix);
      await admin.from("market_torah_books").insert({
        user_id: userId,
        sku,
        source_message_id: idMessage,
        market_stage: "image_pending",
        handwriting_image_url: imageUrl,
        currency: "ILS",
        asking_price: null,
      });
      await sendReplySafe(instanceId, greenApiToken, chatId, MSG_IMAGE_ACK);
      await admin.from("sys_logs").insert({
        level: "INFO", module: "whatsapp-webhook",
        message: "image_pending saved", metadata: { sku, idMessage },
      }).then(() => {});
      return ok200();
    }

    // ── אין לא טקסט ולא תמונה ──────────────────────────────────────
    if (!text) {
      console.info(`${LOG} no text, no image — ignoring`);
      return ok200();
    }

    // ── יש טקסט — מנסה לפענח ──────────────────────────────────────
    await sendReplySafe(instanceId, greenApiToken, chatId, "⏳ מעבד...");

    const parsed = parseMarketTorahMessage(text);
    console.info(`${LOG} parsed=${JSON.stringify(parsed)}`);
    await admin.from("sys_logs").insert({
      level: "INFO", module: "whatsapp-webhook",
      message: "parsed", metadata: { text: text.slice(0, 200), parsed },
    }).then(() => {});

    if (!parsedMessageIsActionable(parsed)) {
      const missing = listMissingParseFields(parsed);
      const failMsg = `❌ נכשל — חסר: ${missing.join(" | ")}`;
      await admin.from("sys_logs").insert({
        level: "WARN", module: "whatsapp-webhook",
        message: "not actionable", metadata: { parsed, missing },
      }).then(() => {});
      await sendReplySafe(instanceId, greenApiToken, chatId, failMsg);
      return ok200();
    }

    const askFull = parsed.asking_price_full_shekels!;
    const askDb = marketKToDb(marketDbToK(askFull));
    const sku = generateSku(marketSkuPrefix);

    // ── בדוק אם יש pending image מאותו user ב-24 השעות האחרונות ────
    const oneHourAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: pendingRow } = await admin
      .from("market_torah_books")
      .select("id, handwriting_image_url")
      .eq("user_id", userId)
      .eq("market_stage", "image_pending")
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let finalImageUrl = imageUrl ?? pendingRow?.handwriting_image_url ?? null;
    const successMsg = pendingRow ? MSG_OK_IMAGE : MSG_OK;

    if (pendingRow) {
      // עדכן את השורה הממתינה
      const { error: updErr } = await admin
        .from("market_torah_books")
        .update({
          source_message_id: idMessage,
          market_stage: "new",
          external_sofer_name: parsed.owner_name ?? null,
          script_type: parsed.script_type,
          torah_size: parsed.torah_size,
          asking_price: askDb,
          expected_completion_date: parsed.ready_date ?? null,
          handwriting_image_url: finalImageUrl,
        })
        .eq("id", pendingRow.id);

      if (updErr) {
        console.error(`${LOG} update pending error:`, updErr);
        await sendReplySafe(instanceId, greenApiToken, chatId, "❌ שגיאת DB בעדכון");
        return ok200();
      }
    } else {
      // הכנס רשומה חדשה
      const { error: insErr } = await admin.from("market_torah_books").insert({
        user_id: userId,
        sku,
        source_message_id: idMessage,
        market_stage: "new",
        external_sofer_name: parsed.owner_name ?? null,
        script_type: parsed.script_type,
        torah_size: parsed.torah_size,
        asking_price: askDb,
        target_brokerage_price: null,
        currency: "ILS",
        expected_completion_date: parsed.ready_date ?? null,
        handwriting_image_url: finalImageUrl,
        sofer_id: null,
        dealer_id: null,
        parchment_type: null,
        influencer_style: null,
        notes: null,
        last_contact_date: null,
        negotiation_notes: null,
      });

      if (insErr) {
        if (insErr.code === "23505") {
          await sendReplySafe(instanceId, greenApiToken, chatId, MSG_OK);
        } else {
          console.error(`${LOG} insert error:`, insErr);
          await admin.from("sys_logs").insert({
            level: "ERROR", module: "whatsapp-webhook",
            message: "insert failed", metadata: { code: insErr.code, details: insErr.message },
          }).then(() => {});
          await sendReplySafe(instanceId, greenApiToken, chatId, "❌ שגיאת DB");
        }
        return ok200();
      }
    }

    console.info(`${LOG} success — ${pendingRow ? "updated pending" : "inserted new"}`);
    await admin.from("sys_logs").insert({
      level: "INFO", module: "whatsapp-webhook",
      message: "insert success", metadata: { sku, idMessage, withImage: !!finalImageUrl },
    }).then(() => {});
    await sendReplySafe(instanceId, greenApiToken, chatId, successMsg);
    return ok200();

  } catch (e) {
    console.error(`${LOG} unhandled exception:`, e);
    return ok200();
  }
}
