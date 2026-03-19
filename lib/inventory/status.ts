/** Statuses that still count as available stock (not fully sold). */
export const INVENTORY_ACTIVE_STATUSES = ["available", "in_use", "reserved"] as const;

export type InventoryActiveStatus = (typeof INVENTORY_ACTIVE_STATUSES)[number];

export function isInventorySoldStatus(status: string | null | undefined): boolean {
  return status === "sold" || status === "נמכר";
}

/** Status stored when quantity hits zero after a sale (Hebrew label per product spec). */
export const INVENTORY_SOLD_STATUS_HE = "נמכר" as const;
