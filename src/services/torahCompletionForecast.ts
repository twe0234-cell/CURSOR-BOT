/**
 * תחזית סיום כתיבת ספר תורה — ימי עבודה עבריים (ללא שבת וי״ט) לפי קצב עמודות.
 * משתמש ב־@hebcal דרך workDaysCalculator (sofer-vmone work-day semantics).
 */

import { estimateEndDate, type CalendarConfig } from "@/src/lib/calendar/workDaysCalculator";
import { columnsCountForTorahSheetNumber } from "@/src/lib/types/torah";

export type TorahForecastSheet = { sheet_number: number; columns_count?: number; status: string };

/** עמודות שכבר יצאו ממצב «לא התחיל» — קצב כתיבה עד קליטת כל היריעות */
const WRITTEN_PROGRESS_STATUSES = new Set([
  "written",
  "reported_written",
  "received",
  "in_qa",
  "needs_fixing",
  "approved",
  "sewn",
]);

function totalColumnsForScroll(sheets: TorahForecastSheet[]): number {
  if (sheets.length > 0) {
    return sheets.reduce((sum, sh) => sum + (sh.columns_count ?? columnsCountForTorahSheetNumber(sh.sheet_number)), 0);
  }
  let sum = 0;
  for (let n = 1; n <= 62; n++) {
    sum += columnsCountForTorahSheetNumber(n);
  }
  return sum;
}

function writtenProgressColumns(sheets: TorahForecastSheet[]): number {
  return sheets
    .filter((sh) => WRITTEN_PROGRESS_STATUSES.has(sh.status))
    .reduce((sum, sh) => sum + (sh.columns_count ?? columnsCountForTorahSheetNumber(sh.sheet_number)), 0);
}

/**
 * מעריך תאריך סיום כתיבה (עמודות שנותרו ÷ עמודות ליום עברי ממוצע),
 * מתאריך התחלה (או היום) ומדלג על שבת וחגים.
 */
export function estimateTorahScrollWritingCompletionDate(input: {
  sheets: TorahForecastSheet[];
  columnsPerDay: number;
  /** YYYY-MM-DD — מתי להתחיל לספור; אם חסר משתמשים ב־referenceDate */
  startDate: string | null;
  /** YYYY-MM-DD — "היום" לצורך חישוב יתרה */
  referenceDate?: string;
  calendar?: CalendarConfig;
}): { ok: true; completionDateIso: string; workDaysRemaining: number } | { ok: false; reason: string } {
  const pace = Number(input.columnsPerDay);
  if (!Number.isFinite(pace) || pace <= 0) {
    return { ok: false, reason: "לא הוגדר קצב עמודות ליום (columns_per_day)" };
  }

  const total = totalColumnsForScroll(input.sheets);
  const done = writtenProgressColumns(input.sheets);
  const remaining = Math.max(0, total - done);
  if (remaining <= 0) {
    const ref = input.referenceDate ?? new Date().toISOString().slice(0, 10);
    return { ok: true, completionDateIso: `${ref}T12:00:00.000Z`, workDaysRemaining: 0 };
  }

  const workDaysNeeded = Math.ceil(remaining / pace);
  const ref = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const startIso = input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : ref;
  const start = new Date(`${startIso}T12:00:00`);
  const end = estimateEndDate(start, workDaysNeeded, input.calendar ?? {});
  return {
    ok: true,
    completionDateIso: end.toISOString(),
    workDaysRemaining: workDaysNeeded,
  };
}
