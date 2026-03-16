/**
 * STaM Calculator - Spreadsheet data constants
 */

export const NEVIIM_DATA: Record<
  string,
  { pages: number; yeriot: number }
> = {
  יהושע: { pages: 32, yeriot: 8 },
  שופטים: { pages: 31, yeriot: 8 },
  שמואל: { pages: 86, yeriot: 22 },
  מלכים: { pages: 90, yeriot: 23 },
  ישעיה: { pages: 64, yeriot: 16 },
  ירמיה: { pages: 82, yeriot: 21 },
  יחזקאל: { pages: 69, yeriot: 18 },
  "תרי עשר": { pages: 56, yeriot: 14 },
};

export const PARCHMENT_PRICES: Record<string, number> = {
  גולדמאן: 190,
  "נפרשטק שליל": 380,
  "נפרשטק ליצה": 460,
  בראון: 245,
};

export const SEFER_TORAH_PAGES = 245;
export const SEFER_TORAH_YERIOT = 62;

export const CATEGORIES = ["ספר תורה", "נביא", "מגילה", "מזוזה", "פרשיות"] as const;
export const SEFER_TORAH_SIZES = [17, 24, 30, 36, 42, 45, 48, 56, "אחר"] as const;
export const NEVIIM_LIST = [
  "יהושע",
  "שופטים",
  "שמואל",
  "מלכים",
  "ישעיה",
  "ירמיה",
  "יחזקאל",
  "תרי עשר",
] as const;
export const MEGILLA_LINES = [11, 21, 28, 42] as const;
