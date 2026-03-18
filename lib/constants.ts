/** Static script types - never fetched from DB */
export const SCRIPT_TYPES = ['אר"י', 'בית יוסף', 'ספרדי'] as const;
export type ScriptType = (typeof SCRIPT_TYPES)[number];

/** Fallback options when sys_dropdowns is empty or fetch fails */
export const DROPDOWN_FALLBACKS: Record<string, string[]> = {
  categories: ["ספר תורה", "נביא", "מגילה", "מזוזה", "פרשיות"],
  torah_sizes: ["17", "24", "30", "36", "42", "45", "48", "56", "אחר"],
  neviim_names: ["יהושע", "שופטים", "שמואל", "מלכים", "ישעיה", "ירמיה", "יחזקאל", "תרי עשר"],
  megilla_lines: ["11", "21", "28", "42"],
};
