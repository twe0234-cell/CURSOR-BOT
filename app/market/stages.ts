/**
 * שלבי pipeline עבור מאגר ספרי התורה — קבועים וטיפוסים.
 *
 * קובץ זה **אינו** `"use server"`, כדי שאפשר יהיה לייצא ממנו אובייקטים
 * ומערכים (Server Actions files מותר להם לייצא רק async functions).
 */

export type MarketStage =
  | "image_pending"
  | "new"
  | "contacted"
  | "negotiating"
  | "deal_closed"
  | "archived";

export const MARKET_STAGE_LABELS: Record<MarketStage, string> = {
  image_pending: "ממתין לתמונה",
  new: "חדש",
  contacted: "ביצירת קשר",
  negotiating: "במשא ומתן",
  deal_closed: "עסקה סגורה",
  archived: "ארכיון",
};

export const MARKET_STAGE_ORDER: MarketStage[] = [
  "image_pending",
  "new",
  "contacted",
  "negotiating",
  "deal_closed",
  "archived",
];
