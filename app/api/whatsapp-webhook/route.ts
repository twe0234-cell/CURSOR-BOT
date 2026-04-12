import { type NextRequest, NextResponse } from "next/server";
import {
  extractTextFromGreenIncomingWebhookMessageData,
  extractImageUrlFromMessageData,
  greenApiSetMessageReaction,
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

function normalizeWaId(raw: string): string {
  return normalizeWhatsAppChatId(raw).trim().toLowerCase();
}

/**
 * Green API → סנכרון מאגר ס״ת.
 * מעבדים `incomingMessageReceived` + `outgoingMessageReceived` (כדי לייבא גם הודעות שנשלחו ע"י המשתמש לקבוצה).
 * תגובת אימוג׳י נשלחת לכל הודעה (incoming ו-outgoing) — אין סכנת לולאה כי SetMessageReaction
 * מחזיר webhook מסוג `outgoingReactionReceived` שאינו מעובד כאן.
 * אימות: `?token=` חייב להתאים ל־WEBHOOK_SECRET; אחרת 401.
 * לאחר אימות — תמיד 200 ל-Green API.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.WEBHOOK_SECRET ?? "";
  if (!token || token !== expected) {
    // Log auth failure to help diagnose token mismatch
    console.warn("[whatsapp-webhook] 401 token mismatch — received:", token?.slice(0, 6), "expected_len:", expected.length);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Helper: write diagnostic entry to sys_logs (fire-and-forget)
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
      // Other webhook types (status, qr, reaction, etc.) — silently ignore
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

    await dbg("processing message", { typeWebhook, idMessage, textLen: text.length, hasImage: !!imageUrl, senderId });

    // תמונה בלי כיתוב = ספר תורה ממתין לפרטים (image_pending) — שומרים sender_wa_id לשיוך עתידי עם טקסט
    if (!text && imageUrl) {
      await dbg("image-only — creating image_pending entry", { idMessage, senderId });
      const skuImg = generateSku(marketSkuPrefix);
      const { error: imgErr } = await admin.from("market_torah_books").insert({
        user_id: userId,
        sku: skuImg,
        source_message_id: idMessage,
        sofer_id: null, dealer_id: null, external_sofer_name: null,
        script_type: null, torah_size: null, parchment_type: null, influencer_style: null,
        asking_price: null, target_brokerage_price: null, currency: "ILS",
        expected_completion_date: null, notes: null, last_contact_date: null,
        negotiation_notes: null, handwriting_image_url: imageUrl,
        market_stage: "image_pending",
        sender_wa_id: senderId || null,
      });
      if (!imgErr || imgErr.code === "23505") {
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
      } else {
        await dbg("image-only insert error", { code: imgErr.code, message: imgErr.message });
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_FAIL);
      }
      return ok200();
    }

    if (!text) {
      await dbg("skip: no text and no image");
      await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_FAIL);
      return ok200();
    }

    const parsed = parseMarketTorahMessage(text);
    if (!parsedMessageIsActionable(parsed)) {
      await dbg("not-actionable", { parsed });
      await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_FAIL);
      return ok200();
    }

    const askFull = parsed.asking_price_full_shekels!;
    const askDb = marketKToDb(marketDbToK(askFull));
    const sku = generateSku(marketSkuPrefix);
    const torahSizeDb =
      parsed.torah_size != null && ALLOWED_MARKET_TORAH_SIZES.has(parsed.torah_size)
        ? parsed.torah_size
        : null;

    // ─── שיוך בעלים — match לאיש קשר קיים, או יצירה אוטומטית ───────────────
    const ownerName = parsed.owner_name?.trim() ?? null;
    let soferId: string | null = null;
    if (ownerName) {
      const { data: existing } = await admin
        .from("crm_contacts")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", ownerName)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        soferId = existing.id as string;
        await dbg("contact matched by name", { name: ownerName, contactId: soferId });
      } else {
        // יצירת איש קשר חדש אוטומטית
        const { data: created, error: createErr } = await admin
          .from("crm_contacts")
          .insert({ user_id: userId, name: ownerName, wa_chat_id: senderId || null })
          .select("id")
          .maybeSingle();
        if (!createErr && created?.id) {
          soferId = created.id as string;
          await dbg("contact auto-created", { name: ownerName, contactId: soferId });
        } else if (createErr) {
          await dbg("contact create failed", { name: ownerName, error: createErr.message });
        }
      }
    }

    // ─── שיוך תמונה ממתינה — תמונה + טקסט שנשלחו בנפרד ─────────────────────
    if (senderId && !imageUrl) {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: pendingImg } = await admin
        .from("market_torah_books")
        .select("id")
        .eq("user_id", userId)
        .eq("market_stage", "image_pending")
        .eq("sender_wa_id", senderId)
        .gte("created_at", thirtyMinutesAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingImg?.id) {
        const { error: updateErr } = await admin
          .from("market_torah_books")
          .update({
            source_message_id: idMessage,
            script_type: parsed.script_type,
            torah_size: torahSizeDb,
            asking_price: askDb,
            expected_completion_date: parsed.ready_date ?? null,
            external_sofer_name: ownerName,
            sofer_id: soferId,
            market_stage: "new",
          })
          .eq("id", pendingImg.id as string);

        if (!updateErr || updateErr.code === "23505") {
          await dbg("combined text with pending image", { bookId: pendingImg.id, idMessage });
          await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
          return ok200();
        }
        await dbg("image_pending update failed — falling through to insert", { code: updateErr.code, message: updateErr.message });
      }
    }

    // ─── הוספת רשומה חדשה ────────────────────────────────────────────────────
    const { error: insErr } = await admin.from("market_torah_books").insert({
      user_id: userId,
      sku,
      source_message_id: idMessage,
      sofer_id: soferId,
      dealer_id: null,
      external_sofer_name: ownerName,
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
      sender_wa_id: senderId || null,
    });

    if (insErr) {
      if (insErr.code === "23505") {
        await dbg("duplicate source_message_id — reacting OK", { idMessage });
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
      } else {
        await dbg("insert error", { code: insErr.code, message: insErr.message });
        console.error("[whatsapp-webhook] market_torah_books insert:", insErr);
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_FAIL);
      }
      return ok200();
    }

    await dbg("success — inserted", { sku, idMessage, ownerName, soferId });
    await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
    return ok200();
  } catch (e) {
    console.error("[whatsapp-webhook] unhandled:", e);
    await dbg("unhandled-error", { error: String(e) });
    return ok200();
  }
}
