/**
 * Unit tests for src/lib/design/motionTokens.ts
 */

import { describe, it, expect } from "vitest";
import type { Transition } from "framer-motion";
import {
  EASE_OUT_QUART,
  DURATION,
  STAGGER_STEP,
  baseTransition,
  quickTransition,
  fadeUpVariants,
  fadeInVariants,
  scaleInVariants,
  slideInRightVariants,
  staggerVariants,
  withReducedMotion,
} from "./motionTokens";

// ─────────────────────────────────────────────────────────────────────────────
// Timing tokens
// ─────────────────────────────────────────────────────────────────────────────

describe("motion timing tokens", () => {
  it("EASE_OUT_QUART is a 4-tuple cubic-bezier curve", () => {
    expect(EASE_OUT_QUART).toHaveLength(4);
    expect(EASE_OUT_QUART).toEqual([0.2, 0.8, 0.2, 1]);
  });

  it("all durations are under the 400ms ceiling per design spec", () => {
    for (const [name, value] of Object.entries(DURATION)) {
      expect(value, `${name} must be <= 0.4s`).toBeLessThanOrEqual(0.4);
      expect(value, `${name} must be >= 0`).toBeGreaterThanOrEqual(0);
    }
  });

  it("DURATION progression is monotonic (instant ≤ quick ≤ base ≤ slow)", () => {
    expect(DURATION.instant).toBeLessThanOrEqual(DURATION.quick);
    expect(DURATION.quick).toBeLessThanOrEqual(DURATION.base);
    expect(DURATION.base).toBeLessThanOrEqual(DURATION.slow);
  });

  it("STAGGER_STEP is small enough to feel orchestrated, not choppy", () => {
    expect(STAGGER_STEP).toBeGreaterThan(0);
    expect(STAGGER_STEP).toBeLessThanOrEqual(0.08);
  });

  it("baseTransition uses ease-out-quart", () => {
    expect(baseTransition.ease).toEqual(EASE_OUT_QUART);
    expect(baseTransition.duration).toBe(DURATION.base);
  });

  it("quickTransition is faster than baseTransition", () => {
    expect(quickTransition.duration).toBeLessThan(Number(baseTransition.duration));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Variants — structural contract
// ─────────────────────────────────────────────────────────────────────────────

describe("motion variants", () => {
  it("fadeUpVariants animates opacity and y translation", () => {
    expect(fadeUpVariants.initial).toMatchObject({ opacity: 0, y: 8 });
    expect(fadeUpVariants.animate).toMatchObject({ opacity: 1, y: 0 });
  });

  it("fadeInVariants is opacity-only (no transform)", () => {
    expect(fadeInVariants.initial).toEqual({ opacity: 0 });
    expect(fadeInVariants.animate).toEqual({ opacity: 1 });
  });

  it("scaleInVariants starts slightly shrunk and fades in", () => {
    expect(scaleInVariants.initial).toMatchObject({ opacity: 0, scale: 0.96 });
    expect(scaleInVariants.animate).toMatchObject({ opacity: 1, scale: 1 });
  });

  it("slideInRightVariants enters from +x (RTL-aware)", () => {
    // RTL convention: `x: 8` enters from the right side of the viewport.
    expect(slideInRightVariants.initial).toMatchObject({ opacity: 0, x: 8 });
    expect(slideInRightVariants.animate).toMatchObject({ opacity: 1, x: 0 });
  });

  it("staggerVariants orchestrates children using STAGGER_STEP", () => {
    const animate = staggerVariants.animate as {
      transition: { staggerChildren: number };
    };
    expect(animate.transition.staggerChildren).toBe(STAGGER_STEP);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// withReducedMotion — accessibility
// ─────────────────────────────────────────────────────────────────────────────

describe("withReducedMotion", () => {
  const bundle = {
    initial: "initial" as const,
    animate: "animate" as const,
    variants: fadeUpVariants,
    transition: { duration: 0.22, ease: EASE_OUT_QUART },
  };

  it("returns the original bundle when reduced-motion is OFF", () => {
    const result = withReducedMotion(bundle, false);
    expect(result).toBe(bundle); // referential equality — no copy
    expect(result.transition?.duration).toBe(0.22);
  });

  it("zeroes transition duration when reduced-motion is ON", () => {
    const result = withReducedMotion(bundle, true);
    expect(result.transition?.duration).toBe(0);
  });

  it("preserves easing and other transition fields when reducing", () => {
    const result = withReducedMotion(bundle, true);
    expect(result.transition?.ease).toEqual(EASE_OUT_QUART);
  });

  it("handles a bundle with no transition field gracefully", () => {
    const bare: { variants: typeof fadeUpVariants; transition?: Transition } = {
      variants: fadeUpVariants,
    };
    const result = withReducedMotion(bare, true);
    expect(result.transition?.duration).toBe(0);
  });

  it("does not mutate the original bundle when reducing", () => {
    const original = { ...bundle, transition: { ...bundle.transition } };
    withReducedMotion(original, true);
    expect(original.transition.duration).toBe(0.22);
  });
});
