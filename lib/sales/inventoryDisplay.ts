import { PITUM_HAKETORET_CATEGORY } from "@/lib/validations/inventory";

/** Build human-readable size/navi/lines — root `size` preferred; legacy `category_meta.size` fallback */
export function formatInventoryDetails(
  categoryMeta: Record<string, unknown> | null,
  productCategory: string | null,
  rootSize?: string | null
): string {
  const m = (categoryMeta ?? {}) as Record<string, string | number>;
  const cat = productCategory ?? "";
  const parts: string[] = [];
  const sizeFromRoot = rootSize != null && String(rootSize).trim() !== "";
  const legacyMetaSize = m.size != null && String(m.size).trim() !== "";
  if (cat === "ספר תורה" || cat === "מזוזה" || cat === PITUM_HAKETORET_CATEGORY) {
    const sz = sizeFromRoot ? String(rootSize).trim() : legacyMetaSize ? String(m.size) : "";
    if (sz) parts.push(`גודל ${sz}`);
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
  size?: string | null;
}): string {
  const sku = input.sku ?? input.id.slice(0, 8);
  const cat = input.product_category ?? "—";
  const det = formatInventoryDetails(
    input.category_meta,
    input.product_category,
    input.size ?? null
  );
  const sc = input.scribe_name ? `סופר: ${input.scribe_name}` : "סופר: —";
  return `[${sku}] ${cat} - ${det} (${sc}) - זמין: ${input.quantity}`;
}

/** SaaS sales combobox: SKU, category, details, available qty (no scribe). */
export function buildInventorySaleLabelSkuPrecise(input: {
  id: string;
  sku: string | null;
  product_category: string | null;
  category_meta: Record<string, unknown> | null;
  quantity: number;
  size?: string | null;
}): string {
  const sku = input.sku ?? input.id.slice(0, 8);
  const cat = input.product_category ?? "—";
  const det = formatInventoryDetails(
    input.category_meta,
    input.product_category,
    input.size ?? null
  );
  return `[${sku}] ${cat} - ${det} (זמין: ${input.quantity})`;
}
