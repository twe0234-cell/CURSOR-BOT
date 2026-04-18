/**
 * Pure number formatter — used by the <Num /> component.
 *
 * Extracted into src/lib so it can be unit-tested under the Node-only
 * vitest setup (no DOM, no React).
 */

export type NumVariant = "auto" | "positive" | "negative" | "neutral" | "plain";

export type FormatNumInput = {
  value: number | null | undefined;
  currency?: boolean;
  locale?: string;
  maximumFractionDigits?: number;
};

export type FormatNumOutput = {
  /** The sanitized numeric value (null/undefined/NaN → 0). */
  safeValue: number;
  /** The rendered string, ready for display. */
  rendered: string;
};

/**
 * Sanitize + format a number for UI display.
 *
 *  - null / undefined / NaN / non-finite → 0 (per CLAUDE.md §4.5 SAFE TYPES).
 *  - Locale defaults to `he-IL`.
 *  - `currency=true` appends `₪` with a narrow no-break space (U+202F).
 */
export function formatNum({
  value,
  currency = false,
  locale = "he-IL",
  maximumFractionDigits = 0,
}: FormatNumInput): FormatNumOutput {
  const raw = Number(value);
  const safeValue = value == null || !Number.isFinite(raw) ? 0 : raw;
  const formatted = safeValue.toLocaleString(locale, { maximumFractionDigits });
  const rendered = currency ? `${formatted}\u202F₪` : formatted;
  return { safeValue, rendered };
}

/**
 * Resolve a semantic color class for a numeric display.
 *
 *  - "auto":    positive > 0, negative < 0, neutral == 0
 *  - explicit:  "positive" | "negative" | "neutral"
 *  - "plain":   undefined (no color class)
 */
export function resolveNumColorClass(
  variant: NumVariant,
  safeValue: number,
): string | undefined {
  if (variant === "plain") return undefined;
  if (variant === "positive") return "num-positive";
  if (variant === "negative") return "num-negative";
  if (variant === "neutral") return "num-neutral";
  // "auto"
  if (safeValue > 0) return "num-positive";
  if (safeValue < 0) return "num-negative";
  return "num-neutral";
}
