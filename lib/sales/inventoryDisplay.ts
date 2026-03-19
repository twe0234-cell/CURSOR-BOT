/** Build human-readable size/navi/lines from category_meta for sales combobox */
export function formatInventoryDetails(
  categoryMeta: Record<string, unknown> | null,
  productCategory: string | null
): string {
  if (!categoryMeta) return "—";
  const m = categoryMeta as Record<string, string | number>;
  const cat = productCategory ?? "";
  const parts: string[] = [];
  if (cat === "ספר תורה" || cat === "מזוזה") {
    const sz = m.size;
    if (sz != null && String(sz).trim() !== "") parts.push(`גודל ${sz}`);
  }
  if (cat === "נביא") {
    const navi = m.navi;
    if (navi != null && String(navi).trim() !== "") parts.push(`נביא ${navi}`);
  }
  if (cat === "מגילה") {
    const lines = m.lines;
    if (lines != null && String(lines).trim() !== "") parts.push(`${lines} שורות`);
  }
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function buildInventorySaleLabel(input: {
  id: string;
  sku: string | null;
  product_category: string | null;
  category_meta: Record<string, unknown> | null;
  quantity: number;
  scribe_name: string | null;
}): string {
  const sku = input.sku ?? input.id.slice(0, 8);
  const cat = input.product_category ?? "—";
  const det = formatInventoryDetails(input.category_meta, input.product_category);
  const sc = input.scribe_name ? `סופר: ${input.scribe_name}` : "סופר: —";
  return `[${sku}] ${cat} - ${det} (${sc}) - זמין: ${input.quantity}`;
}
