/**
 * Unit tests for src/lib/design/formatNum.ts
 */

import { describe, it, expect } from "vitest";
import {
  formatNum,
  resolveNumColorClass,
  type NumVariant,
} from "./formatNum";

// ─────────────────────────────────────────────────────────────────────────────
// formatNum — SAFE TYPES contract (null/undefined/NaN → 0)
// ─────────────────────────────────────────────────────────────────────────────

describe("formatNum — SAFE TYPES", () => {
  it("coerces null to 0", () => {
    const { safeValue, rendered } = formatNum({ value: null });
    expect(safeValue).toBe(0);
    expect(rendered).toBe("0");
  });

  it("coerces undefined to 0", () => {
    const { safeValue, rendered } = formatNum({ value: undefined });
    expect(safeValue).toBe(0);
    expect(rendered).toBe("0");
  });

  it("coerces NaN to 0", () => {
    const { safeValue, rendered } = formatNum({ value: Number.NaN });
    expect(safeValue).toBe(0);
    expect(rendered).toBe("0");
  });

  it("coerces Infinity to 0", () => {
    const { safeValue } = formatNum({ value: Number.POSITIVE_INFINITY });
    expect(safeValue).toBe(0);
  });

  it("coerces -Infinity to 0", () => {
    const { safeValue } = formatNum({ value: Number.NEGATIVE_INFINITY });
    expect(safeValue).toBe(0);
  });

  it("preserves finite zero", () => {
    const { safeValue, rendered } = formatNum({ value: 0 });
    expect(safeValue).toBe(0);
    expect(rendered).toBe("0");
  });

  it("preserves negative numbers", () => {
    const { safeValue } = formatNum({ value: -1500 });
    expect(safeValue).toBe(-1500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatNum — locale + digits
// ─────────────────────────────────────────────────────────────────────────────

describe("formatNum — locale formatting", () => {
  it("defaults to he-IL locale (thousands grouping)", () => {
    const { rendered } = formatNum({ value: 1234567 });
    // he-IL groups with comma (or locale-specific separator).
    // Assert that SOME grouping character is present and digits survive.
    expect(rendered).toMatch(/1.?234.?567/);
  });

  it("respects maximumFractionDigits=0 by default (rounds)", () => {
    const { rendered } = formatNum({ value: 1.9 });
    expect(rendered).toBe("2");
  });

  it("respects maximumFractionDigits when provided", () => {
    const { rendered } = formatNum({ value: 1.234, maximumFractionDigits: 2 });
    // Intl formats 1.234 → "1.23" under he-IL / en-US; tolerate either separator.
    expect(rendered).toMatch(/1[.,]23/);
  });

  it("honors an explicit locale override (en-US)", () => {
    const { rendered } = formatNum({ value: 1234, locale: "en-US" });
    expect(rendered).toBe("1,234");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatNum — currency
// ─────────────────────────────────────────────────────────────────────────────

describe("formatNum — currency", () => {
  it("does not append ₪ when currency=false", () => {
    const { rendered } = formatNum({ value: 100 });
    expect(rendered).not.toContain("₪");
  });

  it("appends ₪ with U+202F narrow no-break space when currency=true", () => {
    const { rendered } = formatNum({ value: 100, currency: true });
    expect(rendered).toContain("\u202F₪");
    expect(rendered.endsWith("\u202F₪")).toBe(true);
  });

  it("currency formatting still sanitizes null → 0 ₪", () => {
    const { rendered } = formatNum({ value: null, currency: true });
    expect(rendered).toBe("0\u202F₪");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveNumColorClass
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveNumColorClass — explicit variants", () => {
  it("plain returns undefined regardless of value", () => {
    expect(resolveNumColorClass("plain", 100)).toBeUndefined();
    expect(resolveNumColorClass("plain", -100)).toBeUndefined();
    expect(resolveNumColorClass("plain", 0)).toBeUndefined();
  });

  it("positive always returns num-positive", () => {
    expect(resolveNumColorClass("positive", -100)).toBe("num-positive");
    expect(resolveNumColorClass("positive", 0)).toBe("num-positive");
    expect(resolveNumColorClass("positive", 100)).toBe("num-positive");
  });

  it("negative always returns num-negative", () => {
    expect(resolveNumColorClass("negative", -100)).toBe("num-negative");
    expect(resolveNumColorClass("negative", 0)).toBe("num-negative");
    expect(resolveNumColorClass("negative", 100)).toBe("num-negative");
  });

  it("neutral always returns num-neutral", () => {
    expect(resolveNumColorClass("neutral", -100)).toBe("num-neutral");
    expect(resolveNumColorClass("neutral", 0)).toBe("num-neutral");
    expect(resolveNumColorClass("neutral", 100)).toBe("num-neutral");
  });
});

describe("resolveNumColorClass — auto variant", () => {
  it("positive value → num-positive", () => {
    expect(resolveNumColorClass("auto", 1)).toBe("num-positive");
    expect(resolveNumColorClass("auto", 1_000_000)).toBe("num-positive");
  });

  it("negative value → num-negative", () => {
    expect(resolveNumColorClass("auto", -1)).toBe("num-negative");
    expect(resolveNumColorClass("auto", -1_000_000)).toBe("num-negative");
  });

  it("zero → num-neutral", () => {
    expect(resolveNumColorClass("auto", 0)).toBe("num-neutral");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type surface (compile-time + runtime smoke)
// ─────────────────────────────────────────────────────────────────────────────

describe("NumVariant coverage", () => {
  it("every declared variant resolves without throwing", () => {
    const variants: NumVariant[] = [
      "auto",
      "positive",
      "negative",
      "neutral",
      "plain",
    ];
    for (const v of variants) {
      expect(() => resolveNumColorClass(v, 0)).not.toThrow();
      expect(() => resolveNumColorClass(v, 1)).not.toThrow();
      expect(() => resolveNumColorClass(v, -1)).not.toThrow();
    }
  });
});
