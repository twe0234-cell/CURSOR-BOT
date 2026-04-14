import { z } from "zod";
import {
  STAM_SEFER_TORAH_SIZES,
  MARKET_PARCHMENT_TYPES,
  STAM_SCRIPT_TYPES,
} from "@/src/lib/stam/catalog";

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v === undefined ? null : v));

const optPositiveNum = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().nonnegative().nullable()
);

const optDate = z
  .union([z.string(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

const sizes = STAM_SEFER_TORAH_SIZES as unknown as readonly [string, ...string[]];
const parchments = MARKET_PARCHMENT_TYPES as unknown as readonly [string, ...string[]];
const scripts = STAM_SCRIPT_TYPES as unknown as readonly [string, ...string[]];

const torahSizeEnum = z
  .union([z.enum(sizes), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

const parchmentEnum = z
  .union([z.enum(parchments), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

const scriptEnum = z
  .union([z.enum(scripts), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

export const marketTorahBookSchema = z.object({
  sofer_id: optionalUuid,
  dealer_id: optionalUuid,
  external_sofer_name: z.string().max(200).optional().nullable(),
  script_type: scriptEnum,
  torah_size: torahSizeEnum,
  parchment_type: parchmentEnum,
  influencer_style: z.string().max(200).optional().nullable(),
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
  /** WhatsApp sender @c.us — שיוך הודעות מקבוצה */
  sender_wa_id: z
    .union([z.string().max(256), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v === "" || v === undefined ? null : v)),
});
