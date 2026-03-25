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
