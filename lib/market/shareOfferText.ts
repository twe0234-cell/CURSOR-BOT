import { displayTorahMarketOwner } from "@/lib/market/displayOwner";

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

/** מחירים במאגר/שורה כבר ביחידות K (אלפי ₪) — תצוגה עקבית עם המאגר */
function fmtK(n: number) {
  return Number.isInteger(n)
    ? n.toLocaleString("he-IL")
    : n.toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

/**
 * הצעת מחיר מפורטת ללקוח (עברית) — כולל בעלים/סופר חיצוני כשמצוין,
 * בלי לחשוף פרטי תיווך פנימיים.
 */
export function buildMarketTorahQuoteText(row: {
  sku: string | null;
  torah_size: string | null;
  script_type: string | null;
  parchment_type: string | null;
  influencer_style: string | null;
  asking_price: number | null;
  notes: string | null;
  negotiation_notes: string | null;
  external_sofer_name: string | null;
  sofer_name: string | null;
  dealer_name: string | null;
  dealer_id: string | null;
}): string {
  const owner = displayTorahMarketOwner(row);

  const lines: string[] = [];
  lines.push("הצעת מחיר — ספר תורה");
  lines.push("━━━━━━━━━━━━━━━━");
  lines.push("");
  if (row.sku) lines.push(`מק״ט: ${row.sku}`);
  if (owner !== "—") lines.push(`בעלים / סופר (לפי הפרסום): ${owner}`);
  if (row.torah_size) lines.push(`גודל ספר תורה: ${row.torah_size} ס״מ`);
  if (row.script_type) lines.push(`סוג כתב: ${row.script_type}`);
  if (row.parchment_type) lines.push(`סוג קלף: ${row.parchment_type}`);
  if (row.influencer_style?.trim()) {
    lines.push(`סגנון / דגש: ${row.influencer_style.trim()}`);
  }
  if (row.asking_price != null) {
    lines.push(`מחיר מבוקש: ${fmtK(row.asking_price)} אלף ₪ (לפני מע״מ לפי העסקה)`);
  }
  lines.push("");
  if (row.negotiation_notes?.trim()) {
    lines.push("פרטי משא ומתן (פנימי לציטוט):");
    lines.push(row.negotiation_notes.trim());
    lines.push("");
  }
  if (row.notes?.trim()) {
    lines.push("הערות נוספות:");
    lines.push(row.notes.trim());
    lines.push("");
  }
  lines.push("לפרטים נוספים — נשמח לעמוד לשירותכם.");
  return lines.join("\n");
}

/** קישור לעמוד קמפיין עם מילוי טקסט (גוף כטקסט פשוט; יומר ל-HTML בצד הלקוח) */
export function emailCampaignsPrefillPath(subject: string, bodyPlain: string): string {
  const s = encodeURIComponent(subject);
  const b = encodeURIComponent(bodyPlain);
  return `/email/campaigns?prefillSubject=${s}&prefillBody=${b}`;
}
