import { z } from "zod";

const baseSchema = z.object({
  product_category: z.string().optional().nullable(),
  category_meta: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional()
    .default({}),
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

/** Dynamic validation: size/navi/lines required only when product_category matches */
export const inventoryItemSchema = baseSchema.superRefine((data, ctx) => {
  const cat = data.product_category ?? "";
  const meta = data.category_meta ?? {};

  if (cat === "ספר תורה") {
    const size = meta.size;
    if (size == null || String(size).trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "נדרש לבחור גודל עבור ספר תורה",
        path: ["category_meta", "size"],
      });
    }
  }

  if (cat === "נביא") {
    const navi = meta.navi;
    if (navi == null || String(navi).trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "נדרש לבחור נביא",
        path: ["category_meta", "navi"],
      });
    }
  }

  if (cat === "מגילה") {
    const lines = meta.lines;
    if (lines == null || String(lines).trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "נדרש לבחור שורות עבור מגילה",
        path: ["category_meta", "lines"],
      });
    }
  }
});

export type InventoryItemInput = z.infer<typeof baseSchema>;
