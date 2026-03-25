/**
 * Central error utilities for the ERP application.
 *
 * Two responsibilities:
 *  1. `toErrorMessage`      – converts any thrown value to a readable Hebrew string.
 *  2. `handleSupabaseError` – maps PostgREST error codes to readable Hebrew messages.
 *
 * Usage pattern in service functions:
 *   try { ... }
 *   catch (err) { return { success: false, error: toErrorMessage(err) }; }
 *
 *   if (error) return { success: false, error: handleSupabaseError(error) };
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { ZodError } from "zod";

/**
 * Converts any unknown thrown value into a user-readable Hebrew string.
 * Handles: ZodError, standard Error, duck-typed Zod issue objects, plain strings, Supabase shapes.
 */
export function toErrorMessage(err: unknown): string {
  if (!err) return "שגיאה לא צפויה";

  // Zod 4 – prefer instanceof so we get the first issue reliably
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return first?.message ?? "שגיאת אימות";
  }

  // Standard JS Error (most common case)
  if (err instanceof Error) return err.message;

  // Duck-typed Zod / similar: { issues: [{ message: string }] }
  if (
    typeof err === "object" &&
    "issues" in err &&
    Array.isArray((err as { issues: unknown }).issues)
  ) {
    const issues = (err as { issues: Array<{ message?: string }> }).issues;
    const first = issues[0];
    return first?.message ?? "שגיאת אימות";
  }

  // Any object with a message property (Supabase error, etc.)
  if (typeof err === "object" && "message" in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  }

  // Plain string
  if (typeof err === "string" && err.length > 0) return err;

  return "שגיאה לא צפויה";
}

/**
 * Maps Supabase PostgREST error codes to user-friendly Hebrew messages.
 * Falls back to the raw error.message if no specific mapping exists.
 *
 * Common codes:
 *   23505 – unique constraint violated
 *   42P01 – table does not exist (migration not run)
 *   23503 – foreign key violation
 *   23502 – not-null violation
 *   PGRST116 – PostgREST single() found no row
 */
export function handleSupabaseError(error: PostgrestError): string {
  switch (error.code) {
    case "23505":
      return "רשומה זו כבר קיימת במערכת";
    case "42P01":
      return "טבלה חסרה – יש להריץ את המיגרציה הנדרשת";
    case "23503":
      return "ישות קשורה לא נמצאה";
    case "23502":
      return "שדה חובה חסר";
    case "PGRST116":
      return "הרשומה לא נמצאה";
    default:
      return error.message;
  }
}
