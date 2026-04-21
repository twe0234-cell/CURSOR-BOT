/**
 * workDaysCalculator.ts
 * מנוע ימי עבודה עברי לתזמון פרויקטי סת"ם
 *
 * Pure functions — no DB, no side-effects, fully TypeScript-safe.
 * Excludes: Shabbat + Yom Tov (biblical holidays).
 * Chol Hamoed: configurable (default: לא נחשב כחופש).
 */

import { HDate, HebrewCalendar, flags } from "@hebcal/core";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type CalendarConfig = {
  /** האם לאסור עבודה בחול המועד (ברירת מחדל: false) */
  excludeCholHamoed?: boolean;
  /** מצב ישראל — חגים חד-יומיים (ברירת מחדל: true) */
  il?: boolean;
};

const DEFAULT_CONFIG: Required<CalendarConfig> = {
  excludeCholHamoed: false,
  il: true,
};

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

function mergeConfig(config: CalendarConfig): Required<CalendarConfig> {
  return { ...DEFAULT_CONFIG, ...config };
}

/** מנרמל תאריך ל-midnight (מונע בעיות timezone) */
function normalizeDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * בודק אם יום הוא יום טוב (או חול המועד אם מוגדר)
 * לפי לוח השנה העברי.
 */
function isHolidayOff(date: Date, cfg: Required<CalendarConfig>): boolean {
  const hdate = new HDate(date);
  const events = HebrewCalendar.getHolidaysOnDate(hdate, cfg.il);
  if (!events || events.length === 0) return false;

  return events.some((event) => {
    const f = event.getFlags();
    const isYomTov = (f & flags.CHAG) !== 0;
    const isCholHamoed = (f & flags.CHOL_HAMOED) !== 0;

    if (isYomTov) return true;
    if (cfg.excludeCholHamoed && isCholHamoed) return true;
    return false;
  });
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * בודק אם יום ספציפי הוא יום עבודה.
 * מחזיר false עבור: שבת | יום טוב | (חול המועד אם מוגדר)
 */
export function isWorkingDay(date: Date, config: CalendarConfig = {}): boolean {
  const cfg = mergeConfig(config);
  const d = normalizeDate(date);

  // שבת
  if (d.getDay() === 6) return false;

  // יום טוב / חול המועד
  if (isHolidayOff(d, cfg)) return false;

  return true;
}

/**
 * תואם sofer-vmone `isAssurBemelacha` — יום שאסורה בו מלאכה (שבת / י״ט / חה״מ לפי config).
 */
export function isAssurBemelacha(date: Date, config: CalendarConfig = {}): boolean {
  return !isWorkingDay(date, config);
}

/**
 * תואם sofer-vmone `workDayValue` — 1.0 אם ניתן לעבוד, אחרת 0 (קלט מספרי בלבד).
 */
export function workDayValue(date: Date, config: CalendarConfig = {}): 0 | 1 {
  return isWorkingDay(date, config) ? 1 : 0;
}

/**
 * סופר ימי עבודה בין שני תאריכים (כולל שני הקצוות).
 */
export function getWorkingDays(
  startDate: Date,
  endDate: Date,
  config: CalendarConfig = {}
): number {
  const cfg = mergeConfig(config);
  const current = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  if (current > end) return 0;

  let count = 0;
  while (current <= end) {
    if (isWorkingDay(current, cfg)) count++;
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * מחשב תאריך סיום לפי מספר ימי עבודה נדרשים.
 * מתחיל מ-startDate, מתקדם יום-יום, וסופר רק ימי עבודה.
 *
 * @param startDate   תאריך תחילת העבודה
 * @param workDaysNeeded  כמות ימי עבודה נדרשת
 * @param config      הגדרות לוח שנה
 * @returns תאריך הסיום המשוער
 */
export function estimateEndDate(
  startDate: Date,
  workDaysNeeded: number,
  config: CalendarConfig = {}
): Date {
  if (workDaysNeeded <= 0) return normalizeDate(startDate);

  const cfg = mergeConfig(config);
  const current = normalizeDate(startDate);
  let remaining = workDaysNeeded;

  while (remaining > 0) {
    if (isWorkingDay(current, cfg)) remaining--;
    if (remaining > 0) current.setDate(current.getDate() + 1);
  }

  return new Date(current);
}
