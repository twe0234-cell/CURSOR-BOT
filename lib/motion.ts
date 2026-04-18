/**
 * Motion primitives — הידור הסת״ם Design System (React / DOM layer).
 *
 * Tokens and variants live in `src/lib/design/motionTokens.ts` (pure,
 * unit-tested). This file re-exports them plus the convenience
 * pre-bound bundles (`fadeUp`, `fadeIn`, `scaleIn`, `slideInRight`,
 * `stagger`) ready to spread on `<motion.* />`, and a DOM-aware
 * `prefersReducedMotion()` helper.
 *
 * Usage:
 *   import { motion } from "framer-motion";
 *   import { fadeUp, stagger } from "@/lib/motion";
 *
 *   <motion.ul {...stagger}>
 *     {items.map((it) => (
 *       <motion.li key={it.id} {...fadeUp}>{it.name}</motion.li>
 *     ))}
 *   </motion.ul>
 */

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
  withReducedMotion as withReducedMotionPure,
} from "@/src/lib/design/motionTokens";

export {
  EASE_OUT_QUART,
  DURATION,
  STAGGER_STEP,
  fadeUpVariants,
  fadeInVariants,
  scaleInVariants,
  slideInRightVariants,
  staggerVariants,
};

// ─────────────────────────────────────────────────────────────────────────────
// Pre-bound bundles — spread directly onto <motion.* />.
// ─────────────────────────────────────────────────────────────────────────────

export const fadeUp = {
  initial: "initial" as const,
  animate: "animate" as const,
  exit: "exit" as const,
  variants: fadeUpVariants,
  transition: baseTransition,
};

export const fadeIn = {
  initial: "initial" as const,
  animate: "animate" as const,
  exit: "exit" as const,
  variants: fadeInVariants,
  transition: quickTransition,
};

export const scaleIn = {
  initial: "initial" as const,
  animate: "animate" as const,
  exit: "exit" as const,
  variants: scaleInVariants,
  transition: baseTransition,
};

export const slideInRight = {
  initial: "initial" as const,
  animate: "animate" as const,
  exit: "exit" as const,
  variants: slideInRightVariants,
  transition: baseTransition,
};

export const stagger = {
  initial: "initial" as const,
  animate: "animate" as const,
  variants: staggerVariants,
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM-aware helpers
// ─────────────────────────────────────────────────────────────────────────────

/** True if the user asked the OS to reduce motion. SSR-safe (returns false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Strip motion to instant when the user prefers reduced motion.
 * Thin DOM wrapper around the pure `withReducedMotion` from motionTokens.
 *
 * For SSR or tests, prefer importing the pure version directly from
 * `@/src/lib/design/motionTokens` and passing an explicit `reduced` flag.
 */
export function withReducedMotion<T extends { transition?: Transition }>(
  bundle: T,
): T {
  return withReducedMotionPure(bundle, prefersReducedMotion());
}
