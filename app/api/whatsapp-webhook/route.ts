import { type NextRequest, NextResponse } from "next/server";
import {
  extractTextFromGreenIncomingWebhookMessageData,
  extractImageUrlFromMessageData,
  greenApiSetMessageReaction,
  greenApiSendChatMessage,
  normalizeWhatsAppChatId,
} from "@/lib/whatsapp/greenApi";
import { logWarn } from "@/lib/logger";
import { marketDbToK, marketKToDb } from "@/lib/market/kPricing";
import { generateSku, marketSkuPrefix } from "@/lib/sku";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  parseMarketTorahMessage,
  parsedMessageIsActionable,
} from "@/src/lib/market/parseWhatsAppMarketMessage";
import { STAM_SEFER_TORAH_SIZES } from "@/src/lib/stam/catalog";

export const dynamic = "force-dynamic";

const REACTION_OK = "✅";
const REACTION_FAIL = "❌";

/**
 * סמן בלתי נראה בתחילת כל הודעת בוט — מונע לולאה אינסופית.
 * כאשר הבוט שולח הודעה לקבוצה, היא חוזרת כ-outgoingMessageReceived.
 * אם הטקסט מתחיל ב-\u200B, הבוט מדלג עליה ואינו מנסה לעבד אותה.
 */
const BOT_MESSAGE_MARKER = "\u200B";

const ALLOWED_MARKET_TORAH_SIZES = new Set<string>(STAM_SEFER_TORAH_SIZES);

function ok200(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200 });
}

async function sendReactionSafe(
  instanceId: string,
  token: string,
  chatId: string,
  idMessage: string,
  reaction: string
): Promise<void> {
  try {
    const r = await greenApiSetMessageReaction(instanceId, token, chatId, idMessage, reaction);
    if (!r.ok) {
      console.warn("[whatsapp-webhook] SetMessageReaction failed:", r.error);
    }
  } catch (e) {
    console.warn("[whatsapp-webhook] SetMessageReaction error:", e);
  }
}

async function sendTextSafe(
  instanceId: string,
  token: string,
  chatId: string,
  message: string
): Promise<void> {
  try {
    const r = await greenApiSendChatMessage(instanceId, token, chatId, BOT_MESSAGE_MARKER + message);
    if (!r.ok) {
      console.warn("[whatsapp-webhook] sendMessage failed:", r.error);
    }
  } catch (e) {
    console.warn("[whatsapp-webhook] sendMessage error:", e);
  }
}

function normalizeWaId(raw: string): string {
  return normalizeWhatsAppChatId(raw).trim().toLowerCase();
}

function formatPrice(shekels: number): string {
  return shekels >= 1000
    ? `${(shekels / 1000).toLocaleString("he-IL")}K ₪`
    : `${shekels.toLocaleString("he-IL")} ₪`;
}

