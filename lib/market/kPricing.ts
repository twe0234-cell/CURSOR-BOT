/** מחירים במאגר נשמרים בשקלים מלאים; בטופס מזינים באלפי שקלים (K). */
export const MARKET_PRICE_K_FACTOR = 1000;

export function marketKToDb(k: number | null | undefined): number | null {
  if (k == null || Number.isNaN(k)) return null;
  return k * MARKET_PRICE_K_FACTOR;
}

export function marketDbToK(fullShekels: number | null | undefined): number | null {
  if (fullShekels == null || Number.isNaN(fullShekels)) return null;
  return fullShekels / MARKET_PRICE_K_FACTOR;
}

export function formatMarketPriceK(fullShekels: number | null | undefined): string {
  const k = marketDbToK(fullShekels);
  if (k == null) return "—";
  const s = Number.isInteger(k) ? k.toLocaleString("he-IL") : k.toLocaleString("he-IL", { maximumFractionDigits: 2 });
  return `${s} אל"ש`;
}
