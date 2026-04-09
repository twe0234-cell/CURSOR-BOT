/** שדות נדרשים לטקסט שיתוף — ללא תלות ב-`actions` (server) */
export type MarketTorahShareFields = {
  sku: string | null;
  dealer_name: string | null;
  sofer_name: string | null;
  external_sofer_name: string | null;
  torah_size: string | null;
  script_type: string | null;
  parchment_type: string | null;
  asking_price: number | null;
  target_brokerage_price: number | null;
};

/** טקסט מוכן לשיתוף (וואטסאפ / מייל) */
export function buildMarketTorahShareText(row: MarketTorahShareFields): string {
  const owner =
    row.dealer_name ?? row.sofer_name ?? row.external_sofer_name ?? "—";
  const parts: string[] = [];
  parts.push("הצעת ספר תורה מהמאגר:");
  parts.push(`בעלים/מקור: ${owner}`);
  if (row.sku) parts.push(`SKU: ${row.sku}`);
  if (row.torah_size) parts.push(`גודל: ${row.torah_size}`);
  if (row.script_type) parts.push(`כתב: ${row.script_type}`);
  if (row.parchment_type) parts.push(`קלף: ${row.parchment_type}`);
  if (row.asking_price != null) {
    const k = row.asking_price;
    const s = Number.isInteger(k)
      ? k.toLocaleString("he-IL")
      : k.toLocaleString("he-IL", { maximumFractionDigits: 2 });
    parts.push(`מחיר דורש: ${s} אל״ש`);
  }
  if (row.target_brokerage_price != null) {
    const k = row.target_brokerage_price;
    const s = Number.isInteger(k)
      ? k.toLocaleString("he-IL")
      : k.toLocaleString("he-IL", { maximumFractionDigits: 2 });
    parts.push(`יעד תיווך: ${s} אל״ש`);
  }
  return parts.join("\n");
}

export function whatsappPrefillPath(message: string): string {
  return `/whatsapp?message=${encodeURIComponent(message)}`;
}

export function mailtoOfferHref(subject: string, body: string): string {
  const s = encodeURIComponent(subject);
  const b = encodeURIComponent(body);
  return `mailto:?subject=${s}&body=${b}`;
}
