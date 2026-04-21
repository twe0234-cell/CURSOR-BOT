import { z } from "zod";

const coerceNumDefault0 = z.preprocess(
  (v) => (v === "" || v == null || (typeof v === "number" && Number.isNaN(v)) ? 0 : v),
  z.coerce.number().optional().default(0)
);

const numericNullable = z.preprocess(
  (v) => (v === "" || v == null || (typeof v === "number" && Number.isNaN(v)) ? null : v),
  z.number().nullable().optional()
);

/** Empty string → null so optional scribe never fails UUID parse */
const optionalUuid = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.union([z.string().uuid(), z.null()]).optional()
);

/** category_meta may contain mixed JSON from DB — never block save on shape */
const categoryMetaSchema = z
  .preprocess(
    (v) => (v == null || typeof v !== "object" ? {} : v),
    z.record(z.string(), z.unknown())
  )
  .optional()
  .default({})
  .catch({});

/** קטגוריות מוכרות (כולל פיטום הקטורת) — רשימת עזר לטפסים */
export const INVENTORY_CATEGORY_OPTIONS = [
  "ספר תורה",
  "נביא",
  "מגילה",
  "מזוזה",
  "פרשיות",
  "פיטום הקטורת",
] as const;

export const PITUM_HAKETORET_CATEGORY = "פיטום הקטורת";

export const MEGILLAH_TYPE_OPTIONS = [
  "אסתר",
  "רות",
  "שיר השירים",
  "איכה",
  "קהלת",
] as const;

const baseSchema = z.object({
  product_category: z.string().optional().nullable(),
  purchase_date: z.string().optional().nullable(),
  category_meta: categoryMetaSchema,
  script_type: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.enum(['אר"י', 'בית יוסף', "ספרדי"]).nullable().optional()
  ),
  status: z.string().optional().nullable(),
  quantity: coerceNumDefault0,
  cost_price: numericNullable,
  target_price: numericNullable,
  amount_paid: numericNullable,
  scribe_id: optionalUuid,
  scribe_code: z.string().optional().nullable(),
  images: z.array(z.string()).optional().nullable().default([]),
  description: z.string().optional().nullable(),
  parchment_type: z.string().optional().nullable(),
  computer_proofread: z.boolean().optional().default(false),
  human_proofread: z.boolean().optional().default(false),
  is_sewn: z.boolean().optional().default(false),
  has_lamnatzeach: z.preprocess(
    (v) => (v === undefined || v === null ? false : Boolean(v)),
    z.boolean().optional().default(false)
  ),
  size: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : String(v)),
    z.string().nullable().optional()
  ),
  /** רלוונטי לקטגוריית מגילה */
  megillah_type: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : String(v)),
    z.string().nullable().optional()
  ),
});

/**
 * No superRefine category gates — conditional fields are UI-only hints; empty scribe/meta must not block save.
 */
export const inventoryItemSchema = baseSchema;

export type InventoryItemInput = z.infer<typeof baseSchema>;
