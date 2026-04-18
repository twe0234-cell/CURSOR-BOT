/**
 * Motion tokens — pure, no DOM, no React.
 * Imported by lib/motion.ts (framer wrapper) and by tests.
 *
 * Keep this file free of React / DOM so it can be exercised in a
 * Node-only vitest environment.
 */

import type { Transition, Variants } from "framer-motion";

export const EASE_OUT_QUART = [0.2, 0.8, 0.2, 1] as const;

export const DURATION = {
  instant: 0,
  quick: 0.14,
  base: 0.22,
  slow: 0.32,
} as const;

export const STAGGER_STEP = 0.04;

export const baseTransition: Transition = {
  duration: DURATION.base,
  ease: EASE_OUT_QUART,
};

export const quickTransition: Transition = {
  duration: DURATION.quick,
  ease: EASE_OUT_QUART,
};

// ── Variants ─────────────────────────────────────────────────────────────────

export const fadeUpVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
};

export const fadeInVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const scaleInVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

export const slideInRightVariants: Variants = {
  initial: { opacity: 0, x: 8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 8 },
};

export const staggerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: STAGGER_STEP,
      delayChildren: 0.02,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Reduced-motion — pure function.
// Accepts an explicit `reduced` flag so it can be unit-tested without a DOM.
// ─────────────────────────────────────────────────────────────────────────────

export function withReducedMotion<T extends { transition?: Transition }>(
  bundle: T,
  reduced: boolean,
): T {
  if (!reduced) return bundle;
  return {
    ...bundle,
    transition: { ...(bundle.transition ?? {}), duration: 0 },
  };
}
