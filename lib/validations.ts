import { z } from "zod";

/** Inventory item schema - images strictly optional, no min(1) on arrays */
export const inventoryItemSchema = z.object({
  product_category: z.string().optional().nullable(),
  category_meta: z.record(z.string(), z.union([z.string(), z.number()])).optional().default({}),
  script_type: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  cost_price: z.preprocess(
    (v) => (v === "" || v == null || (typeof v === "number" && Number.isNaN(v)) ? null : v),
    z.number().nullable().optional()
  ),
  target_price: z.preprocess(
    (v) => (v === "" || v == null || (typeof v === "number" && Number.isNaN(v)) ? null : v),
    z.number().nullable().optional()
  ),
  scribe_id: z.string().uuid().optional().nullable(),
  scribe_code: z.string().optional().nullable(),
  images: z.array(z.string()).optional().nullable().default([]),
  description: z.string().optional().nullable(),
});

export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;
