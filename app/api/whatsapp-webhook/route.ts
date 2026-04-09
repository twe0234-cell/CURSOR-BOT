import { type NextRequest, NextResponse } from "next/server";
import {
  extractTextFromGreenIncomingWebhookMessageData,
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

export const dynamic = "force-dynamic";

const REACTION_OK = "✅";
const REACTION_FAIL = "❌";

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
 * כדי למנוע לולאה, תגובת אימוג׳י נשלחת רק להודעות incoming.
 * אימות: `?token=` חייב להתאים ל־WEBHOOK_SECRET; אחרת 401.
 * לאחר אימות — תמיד 200 ל-Green API.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.WEBHOOK_SECRET ?? "";
  if (!token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ok200();
    }

    if (!body || typeof body !== "object") {
      return ok200();
    }

    const b = body as Record<string, unknown>;

    const typeWebhook = String(b.typeWebhook ?? "");
    const isIncoming = typeWebhook === "incomingMessageReceived";
    const isOutgoing = typeWebhook === "outgoingMessageReceived";
    if (!isIncoming && !isOutgoing) {
      return ok200();
    }

    const instanceData = b.instanceData as Record<string, unknown> | undefined;
    const idInstanceRaw = instanceData?.idInstance;
    const instanceId =
      idInstanceRaw !== undefined && idInstanceRaw !== null
        ? String(idInstanceRaw).trim()
        : "";

    const admin = createAdminClient();
    if (!admin || !instanceId) {
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
        configuredGroup: configuredGroup || null,
      });
      return ok200();
    }

    const chatId = normalizeWhatsAppChatId(chatIdRaw);

    const instanceWid = normalizeWaId(String(instanceData?.wid ?? ""));
    const senderId = normalizeWaId(String(senderData?.sender ?? ""));

    if (!senderId && isIncoming) {
      return ok200();
    }

    if (isIncoming && instanceWid && senderId === instanceWid) {
      return ok200();
    }

    const idMessage = String(b.idMessage ?? "").trim();
    if (!idMessage) {
      return ok200();
    }

    const text = extractTextFromGreenIncomingWebhookMessageData(b.messageData);

    if (!text) {
      if (!isOutgoing) {
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_FAIL);
      }
      return ok200();
    }

    const parsed = parseMarketTorahMessage(text);
    if (!parsedMessageIsActionable(parsed)) {
      if (!isOutgoing) {
        await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_FAIL);
      }
      return ok200();
    }

    const askFull = parsed.asking_price_full_shekels!;
    const askDb = marketKToDb(marketDbToK(askFull));
    const sku = generateSku(marketSkuPrefix);

    const { error: insErr } = await admin.from("market_torah_books").insert({
      user_id: userId,
      sku,
      source_message_id: idMessage,
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
      handwriting_image_url: null,
    });

    if (insErr) {
      if (insErr.code === "23505") {
        if (!isOutgoing) {
          await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
        }
      } else {
        console.error("[whatsapp-webhook] market_torah_books insert:", insErr);
        if (!isOutgoing) {
          await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_FAIL);
        }
      }
      return ok200();
    }

    if (!isOutgoing) {
      await sendReactionSafe(instanceId, greenApiToken, chatId, idMessage, REACTION_OK);
    }
    return ok200();
  } catch (e) {
    console.error("[whatsapp-webhook] unhandled:", e);
    return ok200();
  }
}
