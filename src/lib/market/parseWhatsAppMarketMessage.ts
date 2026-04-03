/**
 * פענוח הודעת WhatsApp למאגר ס״ת — פורמט קבוע, ירידת שורה כמפריד.
 *
 * פורמט:
 *   שורה 0 — כתב:      ארי | אר"י | ב"י | בי | ספרדי
 *   שורה 1 — גודל:     24 | 30 | 36 | 42 | 48 | 56 | אחר
 *   שורה 2 — בעלים:    שם חופשי (1–2 מילים) — אופציונלי
 *   שורה 3 — מוכן:     06/26 | 04.26 | "עוד חודש" | "עוד חצי שנה" — אופציונלי
 *   שורה 4 — מחיר:     מספר בלבד (165 = 165,000 ₪)
 */

export type ParsedMarketTorahMessage = {
  torah_size: string | null;
  script_type: string | null;
  owner_name: string | null;
  ready_date: string | null;
  /** שקלים מלאים */
  asking_price_full_shekels: number | null;
};

const TORAH_SIZES = new Set(["24", "30", "36", "42", "48", "56"]);

// ─── Script ────────────────────────────────────────────────────────────────

function parseScript(raw: string): string | null {
  const t = raw.trim();
  if (/^(ארי|אר[""״]י)$/u.test(t)) return "ארי";
  if (/^(ב[""״]י|בי|בית\s*יוסף)$/u.test(t)) return 'ב"י';
  if (/^ספרדי$/.test(t)) return "ספרדי";
  return null;
}

// ─── Size ──────────────────────────────────────────────────────────────────

function parseSize(raw: string): string | null {
  const t = raw.trim();
  if (TORAH_SIZES.has(t)) return t;
  if (t === "אחר") return "אחר";
  return null;
}

// ─── Ready date ────────────────────────────────────────────────────────────

/**
 * ממיר תיאור זמן לתאריך ISO `YYYY-MM-01`.
 * דוגמאות: "06/26" → "2026-06-01" | "עוד חודש" → חודש הבא
 */
function parseReadyDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  // MM/YY או MM.YY
  const shortDate = /^(\d{1,2})[./](\d{2})$/.exec(t);
  if (shortDate) {
    const month = parseInt(shortDate[1]!, 10);
    const year = 2000 + parseInt(shortDate[2]!, 10);
    if (month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-01`;
    }
  }

  // YYYY-MM-DD (ISO מלא)
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (isoDate) return t;

  // "עוד X" — חישוב יחסי
  const now = new Date();
  const addMonths = (n: number): string => {
    const d = new Date(now.getFullYear(), now.getMonth() + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };

  if (/עוד\s+חודש/.test(t)) return addMonths(1);
  if (/עוד\s+חודשיים/.test(t)) return addMonths(2);
  if (/עוד\s+שלושה\s+חודשים/.test(t)) return addMonths(3);
  if (/עוד\s+חצי\s+שנה/.test(t)) return addMonths(6);
  if (/עוד\s+שנה/.test(t)) return addMonths(12);

  return null;
}

// ─── Price ─────────────────────────────────────────────────────────────────

function parsePrice(raw: string): number | null {
  // strip ₪, ש"ח, פסיקים, נקודה בסוף
  const cleaned = raw
    .trim()
    .replace(/[₪,]/g, "")
    .replace(/ש[""״]ח/g, "")
    .replace(/\.$/, "")
    .trim();

  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;

  // 165 → 165,000 | 1500 → 1,500 (כבר שקלים)
  return n < 1000 ? Math.round(n * 1000) : Math.round(n);
}

// ─── Main ──────────────────────────────────────────────────────────────────

/**
 * פענוח הודעה — content-based (מזהה כל שורה לפי תוכן, לא מיקום).
 * מאפשר שדות אופציונליים ואפילו סדר שונה.
 *
 * אלגוריתם:
 * 1. כתב   — אם השורה מתאימה לאחד מהכתבים הידועים
 * 2. גודל  — אם השורה היא אחד מהגדלים הידועים או "אחר"
 * 3. תאריך — אם השורה נראית כתאריך (MM/YY, MM.YY, "עוד...")
 * 4. מחיר  — מספר שאינו גודל ידוע (≥ 10)
 * 5. בעלים — כל דבר אחר (מילה/שתיים)
 */
export function parseMarketTorahMessage(text: string): ParsedMarketTorahMessage {
  const normalized = text
    .replace(/\u200f|\u200e|\u202a|\u202b|\u202c/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);

  let script_type: string | null = null;
  let torah_size: string | null = null;
  let ready_date: string | null = null;
  let asking_price_full_shekels: number | null = null;
  let owner_name: string | null = null;

  for (const line of lines) {
    // כתב — בדיקה ראשונה (בוא לפני גודל)
    const script = parseScript(line);
    if (script !== null && script_type === null) {
      script_type = script;
      continue;
    }

    // גודל — מספר שהוא גודל ידוע או "אחר"
    const size = parseSize(line);
    if (size !== null && torah_size === null) {
      torah_size = size;
      continue;
    }

    // תאריך — MM/YY, MM.YY, "עוד..."
    const date = parseReadyDate(line);
    if (date !== null && ready_date === null) {
      ready_date = date;
      continue;
    }

    // מחיר — מספר שאינו גודל ידוע
    const price = parsePrice(line);
    if (price !== null && asking_price_full_shekels === null) {
      asking_price_full_shekels = price;
      continue;
    }

    // בעלים — כל שאר (מילה אחת או שתיים)
    if (owner_name === null && line.length > 0 && line.length <= 40) {
      owner_name = line;
    }
  }

  return { torah_size, script_type, owner_name, ready_date, asking_price_full_shekels };
}

// ─── Validation ────────────────────────────────────────────────────────────

/** האם יש מספיק נתונים לשמירת רשומה — מחיר בלבד מספיק */
export function parsedMessageIsActionable(p: ParsedMarketTorahMessage): boolean {
  return p.asking_price_full_shekels != null && p.asking_price_full_shekels > 0;
}

/** שדות חסרים (לדיבוג) */
export function listMissingParseFields(p: ParsedMarketTorahMessage): string[] {
  const missing: string[] = [];
  if (p.asking_price_full_shekels == null || p.asking_price_full_shekels <= 0)
    missing.push("מחיר (165 = 165,000)");
  return missing;
}

/** סיבות קצרות מדוע לא ניתן לייבא */
export function explainParseNotActionable(p: ParsedMarketTorahMessage): string[] {
  const reasons: string[] = [];
  const hasPrice = p.asking_price_full_shekels != null && p.asking_price_full_shekels > 0;
  const hasSizeOrScript = p.torah_size != null || p.script_type != null;
  if (!hasPrice) reasons.push("חסר מחיר מזוהה (או סכום 0)");
  if (!hasSizeOrScript) reasons.push("חסר גודל וחסר כתב — נדרש לפחות אחד מהם");
  return reasons;
}

// ─── Legacy export (backward compat for any importer) ──────────────────────
export { parseMarketTorahMessage as default };
export function normalizeMarketMessageText(raw: string): string {
  return raw
    .replace(/\u200f|\u200e|\u202a|\u202b|\u202c/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}
