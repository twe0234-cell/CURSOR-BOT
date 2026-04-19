import { z } from "zod";

/** Valid item types for public intake. Mirrors the DB CHECK constraint. */
export const SEFER_TYPES = [
  "ספר תורה",
  "תפילין",
  "מזוזה",
  "אחר",
] as const;

export type SeferType = (typeof SEFER_TYPES)[number];

const phoneRegex = /^[\d\s()+\-]{7,20}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const requiredString = (max: number) =>
  z.string().trim().min(1, "שדה חובה").max(max);

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

export const TorahIntakeSchema = z.object({
  owner_name: requiredString(120),
  owner_phone: z
    .string()
    .trim()
    .regex(phoneRegex, "מספר טלפון לא תקין"),
  owner_email: z
    .string()
    .trim()
    .regex(emailRegex, "כתובת אימייל לא תקינה")
    .max(200),
  owner_city: optionalString(120),

  sefer_type: z.enum(SEFER_TYPES),

  scribe_name: optionalString(200),
  age_estimate: optionalString(80),
  condition: optionalString(200),
  description: optionalString(2000),

  asking_price: z
    .union([z.coerce.number().nonnegative().finite(), z.literal(""), z.undefined(), z.null()])
    .transform((v) => {
      if (v === "" || v === null || v === undefined) return undefined;
      return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
    })
    .optional(),

  image_paths: z
    .array(z.string().min(1).max(500))
    .max(10, "מקסימום 10 תמונות")
    .default([]),

  // Optional anti-bot token. Server validates if env vars set; otherwise ignored.
  turnstile_token: z.string().optional(),
});

export type TorahIntakeInput = z.infer<typeof TorahIntakeSchema>;
