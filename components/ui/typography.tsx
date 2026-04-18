/**
 * Typography primitives — הידור הסת״ם Design System
 *
 * Single source of truth for the typographic scale. Use these components
 * instead of ad-hoc `<h1 className="text-2xl">` so the scale stays
 * consistent across every screen.
 *
 * Scale reference (desktop):
 *   Display    48 / 56   Frank Ruhl Libre 700
 *   H1         32 / 40   Frank Ruhl Libre 700
 *   H2         24 / 32   Frank Ruhl Libre 500
 *   H3         20 / 28   Heebo            600
 *   Body-lg    16 / 24   Heebo            400
 *   Body       14 / 22   Heebo            400
 *   Caption    12 / 16   Heebo            500  uppercase tracking-wide
 *
 * Financial numbers use the <Num /> component (tabular mono, sign-aware
 * color, Hebrew locale formatting).
 */

import type {
  ComponentPropsWithoutRef,
  ElementType,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  formatNum,
  resolveNumColorClass,
  type NumVariant,
} from "@/src/lib/design/formatNum";

// ─────────────────────────────────────────────────────────────────────────────
// Shared polymorphic helper
// ─────────────────────────────────────────────────────────────────────────────

type PolymorphicProps<T extends ElementType> = {
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

// ─────────────────────────────────────────────────────────────────────────────
// Display — hero / landing page only. Use sparingly.
// ─────────────────────────────────────────────────────────────────────────────

export function Display<T extends ElementType = "h1">({
  as,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "h1") as ElementType;
  return (
    <Component className={cn("type-display text-foreground", className)} {...rest}>
      {children}
    </Component>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Headings
// ─────────────────────────────────────────────────────────────────────────────

export function H1<T extends ElementType = "h1">({
  as,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "h1") as ElementType;
  return (
    <Component className={cn("type-h1 text-foreground", className)} {...rest}>
      {children}
    </Component>
  );
}

export function H2<T extends ElementType = "h2">({
  as,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "h2") as ElementType;
  return (
    <Component className={cn("type-h2 text-foreground", className)} {...rest}>
      {children}
    </Component>
  );
}

export function H3<T extends ElementType = "h3">({
  as,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "h3") as ElementType;
  return (
    <Component className={cn("type-h3 text-foreground", className)} {...rest}>
      {children}
    </Component>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Body / Caption
// ─────────────────────────────────────────────────────────────────────────────

export function Body<T extends ElementType = "p">({
  as,
  size = "md",
  muted = false,
  className,
  children,
  ...rest
}: PolymorphicProps<T> & { size?: "md" | "lg"; muted?: boolean }) {
  const Component = (as ?? "p") as ElementType;
  return (
    <Component
      className={cn(
        size === "lg" ? "type-body-lg" : "type-body",
        muted ? "text-muted-foreground" : "text-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

export function Caption<T extends ElementType = "span">({
  as,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "span") as ElementType;
  return (
    <Component
      className={cn("type-caption text-muted-foreground", className)}
      {...rest}
    >
      {children}
    </Component>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Num — financial / tabular numbers.
//
// - Uses monospace tabular-nums for perfect column alignment.
// - Formats with Hebrew locale by default (`he-IL`).
// - Optional `currency` prop appends `₪` with a thin space.
// - `variant` colors the number semantically (see NumVariant).
//
// Formatting logic is in src/lib/design/formatNum.ts (pure, tested).
// ─────────────────────────────────────────────────────────────────────────────

export type { NumVariant };

export function Num({
  value,
  currency = false,
  variant = "plain",
  locale = "he-IL",
  maximumFractionDigits = 0,
  className,
  "aria-label": ariaLabel,
  ...rest
}: Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  value: number | null | undefined;
  currency?: boolean;
  variant?: NumVariant;
  locale?: string;
  maximumFractionDigits?: number;
}) {
  const { safeValue, rendered } = formatNum({
    value,
    currency,
    locale,
    maximumFractionDigits,
  });
  const colorClass = resolveNumColorClass(variant, safeValue);

  return (
    <span
      className={cn("num", colorClass, className)}
      aria-label={ariaLabel ?? rendered}
      {...rest}
    >
      {rendered}
    </span>
  );
}
