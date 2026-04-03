import { type NextRequest, NextResponse } from "next/server";
import {
  extractTextFromGreenIncomingWebhookMessageData,
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

const MSG_OK   = "✅ נקלט בהצלחה";
const MSG_FAIL = "❌ נכשל — לא זוהה פורמט תקין";
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
    if (!r.ok) {
      console.warn(`${LOG} sendMessage FAILED:`, r.error);
    } else {
      console.info(`${LOG} sendMessage OK: "${message}"`);
    }
  } catch (e) {
    console.warn(`${LOG} sendMessage exception:`, e);
  }
}

/**
 * Green API → סנכרון מאגר ס״ת:
 * `incomingMessageReceived` | `outgoingMessageReceived` (הודעות מהטלפון של המשתמש לקבוצה).
 * מבנה messageData זהה בשני הסוגים.
 * אימות: `?token=` חייב להתאים ל־WEBHOOK_SECRET; אחרת 401 (ללא עיבוד גוף הבקשה).
 * לאחר אימות — תמיד 200 בתגובה ל־Green API כדי למנוע retries אינסופיים.
 * רשומות נשמרות ב־`market_torah_books` (מאגר השוק — אין טבלת market_inventory).
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.WEBHOOK_SECRET ?? "";
  if (!token || token !== expected) {
    console.warn(`${LOG} Unauthorized — token mismatch`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      console.warn(`${LOG} JSON parse failed`);
      return ok200();
    }

    if (!body || typeof body !== "object") {
      console.warn(`${LOG} body not an object`);
      return ok200();
    }

    const b = body as Record<string, unknown>;
    const webhookType = String(b.typeWebhook ?? "");

    // לוג על כל סוג שמגיע — לאבחון
    console.info(`${LOG} received typeWebhook="${webhookType}"`);

    if (
      b.typeWebhook !== "incomingMessageReceived" &&
      b.typeWebhook !== "outgoingMessageReceived"
    ) {
      // סוגים אחרים (statusMessage, deviceInfo וכו') — לא מעבד
      return ok200();
    }

    const instanceData = b.instanceData as Record<string, unknown> | undefined;
    const idInstanceRaw = instanceData?.idInstance;
    const instanceId =
      idInstanceRaw !== undefined && idInstanceRaw !== null
        ? String(idInstanceRaw).trim()
        : "";

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

    // chatId: נמצא ב-senderData.chatId (incoming) או ישירות ב-b.chatId (outgoing fallback)
    const senderData = b.senderData as Record<string, unknown> | undefined;
    const chatId = String(senderData?.chatId ?? b.chatId ?? "").trim();
    const idMessage = String(b.idMessage ?? "").trim();

    console.info(`${LOG} chatId="${chatId}" configuredGroup="${configuredGroup}" idMessage="${idMessage}"`);

    // לוג: הגענו לבדיקת chatId
    await admin.from("sys_logs").insert({
      level: "INFO",
      module: "whatsapp-webhook",
      message: "message received",
      metadata: { chatId, configuredGroup, typeWebhook: webhookType, idMessage },
    }).then(() => {});

    if (!chatId || !configuredGroup || chatId !== configuredGroup) {
      console.info(`${LOG} chatId mismatch — skipping. chatId="${chatId}" expected="${configuredGroup}"`);
      await admin.from("sys_logs").insert({
        level: "WARN",
        module: "whatsapp-webhook",
        message: "chatId mismatch",
        metadata: { chatId, configuredGroup, typeWebhook: webhookType, idMessage },
      }).then(() => {});
      return ok200();
    }

    if (!idMessage) {
      console.warn(`${LOG} missing idMessage`);
      return ok200();
    }

    // תגובה מיידית — לפני עיבוד
    await sendReplySafe(instanceId, greenApiToken, chatId, "⏳ מעבד...");

    const text = extractTextFromGreenIncomingWebhookMessageData(b.messageData);
    console.info(`${LOG} extracted text="${text?.slice(0, 80) ?? "(empty)"}"`);

    if (!text) {
      console.info(`${LOG} no text — sending FAIL reaction`);
      await admin.from("sys_logs").insert({
        level: "WARN",
        module: "whatsapp-webhook",
        message: "no text extracted",
        metadata: { idMessage },
      }).then(() => {});
      await sendReplySafe(instanceId, greenApiToken, chatId, MSG_FAIL);
      return ok200();
    }

    const parsed = parseMarketTorahMessage(text);
    console.info(`${LOG} parsed=${JSON.stringify(parsed)}`);
    await admin.from("sys_logs").insert({
      level: "INFO",
      module: "whatsapp-webhook",
      message: "parsed",
      metadata: { text: text.slice(0, 200), parsed },
    }).then(() => {});

    if (!parsedMessageIsActionable(parsed)) {
      const missing = listMissingParseFields(parsed);
      const failMsg = `❌ נכשל — חסר: ${missing.join(" | ")}`;
      console.info(`${LOG} not actionable: ${failMsg}`);
      await admin.from("sys_logs").insert({
        level: "WARN",
        module: "whatsapp-webhook",
        message: "not actionable",
        metadata: { parsed, missing },
      }).then(() => {});
      await sendReplySafe(instanceId, greenApiToken, chatId, failMsg);
      return ok200();
    }

    const askFull = parsed.asking_price_full_shekels!;
    const askDb = marketKToDb(marketDbToK(askFull));
    const sku = generateSku(marketSkuPrefix);

    console.info(`${LOG} inserting to market_torah_books sku=${sku} askFull=${askFull}`);

    const { error: insErr } = await admin.from("market_torah_books").insert({
      user_id: userId,
      sku,
      source_message_id: idMessage,
      sofer_id: null,
      dealer_id: null,
      external_sofer_name: parsed.owner_name ?? null,
      script_type: parsed.script_type,
      torah_size: parsed.torah_size,
      parchment_type: null,
      influencer_style: null,
      asking_price: askDb,
      target_brokerage_price: null,
      currency: "ILS",
      expected_completion_date: parsed.ready_date ?? null,
      notes: null,
      last_contact_date: null,
      negotiation_notes: null,
      handwriting_image_url: null,
    });

    if (insErr) {
      if (insErr.code === "23505") {
        console.info(`${LOG} duplicate message (23505) — sending OK reaction`);
        await sendReplySafe(instanceId, greenApiToken, chatId, MSG_OK);
      } else {
        console.error(`${LOG} insert error:`, insErr);
        await admin.from("sys_logs").insert({
          level: "ERROR",
          module: "whatsapp-webhook",
          message: "insert failed",
          metadata: { code: insErr.code, details: insErr.message },
        }).then(() => {});
        await sendReplySafe(instanceId, greenApiToken, chatId, MSG_FAIL);
      }
      return ok200();
    }

    console.info(`${LOG} insert success — sending OK reaction`);
    await admin.from("sys_logs").insert({
      level: "INFO",
      module: "whatsapp-webhook",
      message: "insert success",
      metadata: { sku, idMessage },
    }).then(() => {});
    await sendReplySafe(instanceId, greenApiToken, chatId, MSG_OK);
    return ok200();
  } catch (e) {
    console.error(`${LOG} unhandled exception:`, e);
    return ok200();
  }
}
