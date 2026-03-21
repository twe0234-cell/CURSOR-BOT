import { z } from "zod";

export const soferProfileUpsertSchema = z.object({
  contact_id: z.string().uuid("מזהה איש קשר לא תקין"),
  writing_style: z.string().max(500).optional().nullable(),
  writing_level: z.string().max(500).optional().nullable(),
  sample_image_url: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .transform((s) => (s === "" ? null : s)),
  daily_page_capacity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().nonnegative().optional().nullable()
  ),
  pricing_notes: z.string().max(4000).optional().nullable(),
});

export const newScribeContactSchema = z.object({
  name: z.string().min(1, "נדרש שם").max(200),
  phone: z.string().max(50).optional().nullable(),
});
