/** שדות נדרשים לטקסט שיתוף — ללא תלות ב-`actions` (server) */
export type MarketTorahShareFields = {
  sku: string | null;
  torah_size: string | null;
  script_type: string | null;
  parchment_type: string | null;
  asking_price: number | null;
  /** תיאור חופשי / הקשר שנכתב ידנית (יכול לכלול טקסט שנוצר ב-AI) */
  notes: string | null;
};

const fmt = (n: number) =>
  Number.isInteger(n)
    ? n.toLocaleString("he-IL")
    : n.toLocaleString("he-IL", { maximumFractionDigits: 0 });

/**
 * טקסט שיתוף נקי ללקוח קצה (וואטסאפ / מייל).
 * לא כולל שמות פנימיים (סוחר/סופר), מחיר תיווך יעד, או נתוני עלות.
 */
export function buildMarketTorahShareText(row: MarketTorahShareFields): string {
  const lines: string[] = [];

  lines.push("📜 ספר תורה להצעה");
  lines.push("");

  if (row.sku) lines.push(`📦 מק״ט: ${row.sku}`);
  if (row.torah_size) lines.push(`📏 גודל: ${row.torah_size} ס"מ`);
  if (row.script_type) lines.push(`✍️ כתב: ${row.script_type}`);
  if (row.parchment_type) lines.push(`📄 קלף: ${row.parchment_type}`);

  if (row.asking_price != null) {
    lines.push(`💰 מחיר: ${fmt(row.asking_price)} ₪`);
  }

  if (row.notes?.trim()) {
    lines.push("");
    lines.push(row.notes.trim());
  }

  lines.push("");
  lines.push("לפרטים נוספים — מוזמן לפנות 🙏");

  return lines.join("\n");
}

export function whatsappPrefillPath(message: string): string {
  return `/whatsapp?message=${encodeURIComponent(message)}`;
}

export function mailtoOfferHref(subject: string, body: string): string {
  const s = encodeURIComponent(subject);
  const b = encodeURIComponent(body);
  return `mailto:?subject=${s}&body=${b}`;
}
