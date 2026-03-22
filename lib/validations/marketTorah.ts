import { z } from "zod";

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v === undefined ? null : v));

const optPositiveNum = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().nonnegative().nullable()
);

export const marketTorahBookSchema = z.object({
  sofer_id: optionalUuid,
  external_sofer_name: z.string().max(200).optional().nullable(),
  style: z.string().max(200).optional().nullable(),
  size_cm: optPositiveNum,
  parchment_type: z.string().max(200).optional().nullable(),
  influencer_style: z.string().max(200).optional().nullable(),
  current_progress: z.string().max(500).optional().nullable(),
  asking_price: optPositiveNum,
  /** מחיר יעד לתיווך — what you plan to broker/offer at */
  target_brokerage_price: optPositiveNum,
  currency: z.string().max(10).default("ILS"),
  expected_completion_date: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v === "" || v === undefined ? null : v)),
  notes: z.string().max(4000).optional().nullable(),
});
