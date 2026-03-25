import { generateSku, inventorySkuPrefix } from "@/lib/sku";

/** Inventory SKU generator — delegates to shared lib/sku.ts */
export function generateInventorySku(): string {
  return generateSku(inventorySkuPrefix);
}
