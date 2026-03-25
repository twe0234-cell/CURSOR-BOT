/**
 * Shared short-SKU generator.
 * Produces `${PREFIX}-XXXXXXXX` (8 uppercase hex chars, ~4 billion combinations).
 * Uses Web Crypto API (available in Node 18+ and all browsers).
 */
export function generateSku(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${prefix}-${hex}`;
}

/** Inventory  */
export const inventorySkuPrefix = "HD";
/** Market torah book */
export const marketSkuPrefix = "MKT";
/** CRM contact */
export const crmSkuPrefix = "CRM";
