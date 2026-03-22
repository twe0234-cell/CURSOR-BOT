/** Statuses that still count as available stock (not fully sold). */
export const INVENTORY_ACTIVE_STATUSES = [
  "available",
  "proofreading",
  "reserved",
  "in_use", // legacy — treated as active / same label as proofreading
] as const;

export type InventoryActiveStatus = (typeof INVENTORY_ACTIVE_STATUSES)[number];

export function isInventorySoldStatus(status: string | null | undefined): boolean {
  return status === "sold" || status === "נמכר";
}

/** Status stored when quantity hits zero after a sale (Hebrew label per product spec). */
export const INVENTORY_SOLD_STATUS_HE = "נמכר" as const;

/** תוויות עברית לתצוגה — ערכים במסד: available | proofreading | reserved | sold (וגם legacy). */
export const INVENTORY_STATUS_LABEL_HE: Record<string, string> = {
  available: "זמין",
  proofreading: "בהגהה",
  in_use: "בהגהה", // legacy — same as proofreading
  reserved: "שמור",
  sold: "נמכר",
  נמכר: "נמכר", // legacy duplicate value
};

export function inventoryStatusLabelHe(status: string | null | undefined): string {
  if (status == null || status === "") return "—";
  return INVENTORY_STATUS_LABEL_HE[status] ?? status;
}