/**
 * Green API → סנכרון מאגר ס״ת.
 * מעבדים `incomingMessageReceived` + `outgoingMessageReceived` (כדי לייבא גם הודעות שנשלחו ע"י המשתמש לקבוצה).
 * תגובת אימוג׳י + הודעת טקסט נשלחות אחרי כל עיבוד.
 * מניעת לולאה: הודעות בוט מתחילות ב-\u200B ומדולגות בעת עיבוד.
 * אימות: `?token=` חייב להתאים ל־WEBHOOK_SECRET; אחרת 401.
 * לאחר אימות — תמיד 200 ל-Green API.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.WEBHOOK_SECRET ?? "";
  if (!token || token !== expected) {
    console.warn("[whatsapp-webhook] 401 token mismatch — received:", token?.slice(0, 6), "expected_len:", expected.length);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const dbg = (message: string, metadata?: Record<string, unknown>) => {
    if (!admin) return;
    void admin.from("sys_logs").insert({ level: "DEBUG", module: "whatsapp-webhook", message, metadata: metadata ?? {} });
  };

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      await dbg("parse-error: failed to parse JSON body");
      return ok200();
    }

    if (!body || typeof body !== "object") {
      await dbg("parse-error: body not object");
      return ok200();
    }

    const b = body as Record<string, unknown>;

    const typeWebhook = String(b.typeWebhook ?? "");
    const isIncoming = typeWebhook === "incomingMessageReceived";
    const isOutgoing = typeWebhook === "outgoingMessageReceived";

    await dbg("received", { typeWebhook, idMessage: b.idMessage });

    if (!isIncoming && !isOutgoing) {
      return ok200();
    }

    const instanceData = b.instanceData as Record<string, unknown> | undefined;
    const idInstanceRaw = instanceData?.idInstance;
    const instanceId =
      idInstanceRaw !== undefined && idInstanceRaw !== null
        ? String(idInstanceRaw).trim()
        : "";

    if (!admin || !instanceId) {
      await dbg("skip: no admin or instanceId", { instanceId });
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
      await dbg("skip: no settings for instanceId", { instanceId, found: !!settings });
      return ok200();
    }

    const senderData = b.senderData as Record<string, unknown> | undefined;
    const chatIdRaw = String(senderData?.chatId ?? b.chatId ?? "").trim();
    const chatIdNorm = normalizeWaId(chatIdRaw);
    const configuredGroupNorm = normalizeWaId(configuredGroup);

    if (!chatIdNorm || !configuredGroupNorm || chatIdNorm !== configuredGroupNorm) {
      logWarn("whatsapp-webhook", "chatId mismatch - ignoring", {
        user_id: userId,
        chatId: chatIdRaw || null,
        chatIdNorm: chatIdNorm || null,
        configuredGroup: configuredGroup || null,
        configuredGroupNorm: configuredGroupNorm || null,
      });
      return ok200();
    }

    const chatId = normalizeWhatsAppChatId(chatIdRaw);

    const instanceWid = normalizeWaId(String(instanceData?.wid ?? ""));
    const senderId = normalizeWaId(String(senderData?.sender ?? ""));
    // outgoingMessageReceived may miss senderData.sender; fall back to instance WID
    // so image->text messages sent by the same account can still be merged.
    const senderMergeId = senderId || (isOutgoing ? instanceWid : "");

    if (!senderId && isIncoming) {
      await dbg("skip: incoming with no sender", { typeWebhook });
      return ok200();
    }

    if (isIncoming && instanceWid && senderId === instanceWid) {
      await dbg("skip: incoming self-message (echo)", { senderId, instanceWid });
      return ok200();
    }

    const idMessage = String(b.idMessage ?? "").trim();
    if (!idMessage) {
      await dbg("skip: no idMessage");
      return ok200();
    }

    const text = extractTextFromGreenIncomingWebhookMessageData(b.messageData);
    const imageUrl = extractImageUrlFromMessageData(b.messageData);

    // מניעת לולאה: דלג על הודעות שנשלחו ע"י הבוט עצמו
    if (text.startsWith(BOT_MESSAGE_MARKER)) {
      await dbg("skip: bot's own message (loop guard)", { idMessage });
      return ok200();
    }

    await dbg("processing message", { typeWebhook, idMessage, textLen: text.length, hasImage: !!imageUrl });

    // תמונה בלי כיתוב = ספר תורה ממתין לפרטים (image_pending)
    if (!text && imageUrl) {
      await dbg("image-only — creating image_pending entry", { idMessage });
      const skuImg = generateSku(marketSkuPrefix);
      const { error: imgErr } = await admin.from("market_torah_books").insert({
        user_id: userId,
        sku: skuImg,
        source_message_id: idMessage,
        sender_wa_id: senderMergeId || null,
        sofer_id: null, dealer_id: null, external_sofer_name: null,
        script_type: null, torah_size: null, parchment_type: null, influencer_style: null,
        asking_price: null, target_brokerage_price: null, currency: "ILS",
        expected_completion_date: null, notes: null, last_contact_date: null,
        negotiation_notes: null, handwriting_image_url: imageUrl,
        market_stage: "image_pending",
      });
      if (!imgErr || imgErr.code === "23505") {
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
        await sendTextSafe(instanceId, greenApiToken, chatId, `📷 תמונה נשמרה במאגר (${skuImg}) — ממתין לפרטים`);
      } else {
        await dbg("image-only insert error", { code: imgErr.code, message: imgErr.message });
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_FAIL);
        await sendTextSafe(instanceId, greenApiToken, chatId, `❌ שגיאה בשמירת התמונה (${imgErr.code})`);
      }
      return ok200();
    }

    if (!text) {
      await dbg("skip: no text and no image");
      return ok200();
    }

    const parsed = parseMarketTorahMessage(text);
    if (!parsedMessageIsActionable(parsed)) {
      await dbg("not-actionable", { parsed });
      // לא שולחים ❌ על הודעות רגילות שלא בפורמט ס"ת
      return ok200();
    }

    const askFull = parsed.asking_price_full_shekels!;
    const askDb = marketKToDb(marketDbToK(askFull));
    const sku = generateSku(marketSkuPrefix);
    const torahSizeDb =
      parsed.torah_size != null && ALLOWED_MARKET_TORAH_SIZES.has(parsed.torah_size)
        ? parsed.torah_size
        : null;

    // טקסט אחרי תמונה מאותו שולח — ממזגים לרשומת image_pending במקום שורה כפולה
    if (senderMergeId) {
      const { data: pending } = await admin
        .from("market_torah_books")
        .select("id, handwriting_image_url")
        .eq("user_id", userId)
        .eq("sender_wa_id", senderMergeId)
        .eq("market_stage", "image_pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pending?.id) {
        const { error: upErr } = await admin
          .from("market_torah_books")
          .update({
            source_message_id: idMessage,
            script_type: parsed.script_type,
            torah_size: torahSizeDb,
            parchment_type: null,
            influencer_style: null,
            asking_price: askDb,
            target_brokerage_price: null,
            handwriting_image_url: pending.handwriting_image_url ?? imageUrl ?? null,
            market_stage: "new",
            updated_at: new Date().toISOString(),
          })
          .eq("id", pending.id)
          .eq("user_id", userId);

        if (!upErr) {
          await dbg("merged text into image_pending", { bookId: pending.id, idMessage });
          await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
          return ok200();
        }
        await dbg("merge image_pending failed", { code: upErr.code, message: upErr.message });
      }
    }

    const { error: insErr } = await admin.from("market_torah_books").insert({
      user_id: userId,
      sku,
      source_message_id: idMessage,
      sender_wa_id: senderMergeId || null,
      sofer_id: null,
      dealer_id: null,
      external_sofer_name: parsed.owner_name ?? null,
      script_type: parsed.script_type,
      torah_size: torahSizeDb,
      parchment_type: null,
      influencer_style: null,
      asking_price: askDb,
      target_brokerage_price: null,
      currency: "ILS",
      expected_completion_date: parsed.ready_date ?? null,
      notes: null,
      last_contact_date: null,
      negotiation_notes: null,
      handwriting_image_url: imageUrl ?? null,
    });

    if (insErr) {
      if (insErr.code === "23505") {
        await dbg("duplicate sku — reacting OK", { idMessage });
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
        await sendTextSafe(instanceId, greenApiToken, chatId, `✅ כבר קיים במאגר`);
      } else {
        await dbg("insert error", { code: insErr.code, message: insErr.message });
        console.error("[whatsapp-webhook] market_torah_books insert:", insErr);
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_FAIL);
        await sendTextSafe(instanceId, greenApiToken, chatId, `❌ שגיאה בשמירה (${insErr.code}) — נסה שוב`);
      }
      return ok200();
    }

    // הצלחה — בנה הודעת אישור מפורטת
    const parts: string[] = [];
    if (parsed.script_type) parts.push(parsed.script_type);
    if (torahSizeDb) parts.push(`${torahSizeDb} עמודות`);
    if (parsed.owner_name) parts.push(`בעלים: ${parsed.owner_name}`);
    parts.push(formatPrice(askFull));
    if (parsed.ready_date) {
      const dateStr = new Date(parsed.ready_date).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
      parts.push(`מוכן: ${dateStr}`);
    }
    const summary = parts.join(" | ");

    await dbg("success — inserted", { sku, idMessage });
    await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
    await sendTextSafe(instanceId, greenApiToken, chatId, `✅ נשמר במאגר (${sku})\n${summary}`);
    return ok200();
  } catch (e) {
    console.error("[whatsapp-webhook] unhandled:", e);
    await dbg("unhandled-error", { error: String(e) });
    return ok200();
  }
}
