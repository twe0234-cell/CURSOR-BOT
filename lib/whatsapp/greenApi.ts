/**
 * Random pause between Green API dispatches to reduce rate-limit / spam blocks (ms).
 */
export function greenApiDispatchSpacingDelayMs(): number {
  return 3000 + Math.floor(Math.random() * 2001);
}

/**
 * Green API expects chatId like 972501234567@c.us or group...@g.us
 */
export function normalizeWhatsAppChatId(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (s.includes("@g.us")) return s;

  let phonePart = s;
  if (s.includes("@c.us")) {
    phonePart = s.split("@c.us")[0] ?? s;
  } else if (s.includes("@") && !s.includes("@c.us")) {
    return s;
  }

  let digits = phonePart.replace(/\D/g, "");
  if (!digits) return s;

  if (digits.startsWith("972")) {
    return `${digits}@c.us`;
  }
  if (digits.startsWith("0") && digits.length >= 10) {
    digits = `972${digits.slice(1)}`;
    return `${digits}@c.us`;
  }
  if (digits.length >= 9 && digits.length <= 15) {
    return `${digits}@c.us`;
  }
  return s;
}

function extractJsonErrorMessage(body: string): string {
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    if (typeof j.message === "string" && j.message.length > 0) return j.message;
  } catch {
    /* ignore */
  }
  return body.slice(0, 500) || "שגיאה לא ידועה";
}

/**
 * Green API: success usually includes idMessage. Errors may be HTTP 4xx/5xx with JSON { message }.
 * Some edge cases return 200 with an error payload — treat missing idMessage + message as failure.
 */
export function interpretGreenApiSendResult(
  httpOk: boolean,
  body: string
): { ok: true } | { ok: false; error: string } {
  const trimmed = body.trim();
  if (!httpOk) {
    return { ok: false, error: extractJsonErrorMessage(trimmed) };
  }
  if (!trimmed) return { ok: true };
  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof j.idMessage === "string" && j.idMessage.length > 0) {
      return { ok: true };
    }
    const sc = j.statusCode;
    if (typeof sc === "number" && sc >= 400) {
      return { ok: false, error: String(j.message ?? trimmed) };
    }
    if (
      typeof j.message === "string" &&
      j.message.length > 0 &&
      (j.idMessage === undefined || j.idMessage === null || j.idMessage === "")
    ) {
      return { ok: false, error: j.message };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export function fileNameForImageUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop() || "image.jpg";
    if (/\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(base)) return base;
  } catch {
    /* ignore */
  }
  return "image.jpg";
}

const GREEN_API_BASE = "https://api.green-api.com";

/** מבנים מקוננים — Green-API (במיוחד outgoing) לעיתים שמים כיתוב תחת imageMessage וכו׳ */
export type GreenMediaCaption = { caption?: string | null } | null | undefined;

export type GreenChatHistoryMessage = {
  type?: string;
  typeMessage?: string;
  idMessage?: string;
  textMessage?: string;
  caption?: string;
  downloadUrl?: string;
  fileName?: string;
  mimeType?: string;
  extendedTextMessage?: { text?: string } | null;
  imageMessage?: GreenMediaCaption;
  videoMessage?: GreenMediaCaption;
  documentMessage?: GreenMediaCaption;
};

/**
 * היסטוריית צ׳אט (עד count הודעות, מהחדש לישן).
 * @see https://green-api.com/en/docs/api/journals/GetChatHistory/
 */
export async function greenApiGetChatHistory(
  instanceId: string,
  apiToken: string,
  chatId: string,
  count: number
): Promise<{ ok: true; messages: GreenChatHistoryMessage[] } | { ok: false; error: string }> {
  const url = `${GREEN_API_BASE}/waInstance${instanceId}/getChatHistory/${apiToken}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, count }),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: extractJsonErrorMessage(body) };
    }
    const data = JSON.parse(body) as unknown;
    if (!Array.isArray(data)) {
      return { ok: false, error: "תגובת getChatHistory לא במבנה מערך" };
    }
    return { ok: true, messages: data as GreenChatHistoryMessage[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאת רשת" };
  }
}

export async function greenApiSendChatMessage(
  instanceId: string,
  apiToken: string,
  chatId: string,
  message: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${GREEN_API_BASE}/waInstance${instanceId}/sendMessage/${apiToken}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    const body = await res.text();
    const interpreted = interpretGreenApiSendResult(res.ok, body);
    if (!interpreted.ok) return { ok: false, error: interpreted.error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאת רשת" };
  }
}

/**
 * תגובת אימוג׳י להודעה (למשל ✅ / ❌ אחרי עיבוד webhook).
 * @see https://green-api.com/en/docs/api/sending/SetMessageReaction/
 */
export async function greenApiSetMessageReaction(
  instanceId: string,
  apiToken: string,
  chatId: string,
  idMessage: string,
  reaction: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${GREEN_API_BASE}/waInstance${instanceId}/SetMessageReaction/${apiToken}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, idMessage, reaction }),
    });
    const body = await res.text();
    const interpreted = interpretGreenApiSendResult(res.ok, body);
    if (!interpreted.ok) return { ok: false, error: interpreted.error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאת רשת" };
  }
}

/**
 * חילוץ URL תמונה מ־messageData (imageMessageData).
 * מחזיר את downloadUrl אם קיים, אחרת null.
 */
export function extractImageUrlFromMessageData(messageData: unknown): string | null {
  if (!messageData || typeof messageData !== "object") return null;
  const md = messageData as Record<string, unknown>;
  const img = md.imageMessageData as Record<string, unknown> | undefined;
  if (!img) return null;
  const url = img.downloadUrl ?? img.jpegThumbnail;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

const pushTrim = (parts: string[], v: unknown) => {
  if (typeof v === "string" && v.trim()) parts.push(v.trim());
};

/**
 * חילוץ טקסט מ־messageData ב־webhook incomingMessageReceived (טקסט / מורחב / כיתוב מדיה).
 */
export function extractTextFromGreenIncomingWebhookMessageData(
  messageData: unknown
): string {
  if (!messageData || typeof messageData !== "object") return "";
  const md = messageData as Record<string, unknown>;
  const parts: string[] = [];

  const textMessageData = md.textMessageData as Record<string, unknown> | undefined;
  pushTrim(parts, textMessageData?.textMessage);

  const extendedTextMessageData = md.extendedTextMessageData as
    | Record<string, unknown>
    | undefined;
  pushTrim(parts, extendedTextMessageData?.text);

  for (const key of [
    "imageMessageData",
    "videoMessageData",
    "documentMessageData",
  ] as const) {
    const block = md[key] as Record<string, unknown> | undefined;
    pushTrim(parts, block?.caption);
  }

  return parts.join("\n").trim();
}
