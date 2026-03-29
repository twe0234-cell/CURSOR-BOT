/**
 * פענוח טקסט הודעת WhatsApp להצעת מאגר ס״ת (גודל / כתב / מחיר).
 */

export type ParsedMarketTorahMessage = {
  torah_size: string | null;
  script_type: string | null;
  /** שקלים מלאים לשמירה ב-DB (כמו marketKToDb) */
  asking_price_full_shekels: number | null;
};

const SIZE_RE = /\b(36|42|45|48|50|56)\b/;

/**
 * אחידות לפני regex: סיומי שורה, רווחים אופקיים, תווי כיווניות.
 * ממיר שבירות שורה לרווח יחיד כדי שדפוסים כמו "מחיר" ומספר בשורה נפרדת יימצאו.
 */
export function normalizeMarketMessageText(raw: string): string {
  return raw
    .replace(/\u200f|\u200e|\u202a|\u202b|\u202c/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ *\n+ */g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** מחיר: ליד מילות מפתח או סימני מטבע */
function extractPriceFullShekels(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  const nearPrice =
    /(?:מחיר|בסך|עלות|שווי)\s*[:\-]?\s*([\d.,]+)\s*(?:אלף|אל״ש|אל"ש|K|k)?/i.exec(t) ??
    /([\d.,]+)\s*(?:₪|ש״ח|שח|ש"ח|NIS)/i.exec(t) ??
    /₪\s*([\d.,]+)/i.exec(t);

  if (nearPrice) {
    const raw = nearPrice[1].replace(/,/g, "");
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return normalizePriceToFullShekels(n);
  }

  const standalone = /\b([\d]{2,6})\b/.exec(t);
  if (standalone) {
    const n = Number.parseInt(standalone[1], 10);
    if (!Number.isFinite(n)) return null;
    if (t.includes("אלף") || t.includes("אל״ש") || t.includes('אל"ש')) {
      return normalizePriceToFullShekels(n);
    }
  }

  return null;
}

/**
 * ערכים קטנים (עד ~250) נחשבים אלפי ש״ח; גדולים יותר — ש״ח מלאים.
 */
function normalizePriceToFullShekels(n: number): number {
  if (n <= 0) return n;
  if (n <= 250) return Math.round(n * 1000);
  return Math.round(n);
}

function extractScript(text: string): string | null {
  if (/ארי/.test(text)) return "ארי";
  if (/ב״י|בית\s*יוסף|בית-יוסף/i.test(text)) return "ב״י";
  if (/ספרדי/.test(text)) return "ספרדי";
  return null;
}

function extractTorahSize(text: string): string | null {
  const m = SIZE_RE.exec(text);
  return m ? m[1]! : null;
}

export function parseMarketTorahMessage(text: string): ParsedMarketTorahMessage {
  const normalized = normalizeMarketMessageText(text);
  const torah_size = extractTorahSize(normalized);
  const script_type = extractScript(normalized);
  const asking_price_full_shekels = extractPriceFullShekels(normalized);
  return { torah_size, script_type, asking_price_full_shekels };
}

/** האם יש מספיק נתונים לשמירת רשומה */
export function parsedMessageIsActionable(p: ParsedMarketTorahMessage): boolean {
  const hasSize = p.torah_size != null;
  const hasScript = p.script_type != null;
  const hasPrice = p.asking_price_full_shekels != null && p.asking_price_full_shekels > 0;
  return (hasSize || hasScript) && hasPrice;
}
