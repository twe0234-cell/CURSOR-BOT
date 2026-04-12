/**
 * Pure utilities for email processing — no I/O, fully testable.
 * Used by: app/email/actions.ts, app/email/campaigns/actions.ts
 */

/** רגולרי ולידציה לכתובת אימייל (תואם ל-importEmailContacts) */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** נרמול כתובת אימייל: lowercase + trim */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * פיצול טקסט CSV/Tab לשורות עם עמודות.
 * תומך ב: "email,name", "email\tname", "email name" (רווח)
 * מסנן שורות ריקות ו-headers.
 */
export function parseEmailCsvText(raw: string): { email: string; name: string | null }[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      const email = parts[0] ?? "";
      const name = parts[1] ?? "";
      if (!isValidEmail(email)) return [];
      return [{ email: normalizeEmail(email), name: name || null }];
    });
}

/**
 * בניית URL מעקב ו-URL הסרת מנוי.
 * מאפשר בדיקות ישירות ללא תלות ב-env.
 */
export function buildEmailTrackingUrls(
  appUrl: string,
  logId: string | null
): { trackingPixelUrl: string; unsubscribeUrl: string } {
  const base = appUrl.replace(/\/$/, "");
  const id = logId || "noop";
  return {
    trackingPixelUrl: `${base}/api/email/track/${id}`,
    unsubscribeUrl: `${base}/api/email/unsubscribe/${id}`,
  };
}

/**
 * החלפת {{name}} בתוכן המייל בשם הנמען.
 * בטוח — אם name ריק מחזיר "" ולא "undefined".
 */
export function interpolateRecipientName(template: string, name: string): string {
  return template.replace(/\{\{name\}\}/g, name);
}

/**
 * זיהוי סוג מכשיר מה-User-Agent (תואם ל-track API route).
 */
export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export function detectDeviceType(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod|blackberry|windows phone/.test(ua)) return "mobile";
  if (/windows|macintosh|linux|x11/.test(ua)) return "desktop";
  return "unknown";
}
