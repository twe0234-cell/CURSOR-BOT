import { z } from "zod";

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v === undefined ? null : v));

/** מחירים בטופס באלפי שקלים (K); השרת יכפיל ב-1000 לפני DB */
const optPositiveNum = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().nonnegative().nullable()
);

const optDate = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

export const marketTorahBookSchema = z.object({
  sofer_id: optionalUuid,
  /** סוחר (Merchant) — אם נבחר, הוא הבעלים לתצוגה */
  dealer_id: optionalUuid,
  /** נשמר ב-DB לתאימות לאחור; הטופס לא שולח */
  external_sofer_name: z.string().max(200).optional().nullable(),
  style: z.string().max(200).optional().nullable(),
  size_cm: optPositiveNum,
  parchment_type: z.string().max(200).optional().nullable(),
  influencer_style: z.string().max(200).optional().nullable(),
  current_progress: z.string().max(500).optional().nullable(),
  asking_price: optPositiveNum,
  target_brokerage_price: optPositiveNum,
  currency: z.string().max(10).default("ILS"),
  expected_completion_date: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v === "" || v === undefined ? null : v)),
  notes: z.string().max(4000).optional().nullable(),
  last_contact_date: optDate,
  negotiation_notes: z.string().max(8000).optional().nullable(),
  handwriting_image_url: z.string().url().optional().nullable(),
});
