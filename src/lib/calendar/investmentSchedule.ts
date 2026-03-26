/**
 * investmentSchedule.ts
 * אינטגרציה מינימלית: מוסיף שדות מחושבים ל-InvestmentRecord.
 *
 * ✅ לא משנה DB
 * ✅ לא משנה קוד קיים
 * ✅ Pure — מקבל נתונים, מחזיר נתונים
 */

import type { InvestmentRecord } from "@/app/investments/actions";
import {
  estimateEndDate,
  getWorkingDays,
  type CalendarConfig,
} from "./workDaysCalculator";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type InvestmentWithSchedule = InvestmentRecord & {
  /** ימי עבודה מתאריך יצירה עד תאריך יעד (null אם אין target_date) */
  estimated_work_days: number | null;
  /** תאריך סיום משוער לפי ימי עבודה (null אם אין target_date) */
  estimated_end_date: Date | null;
};

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * מעשיר InvestmentRecord אחד עם שדות לוח שנה מחושבים.
 */
export function enrichInvestmentWithSchedule(
  investment: InvestmentRecord,
  config: CalendarConfig = {}
): InvestmentWithSchedule {
  if (!investment.target_date || !investment.created_at) {
    return {
      ...investment,
      estimated_work_days: null,
      estimated_end_date: null,
    };
  }

  const start = new Date(investment.created_at);
  const target = new Date(investment.target_date);

  if (isNaN(start.getTime()) || isNaN(target.getTime())) {
    return {
      ...investment,
      estimated_work_days: null,
      estimated_end_date: null,
    };
  }

  const estimated_work_days = getWorkingDays(start, target, config);
  const estimated_end_date = estimateEndDate(start, estimated_work_days, config);

  return {
    ...investment,
    estimated_work_days,
    estimated_end_date,
  };
}

/**
 * מעשיר מערך שלם של השקעות עם שדות לוח שנה.
 */
export function enrichInvestmentsWithSchedule(
  investments: InvestmentRecord[],
  config: CalendarConfig = {}
): InvestmentWithSchedule[] {
  return investments.map((inv) => enrichInvestmentWithSchedule(inv, config));
}

/**
 * מחשב תאריך סיום משוער להשקעה לפי מספר ימי עבודה.
 * שימושי ביצירת השקעה חדשה (לפני שמירה ב-DB).
 */
export function getEstimatedEndDateForInvestment(
  startDate: Date,
  workDaysNeeded: number,
  config: CalendarConfig = {}
): Date {
  return estimateEndDate(startDate, workDaysNeeded, config);
}
