/**
 * Shared numeric input utilities.
 *
 * Goals:
 *  - Prevent leading zeros ("0450" → "450") while preserving decimals ("0.5" → "0.5").
 *  - Treat an empty field as 0 internally so service calls never receive NaN or undefined.
 *  - Work with both string-state inputs and react-hook-form registered fields.
 */

import type { ChangeEvent } from "react";

// ─── Core transform ───────────────────────────────────────────────────────────

/**
 * Strips leading zeros before a non-zero digit.
 * "0450" → "450"   "0.5" → "0.5" (preserved)   "" → ""
 */
export function applyNumericTransform(raw: string): string {
  if (raw === "") return "";
  return raw.replace(/^0+(?=[1-9])/, "");
}

// ─── String-state inputs ──────────────────────────────────────────────────────

/**
 * onChange factory for string-state <Input type="number"> fields.
 *
 *  • Empty input → setter("") — shows blank; submit code uses `parseFloat(v) || 0`.
 *  • "0450"      → setter("450") — strips leading zeros.
 *  • "0.5"       → setter("0.5") — decimal notation is left untouched.
 */
export function handleNumericChange(setter: (v: string) => void) {
  return (e: ChangeEvent<HTMLInputElement>) => {
    setter(applyNumericTransform(e.target.value));
  };
}

// ─── react-hook-form registered fields ───────────────────────────────────────

/**
 * Drop-in replacement for `{ valueAsNumber: true }` in RHF's `register()`.
 *
 * Differences:
 *  • Empty string → `fallback` (default 0) instead of NaN — safe for service calls.
 *  • Strips leading zeros before transforming to a number.
 */
export function numericRegisterOptions(fallback = 0) {
  return {
    setValueAs: (v: string) => {
      if (v === "" || v == null) return fallback;
      const n = parseFloat(applyNumericTransform(String(v)));
      return isNaN(n) ? fallback : n;
    },
  } as const;
}

/**
 * Variant for integer fields (e.g. quantity).
 * Empty string → `fallback` (default 1).
 */
export function integerRegisterOptions(fallback = 1) {
  return {
    setValueAs: (v: string) => {
      if (v === "" || v == null) return fallback;
      const n = parseInt(applyNumericTransform(String(v)), 10);
      return isNaN(n) ? fallback : n;
    },
  } as const;
}
