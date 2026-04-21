/** נושא מייל לדוגמה: הצעת מחיר לספר תורה 42 · כתב בית יוסף · מק״ט ABC */
export function buildMarketTorahQuoteEmailSubject(row: {
  sku: string | null;
  torah_size: string | null;
  script_type: string | null;
}): string {
  const size = row.torah_size?.trim();
  const script = row.script_type?.trim();
  const sku = row.sku?.trim();

  const parts: string[] = ["הצעת מחיר לספר תורה"];
  if (size) parts.push(size);
  const headline = parts.join(" ");

  const scriptBit = script ? ` · כתב ${script}` : "";
  const skuBit = sku ? ` · ${sku}` : "";

  return `${headline}${scriptBit}${skuBit}`;
}
